'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  createMissionOrchestrator,
  findNextEligibleFeature,
  isMilestoneComplete,
  getMilestones,
} = require(
  path.join(__dirname, '..', '..', '..', '.claude', 'lib', 'mission', 'mission-orchestrator.cjs')
);

let tmpDir;

function scaffoldMission(features = [], state = {}) {
  const missionDir = path.join(tmpDir, 'mission-test');
  fs.mkdirSync(missionDir, { recursive: true });
  fs.mkdirSync(path.join(missionDir, 'handoffs'), { recursive: true });
  fs.mkdirSync(path.join(missionDir, 'evidence'), { recursive: true });

  fs.writeFileSync(
    path.join(missionDir, 'features.json'),
    JSON.stringify({ features }, null, 2),
    'utf8'
  );

  const defaultState = {
    missionId: 'test-mission',
    baseSessionId: 'test-session',
    state: 'pending',
    workingDirectory: tmpDir,
    currentFeatureId: null,
    currentWorkerSessionId: null,
    currentWorkerPid: null,
    workerSessionIds: [],
    completedFeatures: 0,
    totalFeatures: features.length,
    milestonesWithValidationPlanned: [],
    lastReviewedHandoffCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...state,
  };

  fs.writeFileSync(
    path.join(missionDir, 'state.json'),
    JSON.stringify(defaultState, null, 2),
    'utf8'
  );

  fs.writeFileSync(
    path.join(missionDir, 'validation-state.json'),
    JSON.stringify({ assertions: {} }, null, 2),
    'utf8'
  );

  fs.writeFileSync(path.join(missionDir, 'progress_log.jsonl'), '', 'utf8');

  return missionDir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('findNextEligibleFeature', () => {
  it('returns first pending feature with no preconditions', () => {
    const features = [
      { id: 'f1', status: 'completed', preconditions: [] },
      { id: 'f2', status: 'pending', preconditions: [] },
      { id: 'f3', status: 'pending', preconditions: [] },
    ];
    const next = findNextEligibleFeature(features);
    assert.equal(next.id, 'f2');
  });

  it('respects preconditions', () => {
    const features = [
      { id: 'f1', status: 'pending', preconditions: ['f0 completed'] },
      { id: 'f2', status: 'pending', preconditions: [] },
    ];
    const next = findNextEligibleFeature(features);
    assert.equal(next.id, 'f2');
  });

  it('returns null when all pending have unmet preconditions', () => {
    const features = [{ id: 'f1', status: 'pending', preconditions: ['f0 completed'] }];
    const next = findNextEligibleFeature(features);
    assert.equal(next, null);
  });

  it('returns null when all features completed', () => {
    const features = [{ id: 'f1', status: 'completed', preconditions: [] }];
    const next = findNextEligibleFeature(features);
    assert.equal(next, null);
  });
});

describe('isMilestoneComplete', () => {
  it('returns true when all non-validator features completed', () => {
    const features = [
      { id: 'f1', milestone: 'ms1', status: 'completed' },
      { id: 'f2', milestone: 'ms1', status: 'completed' },
      { id: 'scrutiny-validator-ms1', milestone: 'ms1', status: 'pending' },
    ];
    assert.ok(isMilestoneComplete(features, 'ms1'));
  });

  it('returns false when some features still pending', () => {
    const features = [
      { id: 'f1', milestone: 'ms1', status: 'completed' },
      { id: 'f2', milestone: 'ms1', status: 'pending' },
    ];
    assert.ok(!isMilestoneComplete(features, 'ms1'));
  });
});

describe('getMilestones', () => {
  it('returns unique milestone names', () => {
    const features = [
      { id: 'f1', milestone: 'ms1' },
      { id: 'f2', milestone: 'ms2' },
      { id: 'f3', milestone: 'ms1' },
    ];
    const milestones = getMilestones(features);
    assert.deepEqual(milestones.sort(), ['ms1', 'ms2']);
  });
});

describe('createMissionOrchestrator', () => {
  it('throws on missing mission directory', () => {
    assert.throws(
      () => createMissionOrchestrator(path.join(tmpDir, 'missing-mission')),
      /does not exist/
    );
  });

  it('throws when mission path is not a directory', () => {
    const missionPath = path.join(tmpDir, 'mission-file');
    fs.writeFileSync(missionPath, 'not a mission directory', 'utf8');

    assert.throws(() => createMissionOrchestrator(missionPath), /does not exist/);
  });

  it('initialize() transitions pending → running', () => {
    const missionDir = scaffoldMission([
      {
        id: 'f1',
        status: 'pending',
        preconditions: [],
        milestone: 'ms1',
        description: 'test',
        skillName: 'dev',
        expectedBehavior: ['x'],
        verificationSteps: [],
      },
    ]);

    const orch = createMissionOrchestrator(missionDir);
    const { state } = orch.initialize();
    assert.equal(state.state, 'running');
  });

  it('selectNextFeature() returns and marks feature in_progress', () => {
    const missionDir = scaffoldMission([
      {
        id: 'f1',
        status: 'pending',
        preconditions: [],
        milestone: 'ms1',
        description: 'test',
        skillName: 'dev',
        expectedBehavior: ['x'],
        verificationSteps: [],
      },
    ]);

    const orch = createMissionOrchestrator(missionDir);
    orch.initialize();
    const { feature, workerSessionId } = orch.selectNextFeature();

    assert.equal(feature.id, 'f1');
    assert.ok(workerSessionId);

    // Verify feature status updated on disk
    const updated = JSON.parse(fs.readFileSync(path.join(missionDir, 'features.json'), 'utf8'));
    assert.equal(updated.features[0].status, 'in_progress');
  });

  it('processHandoff() completes a feature', () => {
    const missionDir = scaffoldMission([
      {
        id: 'f1',
        status: 'in_progress',
        preconditions: [],
        milestone: 'ms1',
        description: 'test',
        skillName: 'dev',
        expectedBehavior: ['x'],
        verificationSteps: [],
        currentWorkerSessionId: 'ws-1',
        workerSessionIds: ['ws-1'],
      },
    ]);

    const orch = createMissionOrchestrator(missionDir);
    const result = orch.processHandoff({
      featureId: 'f1',
      workerSessionId: 'ws-1',
      commitId: 'abc1234',
      successState: 'success',
      returnToOrchestrator: true,
      milestone: 'ms1',
      timestamp: new Date().toISOString(),
      handoff: {
        salientSummary: 'Done',
        whatWasImplemented: 'Everything',
        whatWasLeftUndone: '',
        verification: { commandsRun: [] },
        tests: {},
        discoveredIssues: [],
        skillFeedback: { followedProcedure: true, deviations: [] },
      },
    });

    assert.ok(result.success);
    assert.equal(result.milestone, 'ms1');
    assert.ok(result.milestoneComplete);
  });

  it('getProgress() returns correct summary', () => {
    const missionDir = scaffoldMission([
      {
        id: 'f1',
        status: 'completed',
        preconditions: [],
        milestone: 'ms1',
        description: 'a',
        skillName: 'dev',
        expectedBehavior: ['x'],
        verificationSteps: [],
      },
      {
        id: 'f2',
        status: 'pending',
        preconditions: ['f1 completed'],
        milestone: 'ms2',
        description: 'b',
        skillName: 'dev',
        expectedBehavior: ['y'],
        verificationSteps: [],
      },
    ]);

    const orch = createMissionOrchestrator(missionDir);
    const progress = orch.getProgress();

    assert.equal(progress.features.total, 2);
    assert.equal(progress.features.completed, 1);
    assert.equal(progress.features.pending, 1);
  });

  it('pause() sets state to paused', () => {
    const missionDir = scaffoldMission([], { state: 'running' });
    const orch = createMissionOrchestrator(missionDir);
    orch.pause('test pause');

    const state = JSON.parse(fs.readFileSync(path.join(missionDir, 'state.json'), 'utf8'));
    assert.equal(state.state, 'paused');
  });
});
