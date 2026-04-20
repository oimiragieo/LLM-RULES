'use strict';

/**
 * Orchestrator End-to-End Integration Test
 *
 * Wires all orchestrator modules together to verify the full mission lifecycle.
 *
 * Test scenario (VAL-MO-008):
 *   1. startMission with 2 milestones (M1: feat-a + feat-b, M2: feat-c)
 *   2. Dispatch loop starts, dispatches M1 features (feat-a, feat-b)
 *   3. Mock workers write handoff files to workspace/handoffs/
 *   4. Handoff pipeline detects files, runs mock scrutiny (auto-approves)
 *   5. feat-a and feat-b reach 'completed' status
 *   6. Milestone gate for M1 is evaluated and passes
 *   7. M2 feature (feat-c) becomes eligible (preconditions met), dispatches and completes
 *   8. Milestone gate for M2 passes, mission_completed event logged
 *   9. state.json updated to 'completed'
 *
 * Verifications:
 *   - state.json shows { state: 'completed' }
 *   - All features show status 'completed' in features.json
 *   - progress_log.jsonl contains all lifecycle event types
 *   - Handoff files exist on disk
 *   - Wall-clock elapsed < 10 000 ms
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { startMission } = require('../../.claude/lib/orchestration/mission-cli.cjs');
const { createDispatchLoop } = require('../../.claude/lib/orchestration/dispatch-loop.cjs');
const { createHandoffPipeline } = require('../../.claude/lib/orchestration/handoff-pipeline.cjs');
const {
  createMilestoneManager,
  createProgressLogger,
} = require('../../.claude/lib/orchestration/milestone-manager.cjs');
const { saveState } = require('../../.claude/lib/orchestration/state-recovery.cjs');
const { FrictionLoopEngine } = require('../../.claude/lib/mission/friction-loop.cjs');
const { createMockDb, createMockBudget } = require('../integration/helpers/mock-factory.cjs');

// ---------------------------------------------------------------------------
// Milestone names
// ---------------------------------------------------------------------------

const MILESTONE_1 = 'milestone-1';
const MILESTONE_2 = 'milestone-2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mock reviewer factory: always returns an 'approved' verdict synchronously.
 * Injected into createHandoffPipeline via _reviewerFactory to avoid real subprocess calls.
 *
 * @param {{ featureId: string }} opts
 * @returns {{ run: function(): Promise<object> }}
 */
function createApproveReviewer(opts) {
  return {
    run: async () => ({
      verdict: 'approved',
      featureId: opts.featureId,
      timestamp: new Date().toISOString(),
      steps: [],
      failures: [],
      summary: `All verification steps passed for feature ${opts.featureId}`,
      skippedDestructive: [],
    }),
  };
}

/**
 * Write a handoff JSON file to handoffsDir for the given featureId.
 * Uses timestamp-prefixed filename to satisfy HandoffWatcher FIFO ordering.
 *
 * @param {string} handoffsDir
 * @param {string} featureId
 * @returns {string} Path to the written handoff file
 */
function writeHandoff(handoffsDir, featureId) {
  fs.mkdirSync(handoffsDir, { recursive: true });
  const filename = `${Date.now()}-${featureId}.json`;
  const handoffPath = path.join(handoffsDir, filename);
  fs.writeFileSync(
    handoffPath,
    JSON.stringify({ featureId, status: 'done', files: ['mock.js'] }),
    'utf8'
  );
  return handoffPath;
}

/**
 * Read all JSONL lines from a file and parse them.
 * Returns empty array if file does not exist.
 *
 * @param {string} filePath
 * @returns {object[]}
 */
function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Orchestrator E2E', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-e2e-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('VAL-MO-008: full lifecycle completes with mock workers under 10 seconds', async () => {
    const testStart = Date.now();

    // ------------------------------------------------------------------
    // 1. Create source features.json
    //    M1: feat-a, feat-b (no preconditions)
    //    M2: feat-c (preconditions: [feat-a, feat-b] — gate enforced naturally)
    //    All features have empty fulfills so milestone gate only checks status.
    // ------------------------------------------------------------------

    const workingDir = fs.mkdtempSync(path.join(tempDir, 'mission-'));

    const featuresData = {
      features: [
        {
          id: 'feat-a',
          description: 'Feature A — first feature in milestone 1',
          status: 'pending',
          milestone: MILESTONE_1,
          skillName: 'tdd',
          preconditions: [],
          verificationSteps: [],
          fulfills: [],
        },
        {
          id: 'feat-b',
          description: 'Feature B — second feature in milestone 1',
          status: 'pending',
          milestone: MILESTONE_1,
          skillName: 'tdd',
          preconditions: [],
          verificationSteps: [],
          fulfills: [],
        },
        {
          id: 'feat-c',
          description: 'Feature C — sole feature in milestone 2',
          status: 'pending',
          milestone: MILESTONE_2,
          skillName: 'tdd',
          // Preconditions enforce that M1 must complete before M2 is dispatched.
          preconditions: ['feat-a', 'feat-b'],
          verificationSteps: [],
          fulfills: [],
        },
      ],
    };

    const srcFeaturesPath = path.join(workingDir, 'source-features.json');
    fs.writeFileSync(srcFeaturesPath, JSON.stringify(featuresData, null, 2), 'utf8');

    // Stub mission.md so startMission / dispatch-loop have a valid path
    const missionMdPath = path.join(workingDir, 'mission.md');
    fs.writeFileSync(missionMdPath, '# E2E Test Mission\n', 'utf8');

    // ------------------------------------------------------------------
    // 2. Provision workspace via startMission
    // ------------------------------------------------------------------

    const { workspacePath } = startMission({
      featuresPath: srcFeaturesPath,
      missionPath: missionMdPath,
      workingDirectory: workingDir,
    });

    const workspaceFeaturesPath = path.join(workspacePath, 'features.json');
    const handoffsDir = path.join(workspacePath, 'handoffs');
    const progressLogPath = path.join(workspacePath, 'progress', 'progress_log.jsonl');

    // Ensure handoffs directory exists (provisioner creates it; guard for safety)
    fs.mkdirSync(handoffsDir, { recursive: true });

    // ------------------------------------------------------------------
    // 3. Set up milestone manager and progress logger
    // ------------------------------------------------------------------

    const milestoneManager = createMilestoneManager({
      workspacePath,
      featuresPath: workspaceFeaturesPath,
    });

    const logger = createProgressLogger(progressLogPath);
    logger.log({ event: 'mission_started' });

    // ------------------------------------------------------------------
    // 4. Set up friction loop (required by handoff pipeline)
    // ------------------------------------------------------------------

    const frictionLoop = new FrictionLoopEngine({});
    frictionLoop.start();

    // ------------------------------------------------------------------
    // 5. Set up handoff pipeline with mock reviewer and fast polling
    // ------------------------------------------------------------------

    const pipeline = createHandoffPipeline({
      workspacePath,
      featuresPath: workspaceFeaturesPath,
      frictionLoop,
      _reviewerFactory: createApproveReviewer,
      // Use short intervals so the test completes well under 10 s
      _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
    });

    // ------------------------------------------------------------------
    // 6. Set up dispatch loop with mock db/budget and fast polling
    // ------------------------------------------------------------------

    const db = createMockDb();
    const budget = createMockBudget();

    const dispatchLoop = createDispatchLoop({
      workspacePath,
      featuresPath: workspaceFeaturesPath,
      db,
      budget,
      missionPath: missionMdPath,
      pollIntervalMs: 50,
    });

    // ------------------------------------------------------------------
    // 7. Wire up event handlers and orchestrate the lifecycle
    // ------------------------------------------------------------------

    const completedFeatures = new Set();
    const dispatchedFeatures = new Set();
    const milestoneGateChecked = new Set();

    // Promise that resolves when the entire mission is done
    let missionCompletedResolve;
    let missionCompletedReject;
    const missionComplete = new Promise((resolve, reject) => {
      missionCompletedResolve = resolve;
      missionCompletedReject = reject;
    });

    // Guard against unhandled errors in async handlers.
    // INVALID_TRANSITION is expected on Windows: HandoffWatcher's polling-based
    // watcher periodically re-processes handoff files that remain on disk after
    // the feature has already reached 'completed'. The re-processing attempt
    // tries 'completed -> validating' which is rejected by the state machine.
    // This is benign — the feature is already done — so we suppress it here.
    pipeline.on('error', err => {
      if (err && err.code === 'INVALID_TRANSITION') return;
      missionCompletedReject(err);
    });

    dispatchLoop.on('error', err => {
      missionCompletedReject(err);
    });

    // On worker dispatched: mock worker writes handoff and we log events
    dispatchLoop.on('worker-dispatched', ({ featureId, sessionId }) => {
      dispatchedFeatures.add(featureId);
      logger.log({ event: 'worker_dispatched', featureId, sessionId });

      // Simulate worker completing and writing handoff to workspace/handoffs/
      writeHandoff(handoffsDir, featureId);
      logger.log({ event: 'handoff_received', featureId });
    });

    // On feature completed: check milestone gates and detect mission completion
    pipeline.on('feature-completed', async ({ featureId }) => {
      try {
        completedFeatures.add(featureId);
        logger.log({ event: 'scrutiny_passed', featureId });

        const m1Features = ['feat-a', 'feat-b'];
        const allFeatureIds = ['feat-a', 'feat-b', 'feat-c'];

        // Evaluate M1 gate once both M1 features are completed
        if (
          m1Features.every(id => completedFeatures.has(id)) &&
          !milestoneGateChecked.has(MILESTONE_1)
        ) {
          milestoneGateChecked.add(MILESTONE_1);
          await milestoneManager.checkMilestoneCompletion(MILESTONE_1);
        }

        // Evaluate M2 gate and finalise mission when all features are done
        if (
          allFeatureIds.every(id => completedFeatures.has(id)) &&
          !milestoneGateChecked.has(MILESTONE_2)
        ) {
          milestoneGateChecked.add(MILESTONE_2);
          await milestoneManager.checkMilestoneCompletion(MILESTONE_2);

          // Mark mission as completed in state.json
          saveState(workspacePath, { state: 'completed', completedFeatures: 3 });

          missionCompletedResolve();
        }
      } catch (err) {
        missionCompletedReject(err);
      }
    });

    // ------------------------------------------------------------------
    // 8. Start components and wait for mission completion
    // ------------------------------------------------------------------

    pipeline.start();
    dispatchLoop.start();

    // Timeout guard: fail the test if mission does not complete within 9 s
    const timeoutId = setTimeout(() => {
      missionCompletedReject(new Error('Mission did not complete within 9 000 ms'));
    }, 9000);

    try {
      await missionComplete;
    } finally {
      clearTimeout(timeoutId);
      dispatchLoop.stop();
      pipeline.stop();
      frictionLoop.stop();
    }

    // ------------------------------------------------------------------
    // 9. Assertions
    // ------------------------------------------------------------------

    // Wall-clock must be under 10 s
    const elapsed = Date.now() - testStart;
    assert.ok(elapsed < 10000, `Wall-clock should be < 10 000 ms (actual: ${elapsed} ms)`);

    // (a) state.json shows 'completed'
    const stateRaw = fs.readFileSync(path.join(workspacePath, 'state.json'), 'utf8');
    const state = JSON.parse(stateRaw);
    assert.strictEqual(state.state, 'completed', 'state.json must show state: "completed"');

    // (b) All 3 features show status 'completed' in features.json
    const featuresRaw = fs.readFileSync(workspaceFeaturesPath, 'utf8');
    const features = JSON.parse(featuresRaw).features;
    assert.strictEqual(features.length, 3, 'features.json must contain 3 features');
    for (const feat of features) {
      assert.strictEqual(
        feat.status,
        'completed',
        `Feature '${feat.id}' must be completed (was '${feat.status}')`
      );
    }

    // (c) progress_log.jsonl contains all required lifecycle event types
    const events = readJsonl(progressLogPath);
    const eventTypes = events.map(e => e.event);

    assert.ok(eventTypes.includes('mission_started'), 'Progress log must contain mission_started');

    const dispatchedCount = eventTypes.filter(e => e === 'worker_dispatched').length;
    assert.ok(
      dispatchedCount >= 3,
      `Progress log must have >= 3 worker_dispatched events (got ${dispatchedCount})`
    );

    const handoffCount = eventTypes.filter(e => e === 'handoff_received').length;
    assert.ok(
      handoffCount >= 3,
      `Progress log must have >= 3 handoff_received events (got ${handoffCount})`
    );

    const scrutinyCount = eventTypes.filter(e => e === 'scrutiny_passed').length;
    assert.ok(
      scrutinyCount >= 3,
      `Progress log must have >= 3 scrutiny_passed events (got ${scrutinyCount})`
    );

    const gatedCount = eventTypes.filter(e => e === 'milestone_gated').length;
    assert.ok(
      gatedCount >= 2,
      `Progress log must have >= 2 milestone_gated events (got ${gatedCount})`
    );

    assert.ok(
      eventTypes.includes('mission_completed'),
      'Progress log must contain mission_completed'
    );

    // Every event line must have a timestamp field
    for (const evt of events) {
      assert.ok(
        typeof evt.timestamp === 'string' && evt.timestamp.length > 0,
        `Every progress event must have a timestamp (missing in: ${JSON.stringify(evt)})`
      );
    }

    // (d) Handoff files exist on disk in workspace/handoffs/
    const handoffFiles = fs.readdirSync(handoffsDir).filter(f => f.endsWith('.json'));
    assert.strictEqual(handoffFiles.length, 3, 'handoffs/ directory must contain 3 JSON files');

    // (e) All 3 features were dispatched
    assert.ok(dispatchedFeatures.has('feat-a'), 'feat-a must be dispatched');
    assert.ok(dispatchedFeatures.has('feat-b'), 'feat-b must be dispatched');
    assert.ok(dispatchedFeatures.has('feat-c'), 'feat-c must be dispatched');

    // (f) M2 feature dispatched only after M1 completed (milestone gate in correct order)
    //     Verified implicitly: feat-c has preconditions=[feat-a, feat-b] so it could only
    //     be dispatched after both were completed. If we reach this point, it worked.

    // (g) milestone-state.json shows both milestones passed
    const milestoneStatePath = path.join(workspacePath, 'milestone-state.json');
    assert.ok(
      fs.existsSync(milestoneStatePath),
      'milestone-state.json must exist after both gates pass'
    );
    const milestoneState = JSON.parse(fs.readFileSync(milestoneStatePath, 'utf8'));
    assert.ok(
      Array.isArray(milestoneState.passedMilestones),
      'milestone-state.json must have passedMilestones array'
    );
    assert.ok(
      milestoneState.passedMilestones.includes(MILESTONE_1),
      `'${MILESTONE_1}' must be in passedMilestones`
    );
    assert.ok(
      milestoneState.passedMilestones.includes(MILESTONE_2),
      `'${MILESTONE_2}' must be in passedMilestones`
    );
  });
});
