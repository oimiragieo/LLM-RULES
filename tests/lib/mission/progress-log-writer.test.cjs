'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createProgressLogWriter, readEvents, getEventCount, VALID_EVENT_TYPES } = require(
  path.join(__dirname, '..', '..', '..', '.claude', 'lib', 'mission', 'progress-log-writer.cjs')
);

let tmpDir;
let logPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plw-test-'));
  logPath = path.join(tmpDir, 'progress_log.jsonl');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createProgressLogWriter', () => {
  it('throws on missing logFilePath', () => {
    assert.throws(() => createProgressLogWriter(), /logFilePath is required/);
    assert.throws(() => createProgressLogWriter(null), /logFilePath is required/);
  });

  it('returns an object with all event methods', () => {
    const writer = createProgressLogWriter(logPath);
    assert.equal(typeof writer.logMissionAccepted, 'function');
    assert.equal(typeof writer.logWorkerStarted, 'function');
    assert.equal(typeof writer.logWorkerCompleted, 'function');
    assert.equal(typeof writer.logWorkerFailed, 'function');
    assert.equal(typeof writer.logMilestoneValidationTriggered, 'function');
    assert.equal(typeof writer.logMissionCompleted, 'function');
    assert.equal(typeof writer.readEvents, 'function');
    assert.equal(typeof writer.getEventCount, 'function');
  });
});

describe('Event type logging', () => {
  it('logMissionAccepted produces correct shape', () => {
    const writer = createProgressLogWriter(logPath);
    const event = writer.logMissionAccepted({ missionId: 'mis_test', message: 'Started' });
    assert.equal(event.type, 'mission_accepted');
    assert.equal(event.missionId, 'mis_test');
    assert.equal(event.message, 'Started');
    assert.ok(event.timestamp);
    assert.ok(new Date(event.timestamp).toISOString() === event.timestamp);
  });

  it('logWorkerSelectedFeature produces correct shape', () => {
    const writer = createProgressLogWriter(logPath);
    const event = writer.logWorkerSelectedFeature({
      featureId: 'fts5-search',
      workerSessionId: '00000000-0000-0000-0000-000000000001',
    });
    assert.equal(event.type, 'worker_selected_feature');
    assert.equal(event.featureId, 'fts5-search');
    assert.equal(event.workerSessionId, '00000000-0000-0000-0000-000000000001');
  });

  it('logWorkerStarted produces correct shape', () => {
    const writer = createProgressLogWriter(logPath);
    const event = writer.logWorkerStarted({
      featureId: 'fts5-search',
      workerSessionId: '00000000-0000-0000-0000-000000000001',
      spawnId: 'worker_abc123',
    });
    assert.equal(event.type, 'worker_started');
    assert.equal(event.spawnId, 'worker_abc123');
  });

  it('logWorkerCompleted produces correct shape', () => {
    const writer = createProgressLogWriter(logPath);
    const event = writer.logWorkerCompleted({
      featureId: 'fts5-search',
      workerSessionId: '00000000-0000-0000-0000-000000000001',
      commitId: 'abc1234',
      exitCode: 0,
      successState: 'success',
      validatorsPassed: true,
      returnToOrchestrator: true,
      handoff: { salientSummary: 'Done' },
    });
    assert.equal(event.type, 'worker_completed');
    assert.equal(event.commitId, 'abc1234');
    assert.equal(event.exitCode, 0);
    assert.equal(event.successState, 'success');
  });

  it('logWorkerFailed produces correct shape', () => {
    const writer = createProgressLogWriter(logPath);
    const event = writer.logWorkerFailed({
      workerSessionId: '00000000-0000-0000-0000-000000000001',
      spawnId: 'worker_abc123',
      reason: 'timeout',
    });
    assert.equal(event.type, 'worker_failed');
    assert.equal(event.reason, 'timeout');
  });

  it('logMilestoneValidationTriggered produces correct shape', () => {
    const writer = createProgressLogWriter(logPath);
    const event = writer.logMilestoneValidationTriggered({ milestone: 'memory-v2' });
    assert.equal(event.type, 'milestone_validation_triggered');
    assert.equal(event.milestone, 'memory-v2');
  });

  it('logMissionCompleted produces correct shape', () => {
    const writer = createProgressLogWriter(logPath);
    const event = writer.logMissionCompleted({ completedFeatures: 49, totalFeatures: 49 });
    assert.equal(event.type, 'mission_completed');
    assert.equal(event.completedFeatures, 49);
  });

  it('logMissionPaused produces correct shape', () => {
    const writer = createProgressLogWriter(logPath);
    const event = writer.logMissionPaused({ reason: 'daemon unavailable' });
    assert.equal(event.type, 'mission_paused');
    assert.equal(event.reason, 'daemon unavailable');
  });
});

describe('Reading and counting events', () => {
  it('readEvents returns all events', () => {
    const writer = createProgressLogWriter(logPath);
    writer.logMissionAccepted({ missionId: 'mis_1', message: 'Start' });
    writer.logWorkerStarted({ featureId: 'f1', workerSessionId: 'ws1', spawnId: 's1' });
    writer.logMissionPaused({ reason: 'test' });

    const events = writer.readEvents();
    assert.equal(events.length, 3);
    assert.equal(events[0].type, 'mission_accepted');
    assert.equal(events[1].type, 'worker_started');
    assert.equal(events[2].type, 'mission_paused');
  });

  it('readEvents with type filter', () => {
    const writer = createProgressLogWriter(logPath);
    writer.logMissionAccepted({ missionId: 'mis_1', message: 'Start' });
    writer.logWorkerStarted({ featureId: 'f1', workerSessionId: 'ws1', spawnId: 's1' });
    writer.logWorkerStarted({ featureId: 'f2', workerSessionId: 'ws2', spawnId: 's2' });

    const filtered = writer.readEvents('worker_started');
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every(e => e.type === 'worker_started'));
  });

  it('getEventCount is accurate', () => {
    const writer = createProgressLogWriter(logPath);
    assert.equal(writer.getEventCount(), 0);
    writer.logMissionAccepted({ missionId: 'mis_1', message: 'Start' });
    assert.equal(writer.getEventCount(), 1);
    writer.logMissionPaused({ reason: 'test' });
    assert.equal(writer.getEventCount(), 2);
  });

  it('handles missing log file gracefully', () => {
    const events = readEvents('/nonexistent/path.jsonl');
    assert.deepEqual(events, []);
    assert.equal(getEventCount('/nonexistent/path.jsonl'), 0);
  });

  it('handles corrupt lines gracefully', () => {
    fs.writeFileSync(
      logPath,
      '{"type":"mission_accepted","timestamp":"2026-01-01T00:00:00.000Z"}\nnot json\n{"type":"mission_paused","timestamp":"2026-01-01T00:01:00.000Z"}\n',
      'utf8'
    );
    const events = readEvents(logPath);
    assert.equal(events.length, 2);
  });
});

describe('VALID_EVENT_TYPES', () => {
  it('has exactly 15 event types', () => {
    assert.equal(VALID_EVENT_TYPES.size, 15);
  });

  it('includes all expected types', () => {
    const expected = [
      'mission_accepted',
      'mission_run_started',
      'worker_selected_feature',
      'worker_started',
      'worker_completed',
      'worker_failed',
      'handoff_items_dismissed',
      'milestone_validation_triggered',
      'scrutiny_validator_completed',
      'user_testing_validator_completed',
      'mission_paused',
      'mission_completed',
      'evidence_collected',
      'mission_graded',
      'validation_contract_generated',
    ];
    for (const type of expected) {
      assert.ok(VALID_EVENT_TYPES.has(type), `should include ${type}`);
    }
  });
});
