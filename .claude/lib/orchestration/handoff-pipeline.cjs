'use strict';

/**
 * Handoff Pipeline
 *
 * Wires HandoffWatcher -> ScrutinyReviewer -> FrictionLoopEngine.
 *
 * Usage:
 *   const { createHandoffPipeline } = require('./handoff-pipeline.cjs');
 *   const pipeline = createHandoffPipeline({ workspacePath, featuresPath, frictionLoop });
 *   pipeline.on('feature-completed', ({ featureId, verdict }) => { ... });
 *   pipeline.start();
 *   // ...later...
 *   pipeline.stop();
 *
 * Events emitted:
 *   'feature-completed'  { featureId, verdict }  — feature approved by scrutiny
 *   'handoff-error'      { filename, error }      — handoff file parse failure
 *   'error'              Error                    — processing error
 *
 * Flow when a handoff is detected:
 *   1. Parse payload (HandoffWatcher already parses JSON)
 *   2. Extract featureId
 *   3. Load FeaturesStateMachine, get feature's verificationSteps
 *   4. Transition feature: in_progress -> validating
 *   5. Create ScrutinyReviewer with verificationSteps, run it
 *   6. Approved: transition validating -> completed, emit 'feature-completed'
 *   7. Rejected: transition validating -> failed, emit 'validation-failed' on frictionLoop
 *   8. FrictionLoop re-enqueued event: transition failed -> pending (retry)
 */

const path = require('node:path');
const { EventEmitter } = require('node:events');

const { HandoffWatcher } = require('../mission/handoff-watcher.cjs');
const { ScrutinyReviewer } = require('../mission/scrutiny-reviewer.cjs');
const { FeaturesStateMachine } = require('../mission/features-state-machine.cjs');

// ---------------------------------------------------------------------------
// createHandoffPipeline
// ---------------------------------------------------------------------------

/**
 * Create a handoff pipeline that processes worker handoffs through scrutiny review.
 *
 * @param {object} opts
 * @param {string} opts.workspacePath    - Mission workspace directory (contains handoffs/)
 * @param {string} opts.featuresPath     - Path to features.json
 * @param {import('../mission/friction-loop.cjs').FrictionLoopEngine} opts.frictionLoop
 *   - Started FrictionLoopEngine instance
 * @param {object} [opts._watcherOptions]    - Test seam: override HandoffWatcher options
 * @param {function} [opts._reviewerFactory] - Test seam: factory fn(opts) -> {run()}
 * @returns {EventEmitter & { start: function(): void, stop: function(): void }}
 */
function createHandoffPipeline({
  workspacePath,
  featuresPath,
  frictionLoop,
  _watcherOptions,
  _reviewerFactory,
}) {
  const normWorkspacePath = path.normalize(workspacePath);
  const normFeaturesPath = path.normalize(featuresPath);
  const handoffsDir = path.join(normWorkspacePath, 'handoffs');

  const emitter = new EventEmitter();

  // Watcher monitors the handoffs directory
  const watcher = new HandoffWatcher(handoffsDir, _watcherOptions || {});

  // Reviewer factory — injectable for testing
  const makeReviewer = _reviewerFactory || (opts => new ScrutinyReviewer(opts));

  // -------------------------------------------------------------------------
  // handleHandoff — core processing logic for a single handoff payload
  // -------------------------------------------------------------------------

  /**
   * Process a detected handoff payload.
   * @param {object} payload - Parsed handoff JSON
   * @returns {Promise<void>}
   */
  async function handleHandoff(payload) {
    const featureId = payload && payload.featureId;

    if (!featureId) {
      emitter.emit('error', new Error('Handoff payload missing featureId'));
      return;
    }

    // Load features state machine
    let machine;
    try {
      machine = new FeaturesStateMachine(normFeaturesPath);
      machine.load();
    } catch (err) {
      emitter.emit('error', err);
      return;
    }

    const feature = machine.getFeature(featureId);
    if (!feature) {
      emitter.emit('error', new Error(`Feature not found in features.json: ${featureId}`));
      return;
    }

    const verificationSteps = feature.verificationSteps || [];

    // Transition feature in_progress -> validating (marks it under scrutiny)
    try {
      machine.transition(featureId, 'validating');
    } catch (err) {
      emitter.emit('error', err);
      return;
    }

    // Create and run the scrutiny reviewer
    const reviewer = makeReviewer({
      featureId,
      featuresPath: normFeaturesPath,
      verificationSteps,
      missionDir: normWorkspacePath,
    });

    let verdict;
    try {
      verdict = await reviewer.run();
    } catch (err) {
      emitter.emit('error', err);
      return;
    }

    if (verdict.verdict === 'approved') {
      // Reload machine (reviewer may have written files, state is fresh on disk)
      let freshMachine;
      try {
        freshMachine = new FeaturesStateMachine(normFeaturesPath);
        freshMachine.load();
        freshMachine.transition(featureId, 'completed');
      } catch (err) {
        emitter.emit('error', err);
        return;
      }

      // Emit asynchronously per testing-quirks.md (setImmediate allows listeners to attach)
      setImmediate(() => emitter.emit('feature-completed', { featureId, verdict }));
    } else {
      // Rejected: transition validating -> failed
      try {
        const freshMachine = new FeaturesStateMachine(normFeaturesPath);
        freshMachine.load();
        freshMachine.transition(featureId, 'failed');
      } catch (err) {
        emitter.emit('error', err);
        return;
      }

      // Build stderr text from failure details for friction loop context
      const stderrText = verdict.failures.map(f => f.error || f.step || '').join('\n');

      // Emit validation-failed on frictionLoop (frictionLoop must be started by caller)
      frictionLoop.emit('validation-failed', {
        originalContext: { featureId, verificationSteps },
        error: new Error(verdict.summary || 'Scrutiny rejected'),
        stderr: stderrText,
      });
    }
  }

  // -------------------------------------------------------------------------
  // re-enqueued handler — friction loop signals a retry
  // -------------------------------------------------------------------------

  /**
   * When frictionLoop emits 're-enqueued', transition the feature failed -> pending.
   * @param {object} payload - Re-enqueued payload from FrictionLoopEngine
   */
  function onReEnqueued(payload) {
    const featureId =
      payload &&
      (payload.featureId || (payload.originalContext && payload.originalContext.featureId));

    if (!featureId) return;

    try {
      const machine = new FeaturesStateMachine(normFeaturesPath);
      machine.load();
      machine.transition(featureId, 'pending');
    } catch (err) {
      emitter.emit('error', err);
    }
  }

  // Register re-enqueued listener at creation time (before start())
  frictionLoop.on('re-enqueued', onReEnqueued);

  // -------------------------------------------------------------------------
  // Wire HandoffWatcher events
  // -------------------------------------------------------------------------

  watcher.on('handoff-detected', payload => {
    handleHandoff(payload).catch(err => emitter.emit('error', err));
  });

  watcher.on('handoff-error', info => {
    emitter.emit('handoff-error', info);
  });

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start the pipeline. Idempotent — calling start() while running is a no-op.
   */
  function start() {
    watcher.start();
  }

  /**
   * Stop the pipeline. Safe to call multiple times.
   */
  function stop() {
    watcher.stop();
    frictionLoop.off('re-enqueued', onReEnqueued);
  }

  emitter.start = start;
  emitter.stop = stop;

  return emitter;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { createHandoffPipeline };
