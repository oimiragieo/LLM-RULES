#!/usr/bin/env node
'use strict';

/**
 * Full Pipeline Integration Tests
 * =================================
 *
 * VAL-CROSS-001: Full Mission Lifecycle — Create to Milestone Complete
 *   Wire all modules: provisionWorkspace -> load features (1 milestone, 2 features) ->
 *   transition features pending->in_progress -> write handoff files to workspace/handoffs/ ->
 *   run ScrutinyReviewer with 'echo pass' verification steps -> transition validating->completed ->
 *   MilestoneGate.evaluate() returns passed:true. Assert handoffs on disk, gate passed.
 *
 * VAL-CROSS-003: Validation Rejection and Friction Loop Revival
 *   Feature-X dispatched, handoff written, ScrutinyReviewer with failing verification steps
 *   ('exit 1') returns rejected verdict. Transition to failed. FrictionLoopEngine receives
 *   validation-failed event, emits re-enqueued with strategy:retry. Transition
 *   failed->pending->in_progress. Round 2: ScrutinyReviewer passes. Completed.
 *   Assert 2 rounds, re-enqueued event, blocking issues in round-2 context.
 *
 * VAL-CROSS-004: Milestone Boundary Gate — Sequential Milestone Progression
 *   features.json with 2 milestones (M1: features A, B; M2: features C, D).
 *   Complete M1, evaluate gate. Then dispatch M2.
 *   Assert no M2 feature in_progress while M1 incomplete.
 *   Both milestone gate evaluations return passed:true.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { FeaturesStateMachine } = require('../../.claude/lib/mission/features-state-machine.cjs');
const { ScrutinyReviewer } = require('../../.claude/lib/mission/scrutiny-reviewer.cjs');
const { FrictionLoopEngine } = require('../../.claude/lib/mission/friction-loop.cjs');
const { MilestoneGate } = require('../../.claude/lib/mission/milestone-gate.cjs');
const { createMockDb, createMockEnqueue } = require('./helpers/mock-factory.cjs');

// ---------------------------------------------------------------------------
// VAL-CROSS-001: Full Mission Lifecycle — Create to Milestone Complete
// ---------------------------------------------------------------------------

describe('VAL-CROSS-001: Full Mission Lifecycle — Create to Milestone Complete', () => {
  let workspacePath;
  let featuresPath;
  let statePath;
  let handoffsDir;
  let fsm;
  let gateResult;

  /** ScrutinyReviewer verdicts keyed by featureId */
  const verdicts = {};

  before(async () => {
    // 1. Provision workspace
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'full-lifecycle-'));
    featuresPath = path.join(workspacePath, 'features.json');
    statePath = path.join(workspacePath, 'validation-state.json');
    handoffsDir = path.join(workspacePath, 'handoffs');
    fs.mkdirSync(handoffsDir);

    // 2. Write features.json: 1 milestone, 2 features
    const featuresData = {
      features: [
        {
          id: 'feature-1',
          description: 'First feature in the lifecycle test',
          status: 'pending',
          milestone: 'test-milestone',
          preconditions: [],
        },
        {
          id: 'feature-2',
          description: 'Second feature in the lifecycle test',
          status: 'pending',
          milestone: 'test-milestone',
          preconditions: [],
        },
      ],
    };
    fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');

    // 3. Load FeaturesStateMachine
    fsm = new FeaturesStateMachine(featuresPath);
    fsm.load();

    // 4. Process each feature: dispatch -> handoff -> scrutiny -> complete
    for (const featureId of ['feature-1', 'feature-2']) {
      // pending -> in_progress
      fsm.transition(featureId, 'in_progress');

      // Write handoff artifact (simulated worker output)
      const handoffPath = path.join(handoffsDir, `${featureId}.json`);
      fs.writeFileSync(
        handoffPath,
        JSON.stringify({
          featureId,
          status: 'done',
          files: ['mock.js'],
          completedAt: new Date().toISOString(),
        }),
        'utf8'
      );

      // Run ScrutinyReviewer with passing verification step
      const reviewer = new ScrutinyReviewer({
        featureId,
        featuresPath,
        verificationSteps: ['echo pass'],
        missionDir: workspacePath,
        stepTimeoutMs: 5000,
        overallTimeoutMs: 30000,
      });
      verdicts[featureId] = await reviewer.run();

      // Approved: in_progress -> validating -> completed
      fsm.transition(featureId, 'validating');
      fsm.transition(featureId, 'completed');
    }

    // 5. Evaluate milestone gate
    const gate = new MilestoneGate({
      milestone: 'test-milestone',
      featuresPath,
      statePath,
    });
    gateResult = await gate.evaluate();
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('both features reach completed status via valid transition chain', () => {
    assert.equal(fsm.getFeature('feature-1').status, 'completed', 'feature-1 must be completed');
    assert.equal(fsm.getFeature('feature-2').status, 'completed', 'feature-2 must be completed');
  });

  it('handoff artifact files exist on disk in workspace/handoffs/ for every feature', () => {
    assert.ok(
      fs.existsSync(path.join(handoffsDir, 'feature-1.json')),
      'feature-1 handoff must exist on disk'
    );
    assert.ok(
      fs.existsSync(path.join(handoffsDir, 'feature-2.json')),
      'feature-2 handoff must exist on disk'
    );
  });

  it('ScrutinyReviewer returns approved verdict for echo-pass verification steps', () => {
    assert.equal(verdicts['feature-1'].verdict, 'approved', 'feature-1 scrutiny must be approved');
    assert.equal(verdicts['feature-2'].verdict, 'approved', 'feature-2 scrutiny must be approved');
  });

  it('MilestoneGate.evaluate() returns passed:true', () => {
    assert.equal(
      gateResult.passed,
      true,
      `Gate must pass — blocking: ${JSON.stringify(gateResult.blocking)}`
    );
  });

  it('gate blocking list is empty when all features completed', () => {
    assert.equal(gateResult.blocking.length, 0, 'No blocking items when all features completed');
  });

  it('no feature remains in non-terminal (pending/in_progress/validating/failed) state', () => {
    for (const feature of fsm.getAllFeatures()) {
      assert.equal(
        feature.status,
        'completed',
        `Feature ${feature.id} should be completed, got: ${feature.status}`
      );
    }
  });

  it('each feature has startedAt and completedAt timestamps', () => {
    for (const featureId of ['feature-1', 'feature-2']) {
      const feature = fsm.getFeature(featureId);
      assert.ok(feature.startedAt, `${featureId} must have startedAt`);
      assert.ok(feature.completedAt, `${featureId} must have completedAt`);
    }
  });
});

// ---------------------------------------------------------------------------
// VAL-CROSS-003: Validation Rejection and Friction Loop Revival
// ---------------------------------------------------------------------------

describe('VAL-CROSS-003: Validation Rejection and Friction Loop Revival', () => {
  let workspacePath;
  let featuresPath;
  let handoffsDir;
  let fsm;
  let frictionLoop;

  /** Round 1 scrutiny verdict (rejected) */
  let round1Verdict;
  /** Round 2 scrutiny verdict (approved) */
  let round2Verdict;
  /** Captured re-enqueued events from friction loop */
  const reEnqueuedEvents = [];
  /** The payload from the first re-enqueued event */
  let reEnqueuedPayload;
  /** Context passed to round-2 dispatch (contains blocking issues from round 1) */
  let round2Context;

  before(async () => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'friction-revival-'));
    featuresPath = path.join(workspacePath, 'features.json');
    handoffsDir = path.join(workspacePath, 'handoffs');
    fs.mkdirSync(handoffsDir);

    const featuresData = {
      features: [
        {
          id: 'feature-x',
          description: 'Feature X for friction loop revival test',
          status: 'pending',
          milestone: 'test-milestone',
          preconditions: [],
        },
      ],
    };
    fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');

    fsm = new FeaturesStateMachine(featuresPath);
    fsm.load();

    // Set up FrictionLoopEngine with mock dependencies
    const mockDb = createMockDb();
    const mockEnqueue = createMockEnqueue();
    frictionLoop = new FrictionLoopEngine({ db: mockDb, enqueueFn: mockEnqueue });
    frictionLoop.start();

    // ── ROUND 1: failing scrutiny ──────────────────────────────────────────

    // pending -> in_progress (dispatch)
    fsm.transition('feature-x', 'in_progress');

    // Write round-1 handoff (simulated worker output with defect)
    fs.writeFileSync(
      path.join(handoffsDir, 'feature-x-r1.json'),
      JSON.stringify({ featureId: 'feature-x', status: 'done', round: 1 }),
      'utf8'
    );

    // Run ScrutinyReviewer with failing verification step
    const reviewer1 = new ScrutinyReviewer({
      featureId: 'feature-x',
      featuresPath,
      verificationSteps: ['exit 1'],
      missionDir: workspacePath,
      stepTimeoutMs: 5000,
      overallTimeoutMs: 30000,
    });
    round1Verdict = await reviewer1.run();

    // Rejected: in_progress -> failed
    fsm.transition('feature-x', 'failed');

    // Friction loop receives validation-failed event; wait for re-enqueued
    const reEnqueuedPromise = new Promise(resolve => {
      frictionLoop.once('re-enqueued', payload => {
        reEnqueuedEvents.push(payload);
        resolve(payload);
      });
    });

    frictionLoop.emit('validation-failed', {
      originalContext: {
        featureId: 'feature-x',
        skillName: 'test-skill',
        iteration: 0,
        blockingIssues: round1Verdict.failures,
      },
      error: new Error(`Scrutiny rejected: ${round1Verdict.summary}`),
      stderr: JSON.stringify(round1Verdict.failures),
    });

    reEnqueuedPayload = await reEnqueuedPromise;

    // failed -> pending (re-enqueued for retry)
    fsm.transition('feature-x', 'pending');

    // ── ROUND 2: passing scrutiny ──────────────────────────────────────────

    // Build round-2 dispatch context (includes blocking issues from round 1)
    round2Context = {
      featureId: 'feature-x',
      blockingIssues: round1Verdict.failures,
      stderrDump: reEnqueuedPayload.stderrDump,
      previousRound: 1,
    };

    // pending -> in_progress (re-dispatch with round-2 context)
    fsm.transition('feature-x', 'in_progress');

    // Write round-2 handoff (simulated fixed worker output)
    fs.writeFileSync(
      path.join(handoffsDir, 'feature-x-r2.json'),
      JSON.stringify({
        featureId: 'feature-x',
        status: 'done',
        round: 2,
        addressedIssues: round2Context.blockingIssues,
      }),
      'utf8'
    );

    // Run ScrutinyReviewer with passing verification step
    const reviewer2 = new ScrutinyReviewer({
      featureId: 'feature-x',
      featuresPath,
      verificationSteps: ['echo pass'],
      missionDir: workspacePath,
      stepTimeoutMs: 5000,
      overallTimeoutMs: 30000,
    });
    round2Verdict = await reviewer2.run();

    // Approved: in_progress -> validating -> completed
    fsm.transition('feature-x', 'validating');
    fsm.transition('feature-x', 'completed');

    frictionLoop.stop();
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('round-1 ScrutinyReviewer returns rejected verdict for failing step', () => {
    assert.equal(round1Verdict.verdict, 'rejected', 'Round 1 must be rejected');
    assert.ok(round1Verdict.failures.length > 0, 'Round 1 must have at least one failure');
  });

  it('round-1 failure recorded: feature retryCount incremented after failed transition', () => {
    const feature = fsm.getFeature('feature-x');
    assert.ok(
      feature.retryCount >= 1,
      `retryCount should be >= 1 after one failed round, got: ${feature.retryCount}`
    );
  });

  it('FrictionLoopEngine emitted exactly one re-enqueued event with strategy:retry', () => {
    assert.equal(reEnqueuedEvents.length, 1, 'Exactly one re-enqueued event must be emitted');
    assert.equal(reEnqueuedPayload.strategy, 'retry', 'Re-enqueued strategy must be retry');
  });

  it('re-dispatched worker context includes blocking issues from round 1', () => {
    assert.ok(
      Array.isArray(round2Context.blockingIssues),
      'round2Context.blockingIssues must be an array'
    );
    assert.ok(
      round2Context.blockingIssues.length > 0,
      'round2Context.blockingIssues must be non-empty'
    );
    // stderrDump in the re-enqueued payload encodes the round-1 blocking issues
    assert.ok(
      typeof reEnqueuedPayload.stderrDump === 'string',
      'reEnqueuedPayload.stderrDump must be a string'
    );
    assert.ok(
      reEnqueuedPayload.stderrDump.length > 0,
      'reEnqueuedPayload.stderrDump must be non-empty'
    );
  });

  it('round-2 ScrutinyReviewer returns approved verdict for passing step', () => {
    assert.equal(round2Verdict.verdict, 'approved', 'Round 2 must be approved');
  });

  it('feature-x reaches completed status after 2 scrutiny rounds', () => {
    assert.equal(
      fsm.getFeature('feature-x').status,
      'completed',
      'feature-x must be completed after the friction loop revival'
    );
  });

  it('2-round lifecycle: round-1 rejected, round-2 approved, feature completed', () => {
    assert.equal(round1Verdict.verdict, 'rejected', 'Round 1 verdict must be rejected');
    assert.equal(round2Verdict.verdict, 'approved', 'Round 2 verdict must be approved');
    assert.equal(fsm.getFeature('feature-x').status, 'completed', 'Final status must be completed');
  });
});

// ---------------------------------------------------------------------------
// VAL-CROSS-004: Milestone Boundary Gate — Sequential Milestone Progression
// ---------------------------------------------------------------------------

describe('VAL-CROSS-004: Milestone Boundary Gate — Sequential Milestone Progression', () => {
  let workspacePath;
  let featuresPath;
  let statePath;
  let fsm;
  let m1GateResult;
  let m2GateResult;

  /** Status snapshot of M2 features taken just before M1 features are dispatched */
  let m2StatusBeforeM1Dispatch;
  /** Status snapshot of M2 features taken just before M1 gate evaluation */
  let m2StatusAtM1GateEval;

  before(async () => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'milestone-boundary-'));
    featuresPath = path.join(workspacePath, 'features.json');
    statePath = path.join(workspacePath, 'validation-state.json');

    const featuresData = {
      features: [
        {
          id: 'm1-feature-a',
          description: 'M1 Feature A',
          status: 'pending',
          milestone: 'milestone-1',
          preconditions: [],
        },
        {
          id: 'm1-feature-b',
          description: 'M1 Feature B',
          status: 'pending',
          milestone: 'milestone-1',
          preconditions: [],
        },
        {
          id: 'm2-feature-c',
          description: 'M2 Feature C',
          status: 'pending',
          milestone: 'milestone-2',
          preconditions: [],
        },
        {
          id: 'm2-feature-d',
          description: 'M2 Feature D',
          status: 'pending',
          milestone: 'milestone-2',
          preconditions: [],
        },
      ],
    };
    fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');

    fsm = new FeaturesStateMachine(featuresPath);
    fsm.load();

    // Capture M2 status before any M1 dispatch
    m2StatusBeforeM1Dispatch = {
      'feature-c': fsm.getFeature('m2-feature-c').status,
      'feature-d': fsm.getFeature('m2-feature-d').status,
    };

    // ── M1 PHASE: dispatch and complete M1 features only ──────────────────
    for (const featureId of ['m1-feature-a', 'm1-feature-b']) {
      // Only dispatch M1-milestone features while M1 is active
      fsm.transition(featureId, 'in_progress');
      fsm.transition(featureId, 'validating');
      fsm.transition(featureId, 'completed');
    }

    // Capture M2 status just before evaluating M1 gate
    m2StatusAtM1GateEval = {
      'feature-c': fsm.getFeature('m2-feature-c').status,
      'feature-d': fsm.getFeature('m2-feature-d').status,
    };

    // Evaluate M1 gate
    const m1Gate = new MilestoneGate({
      milestone: 'milestone-1',
      featuresPath,
      statePath,
    });
    m1GateResult = await m1Gate.evaluate();

    // ── M2 PHASE: dispatch and complete M2 features after M1 gate passes ──
    assert.equal(m1GateResult.passed, true, 'Prerequisite: M1 gate must pass before M2 dispatch');

    for (const featureId of ['m2-feature-c', 'm2-feature-d']) {
      fsm.transition(featureId, 'in_progress');
      fsm.transition(featureId, 'validating');
      fsm.transition(featureId, 'completed');
    }

    // Evaluate M2 gate
    const m2Gate = new MilestoneGate({
      milestone: 'milestone-2',
      featuresPath,
      statePath,
    });
    m2GateResult = await m2Gate.evaluate();
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('M2 features were pending (not in_progress) before M1 dispatch began', () => {
    assert.equal(
      m2StatusBeforeM1Dispatch['feature-c'],
      'pending',
      'M2 feature-c must be pending before M1 dispatch'
    );
    assert.equal(
      m2StatusBeforeM1Dispatch['feature-d'],
      'pending',
      'M2 feature-d must be pending before M1 dispatch'
    );
  });

  it('M2 features were still pending (never in_progress) when M1 gate was evaluated', () => {
    assert.equal(
      m2StatusAtM1GateEval['feature-c'],
      'pending',
      'M2 feature-c must remain pending until after M1 gate evaluation'
    );
    assert.equal(
      m2StatusAtM1GateEval['feature-d'],
      'pending',
      'M2 feature-d must remain pending until after M1 gate evaluation'
    );
  });

  it('M1 gate evaluation returns passed:true after M1 features complete', () => {
    assert.equal(
      m1GateResult.passed,
      true,
      `M1 gate must pass — blocking: ${JSON.stringify(m1GateResult.blocking)}`
    );
  });

  it('M2 features startedAt timestamps are after all M1 features completedAt timestamps', () => {
    const m1aCompletedAt = new Date(fsm.getFeature('m1-feature-a').completedAt).getTime();
    const m1bCompletedAt = new Date(fsm.getFeature('m1-feature-b').completedAt).getTime();
    const latestM1Completed = Math.max(m1aCompletedAt, m1bCompletedAt);

    const m2cStartedAt = new Date(fsm.getFeature('m2-feature-c').startedAt).getTime();
    const m2dStartedAt = new Date(fsm.getFeature('m2-feature-d').startedAt).getTime();

    assert.ok(
      m2cStartedAt >= latestM1Completed,
      `M2 feature-c startedAt (${fsm.getFeature('m2-feature-c').startedAt}) ` +
        `must be >= latest M1 completedAt`
    );
    assert.ok(
      m2dStartedAt >= latestM1Completed,
      `M2 feature-d startedAt (${fsm.getFeature('m2-feature-d').startedAt}) ` +
        `must be >= latest M1 completedAt`
    );
  });

  it('M2 gate evaluation returns passed:true after M2 features complete', () => {
    assert.equal(
      m2GateResult.passed,
      true,
      `M2 gate must pass — blocking: ${JSON.stringify(m2GateResult.blocking)}`
    );
  });

  it('all four features reach completed status', () => {
    for (const featureId of ['m1-feature-a', 'm1-feature-b', 'm2-feature-c', 'm2-feature-d']) {
      assert.equal(
        fsm.getFeature(featureId).status,
        'completed',
        `Feature ${featureId} should be completed`
      );
    }
  });
});
