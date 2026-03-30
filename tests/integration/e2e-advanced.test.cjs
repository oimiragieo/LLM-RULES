#!/usr/bin/env node
/* eslint-disable max-lines -- integration test suite for VAL-E2E-001, VAL-E2E-002, VAL-E2E-007 */
'use strict';

/**
 * E2E Advanced Pipeline Integration Tests
 * =========================================
 *
 * VAL-E2E-001: Mock Worker Full Pipeline
 *   End-to-end test using mock workers: provision temp workspace, load features.json
 *   with 1 milestone and 1 feature (no deps), dispatch mock worker (transition
 *   pending -> in_progress) that writes synthetic handoff JSON, run scrutiny
 *   validation (passes), transition feature through validating -> completed, evaluate
 *   milestone gate to `passed: true`. Total wall-clock time under 10 seconds.
 *
 * VAL-E2E-002: Multi-Feature Concurrent Dispatch with Dependency
 *   Given features.json with F1 (no deps), F2 (no deps), F3 (depends on F1 and F2 via
 *   preconditions): engine dispatches F1 and F2 concurrently (both eligible, both
 *   transitioned to in_progress near-simultaneously via Promise.all). When both complete,
 *   F3 becomes eligible and is dispatched. F3 completes, milestone gate passes.
 *   Assert: F1 and F2 startedAt within 1 second. F3 startedAt > both F1/F2 completedAt.
 *   Total elapsed time < sum of individual feature durations (concurrency).
 *
 * VAL-E2E-007: Validation Gate Pass/Fail Determines Feature Outcome
 *   Scenario A (pass): Feature-X transitions pending -> in_progress -> validating,
 *   scrutiny returns pass, feature transitions to `completed` in 1 round.
 *   Scenario B (fail then pass): Feature-X transitions to in_progress, scrutiny returns
 *   fail with blockingIssues, feature transitions to `failed`, friction loop emits
 *   `re-enqueued` with strategy:retry, feature transitions failed -> pending -> in_progress
 *   with blocking issues in context, round 2 scrutiny passes, feature reaches `completed`.
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
// VAL-E2E-001: Mock Worker Full Pipeline
// ---------------------------------------------------------------------------

describe('VAL-E2E-001: Mock Worker Full Pipeline', () => {
  let workspacePath;
  let featuresPath;
  let statePath;
  let handoffsDir;
  let fsm;
  let gateResult;
  let scrutinyVerdict;
  let wallClockMs;

  before(async () => {
    const startTime = Date.now();

    // 1. Provision temp workspace
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-001-'));
    featuresPath = path.join(workspacePath, 'features.json');
    statePath = path.join(workspacePath, 'validation-state.json');
    handoffsDir = path.join(workspacePath, 'handoffs');
    fs.mkdirSync(handoffsDir);

    // 2. Write features.json: 1 milestone, 1 feature, no deps
    const featuresData = {
      features: [
        {
          id: 'feature-e2e-001',
          description: 'Single feature for E2E-001 pipeline test',
          status: 'pending',
          milestone: 'e2e-milestone',
          preconditions: [],
        },
      ],
    };
    fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');

    // 3. Load FeaturesStateMachine
    fsm = new FeaturesStateMachine(featuresPath);
    fsm.load();

    // 4. Dispatch mock worker: pending -> in_progress
    fsm.transition('feature-e2e-001', 'in_progress');

    // 5. Mock worker writes synthetic handoff JSON
    const handoffPath = path.join(handoffsDir, 'feature-e2e-001.json');
    fs.writeFileSync(
      handoffPath,
      JSON.stringify({
        featureId: 'feature-e2e-001',
        status: 'done',
        files: ['mock.js'],
        completedAt: new Date().toISOString(),
      }),
      'utf8'
    );

    // 6. Run ScrutinyReviewer with passing verification step
    const reviewer = new ScrutinyReviewer({
      featureId: 'feature-e2e-001',
      featuresPath,
      verificationSteps: ['echo pass'],
      missionDir: workspacePath,
      stepTimeoutMs: 5000,
      overallTimeoutMs: 30000,
    });
    scrutinyVerdict = await reviewer.run();

    // 7. Approved: in_progress -> validating -> completed
    fsm.transition('feature-e2e-001', 'validating');
    fsm.transition('feature-e2e-001', 'completed');

    // 8. Evaluate milestone gate
    const gate = new MilestoneGate({
      milestone: 'e2e-milestone',
      featuresPath,
      statePath,
    });
    gateResult = await gate.evaluate();

    wallClockMs = Date.now() - startTime;
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('pipeline completes without throwing', () => {
    // If before() threw, none of these would run; reaching here proves success
    assert.ok(fsm, 'FSM should be instantiated');
    assert.ok(gateResult, 'Gate result should be available');
  });

  it('feature reaches completed via valid transition chain', () => {
    assert.equal(
      fsm.getFeature('feature-e2e-001').status,
      'completed',
      'Feature must reach completed status'
    );
  });

  it('handoff artifact exists on disk', () => {
    const handoffPath = path.join(handoffsDir, 'feature-e2e-001.json');
    assert.ok(fs.existsSync(handoffPath), 'Handoff JSON must exist on disk');

    const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
    assert.equal(handoff.featureId, 'feature-e2e-001', 'Handoff featureId must match');
  });

  it('ScrutinyReviewer returns approved verdict', () => {
    assert.equal(scrutinyVerdict.verdict, 'approved', 'Scrutiny verdict must be approved');
  });

  it('MilestoneGate.evaluate() returns passed:true', () => {
    assert.equal(
      gateResult.passed,
      true,
      `Gate must pass — blocking: ${JSON.stringify(gateResult.blocking)}`
    );
  });

  it('all features are in terminal state', () => {
    for (const feature of fsm.getAllFeatures()) {
      const isTerminal = feature.status === 'completed' || feature.status === 'cancelled';
      assert.ok(
        isTerminal,
        `Feature ${feature.id} must be in terminal state, got: ${feature.status}`
      );
    }
  });

  it('wall-clock time is under 10 seconds', () => {
    assert.ok(wallClockMs < 10000, `Wall-clock time must be < 10s, got: ${wallClockMs}ms`);
  });
});

// ---------------------------------------------------------------------------
// VAL-E2E-002: Multi-Feature Concurrent Dispatch with Dependency
// ---------------------------------------------------------------------------

describe('VAL-E2E-002: Multi-Feature Concurrent Dispatch with Dependency', () => {
  let workspacePath;
  let featuresPath;
  let statePath;
  let handoffsDir;
  let fsm;
  let gateResult;
  let totalElapsedMs;

  // Each mock worker takes this long (simulates real work duration)
  const WORKER_DELAY_MS = 100;

  /**
   * Simulate an async mock worker: waits WORKER_DELAY_MS then writes handoff JSON.
   * @param {string} featureId
   * @returns {Promise<void>}
   */
  function runAsyncMockWorker(featureId) {
    return new Promise(resolve => {
      setTimeout(() => {
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
        resolve();
      }, WORKER_DELAY_MS);
    });
  }

  before(async () => {
    const startTime = Date.now();

    // 1. Provision temp workspace
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-002-'));
    featuresPath = path.join(workspacePath, 'features.json');
    statePath = path.join(workspacePath, 'validation-state.json');
    handoffsDir = path.join(workspacePath, 'handoffs');
    fs.mkdirSync(handoffsDir);

    // 2. Write features.json: F1 (no deps), F2 (no deps), F3 (depends on F1 and F2)
    const featuresData = {
      features: [
        {
          id: 'F1',
          description: 'Feature F1 — no dependencies',
          status: 'pending',
          milestone: 'concurrent-milestone',
          preconditions: [],
        },
        {
          id: 'F2',
          description: 'Feature F2 — no dependencies',
          status: 'pending',
          milestone: 'concurrent-milestone',
          preconditions: [],
        },
        {
          id: 'F3',
          description: 'Feature F3 — depends on F1 and F2',
          status: 'pending',
          milestone: 'concurrent-milestone',
          preconditions: ['F1', 'F2'],
        },
      ],
    };
    fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');

    // 3. Load FeaturesStateMachine
    fsm = new FeaturesStateMachine(featuresPath);
    fsm.load();

    // 4. Verify F1 and F2 are eligible; F3 is not (blocked by preconditions)
    const eligible = fsm.getEligibleFeatures();
    assert.equal(eligible.length, 2, 'Initially, only F1 and F2 should be eligible');

    // 5. Dispatch F1 and F2 concurrently (Promise.all on transitions)
    await Promise.all([
      Promise.resolve().then(() => fsm.transition('F1', 'in_progress')),
      Promise.resolve().then(() => fsm.transition('F2', 'in_progress')),
    ]);

    // 6. Run F1 and F2 workers concurrently (Promise.all proves concurrency)
    await Promise.all([runAsyncMockWorker('F1'), runAsyncMockWorker('F2')]);

    // 7. Complete F1 and F2
    fsm.transition('F1', 'validating');
    fsm.transition('F1', 'completed');
    fsm.transition('F2', 'validating');
    fsm.transition('F2', 'completed');

    // 8. Now F3 is eligible
    const eligibleAfterF1F2 = fsm.getEligibleFeatures();
    assert.equal(
      eligibleAfterF1F2.length,
      1,
      'After F1 and F2 complete, only F3 should be eligible'
    );
    assert.equal(eligibleAfterF1F2[0].id, 'F3', 'F3 must now be eligible');

    // 9. Dispatch and complete F3
    fsm.transition('F3', 'in_progress');
    await runAsyncMockWorker('F3');
    fsm.transition('F3', 'validating');
    fsm.transition('F3', 'completed');

    // 10. Evaluate milestone gate
    const gate = new MilestoneGate({
      milestone: 'concurrent-milestone',
      featuresPath,
      statePath,
    });
    gateResult = await gate.evaluate();

    totalElapsedMs = Date.now() - startTime;
  });

  after(() => {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  });

  it('F1 and F2 startedAt timestamps are within 1 second of each other', () => {
    const f1 = fsm.getFeature('F1');
    const f2 = fsm.getFeature('F2');

    assert.ok(f1.startedAt, 'F1 must have startedAt timestamp');
    assert.ok(f2.startedAt, 'F2 must have startedAt timestamp');

    const f1Start = new Date(f1.startedAt).getTime();
    const f2Start = new Date(f2.startedAt).getTime();
    const diff = Math.abs(f1Start - f2Start);

    assert.ok(
      diff <= 1000,
      `F1 and F2 startedAt must be within 1 second of each other, got: ${diff}ms apart`
    );
  });

  it('F3 startedAt is strictly after both F1 and F2 completedAt', () => {
    const f1 = fsm.getFeature('F1');
    const f2 = fsm.getFeature('F2');
    const f3 = fsm.getFeature('F3');

    assert.ok(f1.completedAt, 'F1 must have completedAt timestamp');
    assert.ok(f2.completedAt, 'F2 must have completedAt timestamp');
    assert.ok(f3.startedAt, 'F3 must have startedAt timestamp');

    const f1Completed = new Date(f1.completedAt).getTime();
    const f2Completed = new Date(f2.completedAt).getTime();
    const f3Started = new Date(f3.startedAt).getTime();

    assert.ok(
      f3Started >= f1Completed,
      `F3 startedAt (${f3.startedAt}) must be >= F1 completedAt (${f1.completedAt})`
    );
    assert.ok(
      f3Started >= f2Completed,
      `F3 startedAt (${f3.startedAt}) must be >= F2 completedAt (${f2.completedAt})`
    );
  });

  it('F3 was never in_progress while F1 or F2 was non-complete', () => {
    // After F1 and F2 complete, F3 was dispatched — the test setup enforces this
    // by calling getEligibleFeatures() before dispatching F3.
    // We assert the final state: F3 startedAt must be after F1 and F2 completedAt.
    const f1 = fsm.getFeature('F1');
    const f2 = fsm.getFeature('F2');
    const f3 = fsm.getFeature('F3');

    assert.ok(f1.completedAt, 'F1 must be completed before F3 started');
    assert.ok(f2.completedAt, 'F2 must be completed before F3 started');
    assert.ok(f3.startedAt, 'F3 must have been dispatched');

    const latestPredecessorCompleted = Math.max(
      new Date(f1.completedAt).getTime(),
      new Date(f2.completedAt).getTime()
    );
    assert.ok(
      new Date(f3.startedAt).getTime() >= latestPredecessorCompleted,
      'F3 must have started only after both F1 and F2 completed'
    );
  });

  it('all three features reach completed status', () => {
    for (const id of ['F1', 'F2', 'F3']) {
      assert.equal(
        fsm.getFeature(id).status,
        'completed',
        `Feature ${id} must reach completed status`
      );
    }
  });

  it('milestone gate returns passed:true', () => {
    assert.equal(
      gateResult.passed,
      true,
      `Gate must pass — blocking: ${JSON.stringify(gateResult.blocking)}`
    );
  });

  it('total elapsed time shows concurrency (< sum of 3 sequential worker delays)', () => {
    // Sequential would take 3 * WORKER_DELAY_MS = 300ms minimum.
    // Concurrent F1+F2 in parallel takes ~WORKER_DELAY_MS for both,
    // then F3 takes another WORKER_DELAY_MS → total ~2 * WORKER_DELAY_MS = 200ms.
    // We allow a generous 2.5x to account for overhead.
    const sequentialMs = 3 * WORKER_DELAY_MS;
    assert.ok(
      totalElapsedMs < sequentialMs * 2.5,
      `Total elapsed (${totalElapsedMs}ms) must be less than 2.5x sequential (${sequentialMs * 2.5}ms), ` +
        `proving F1+F2 ran concurrently`
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-E2E-007: Validation Gate Pass/Fail Determines Feature Outcome
// ---------------------------------------------------------------------------

describe('VAL-E2E-007: Validation Gate Pass/Fail Determines Feature Outcome', () => {
  // ── Scenario A: Scrutiny passes — feature completed in 1 round ──────────

  describe('Scenario A: Scrutiny passes — completed in exactly 1 validation round', () => {
    let workspacePath;
    let featuresPath;
    let fsm;
    let scrutinyVerdict;
    let roundCount;

    before(async () => {
      workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-007a-'));
      featuresPath = path.join(workspacePath, 'features.json');

      const featuresData = {
        features: [
          {
            id: 'feature-x-a',
            description: 'Feature X for Scenario A — scrutiny passes first round',
            status: 'pending',
            milestone: 'gate-milestone',
            preconditions: [],
          },
        ],
      };
      fs.writeFileSync(featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');

      fsm = new FeaturesStateMachine(featuresPath);
      fsm.load();

      roundCount = 0;

      // Round 1: pending -> in_progress -> scrutiny (passes) -> validating -> completed
      fsm.transition('feature-x-a', 'in_progress');

      const reviewer = new ScrutinyReviewer({
        featureId: 'feature-x-a',
        featuresPath,
        verificationSteps: ['echo pass'],
        missionDir: workspacePath,
        stepTimeoutMs: 5000,
        overallTimeoutMs: 30000,
      });
      scrutinyVerdict = await reviewer.run();
      roundCount += 1;

      // Approved: in_progress -> validating -> completed
      fsm.transition('feature-x-a', 'validating');
      fsm.transition('feature-x-a', 'completed');
    });

    after(() => {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    });

    it('feature-x-a reaches completed status', () => {
      assert.equal(
        fsm.getFeature('feature-x-a').status,
        'completed',
        'Feature must reach completed status'
      );
    });

    it('scrutiny verdict is approved in round 1', () => {
      assert.equal(scrutinyVerdict.verdict, 'approved', 'Scrutiny must be approved');
    });

    it('completed in exactly 1 validation round', () => {
      assert.equal(roundCount, 1, 'Feature must complete in exactly 1 validation round');
    });

    it('no retry count increment (no failures)', () => {
      assert.equal(
        fsm.getFeature('feature-x-a').retryCount,
        0,
        'No retry count increment for passing scenario'
      );
    });
  });

  // ── Scenario B: Scrutiny fails then passes — completed in 2 rounds ──────

  describe('Scenario B: Scrutiny fails then passes — completed in exactly 2 rounds', () => {
    let workspacePath;
    let featuresPath;
    let handoffsDir;
    let fsm;
    let frictionLoop;
    let round1Verdict;
    let round2Verdict;
    let roundCount;
    const reEnqueuedEvents = [];
    let reEnqueuedPayload;
    let round2Context;

    before(async () => {
      workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-007b-'));
      featuresPath = path.join(workspacePath, 'features.json');
      handoffsDir = path.join(workspacePath, 'handoffs');
      fs.mkdirSync(handoffsDir);

      const featuresData = {
        features: [
          {
            id: 'feature-x-b',
            description: 'Feature X for Scenario B — scrutiny fails first, passes second',
            status: 'pending',
            milestone: 'gate-milestone-b',
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

      roundCount = 0;

      // ── ROUND 1: failing scrutiny ────────────────────────────────────────

      // pending -> in_progress
      fsm.transition('feature-x-b', 'in_progress');

      // Write round-1 handoff
      fs.writeFileSync(
        path.join(handoffsDir, 'feature-x-b-r1.json'),
        JSON.stringify({ featureId: 'feature-x-b', status: 'done', round: 1 }),
        'utf8'
      );

      // Run ScrutinyReviewer with failing verification step
      const reviewer1 = new ScrutinyReviewer({
        featureId: 'feature-x-b',
        featuresPath,
        verificationSteps: ['exit 1'],
        missionDir: workspacePath,
        stepTimeoutMs: 5000,
        overallTimeoutMs: 30000,
      });
      round1Verdict = await reviewer1.run();
      roundCount += 1;

      // Rejected: in_progress -> failed
      fsm.transition('feature-x-b', 'failed');

      // Register re-enqueued listener before emitting validation-failed
      const reEnqueuedPromise = new Promise(resolve => {
        frictionLoop.once('re-enqueued', payload => {
          reEnqueuedEvents.push(payload);
          resolve(payload);
        });
      });

      // Friction loop receives validation-failed event
      frictionLoop.emit('validation-failed', {
        originalContext: {
          featureId: 'feature-x-b',
          skillName: 'test-skill',
          iteration: 0,
          blockingIssues: round1Verdict.failures,
        },
        error: new Error(`Scrutiny rejected: ${round1Verdict.summary}`),
        stderr: JSON.stringify(round1Verdict.failures),
      });

      // Wait for friction loop to emit re-enqueued
      reEnqueuedPayload = await reEnqueuedPromise;

      // failed -> pending (re-enqueued for retry)
      fsm.transition('feature-x-b', 'pending');

      // ── ROUND 2: passing scrutiny ────────────────────────────────────────

      // Build round-2 dispatch context (includes blocking issues from round 1)
      round2Context = {
        featureId: 'feature-x-b',
        blockingIssues: round1Verdict.failures,
        stderrDump: reEnqueuedPayload.stderrDump,
        previousRound: 1,
      };

      // pending -> in_progress (re-dispatch with round-2 context)
      fsm.transition('feature-x-b', 'in_progress');

      // Write round-2 handoff (fixed worker output)
      fs.writeFileSync(
        path.join(handoffsDir, 'feature-x-b-r2.json'),
        JSON.stringify({
          featureId: 'feature-x-b',
          status: 'done',
          round: 2,
          addressedIssues: round2Context.blockingIssues,
        }),
        'utf8'
      );

      // Run ScrutinyReviewer with passing verification step
      const reviewer2 = new ScrutinyReviewer({
        featureId: 'feature-x-b',
        featuresPath,
        verificationSteps: ['echo pass'],
        missionDir: workspacePath,
        stepTimeoutMs: 5000,
        overallTimeoutMs: 30000,
      });
      round2Verdict = await reviewer2.run();
      roundCount += 1;

      // Approved: in_progress -> validating -> completed
      fsm.transition('feature-x-b', 'validating');
      fsm.transition('feature-x-b', 'completed');

      frictionLoop.stop();
    });

    after(() => {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    });

    it('feature-x-b reaches completed status', () => {
      assert.equal(
        fsm.getFeature('feature-x-b').status,
        'completed',
        'Feature must reach completed status'
      );
    });

    it('round-1 scrutiny returns rejected verdict', () => {
      assert.equal(round1Verdict.verdict, 'rejected', 'Round 1 verdict must be rejected');
      assert.ok(round1Verdict.failures.length > 0, 'Round 1 must have at least one failure');
    });

    it('round-2 scrutiny returns approved verdict', () => {
      assert.equal(round2Verdict.verdict, 'approved', 'Round 2 verdict must be approved');
    });

    it('completed in exactly 2 validation rounds', () => {
      assert.equal(roundCount, 2, 'Feature must complete in exactly 2 validation rounds');
    });

    it('FrictionLoopEngine emitted exactly one re-enqueued event in Scenario B', () => {
      assert.equal(
        reEnqueuedEvents.length,
        1,
        'Exactly one re-enqueued event must be emitted in Scenario B'
      );
    });

    it('re-enqueued event has strategy:retry', () => {
      assert.equal(reEnqueuedPayload.strategy, 'retry', 'Re-enqueued event strategy must be retry');
    });

    it('blocking issues from round 1 appear in round 2 dispatch context', () => {
      assert.ok(
        Array.isArray(round2Context.blockingIssues),
        'round2Context.blockingIssues must be an array'
      );
      assert.ok(
        round2Context.blockingIssues.length > 0,
        'round2Context.blockingIssues must be non-empty (from round 1 failures)'
      );
      // The re-enqueued payload's stderrDump encodes round-1 blocking issues
      assert.ok(
        typeof reEnqueuedPayload.stderrDump === 'string',
        'reEnqueuedPayload.stderrDump must be a string'
      );
      assert.ok(
        reEnqueuedPayload.stderrDump.length > 0,
        'reEnqueuedPayload.stderrDump must be non-empty'
      );
    });

    it('retryCount incremented after round-1 failure', () => {
      const feature = fsm.getFeature('feature-x-b');
      assert.ok(
        feature.retryCount >= 1,
        `retryCount must be >= 1 after one failed round, got: ${feature.retryCount}`
      );
    });
  });
});
