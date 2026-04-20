'use strict';

/**
 * Worker Dispatch Loop
 *
 * Polls FeaturesStateMachine.getEligibleFeatures() every 2 seconds
 * and dispatches workers for eligible features.
 *
 * Usage:
 *   const { createDispatchLoop } = require('./dispatch-loop.cjs');
 *   const loop = createDispatchLoop({ workspacePath, featuresPath, db, budget, missionPath });
 *   loop.on('worker-dispatched', ({ featureId, sessionId }) => { ... });
 *   loop.start();
 *   // ...later...
 *   loop.stop();
 *
 * Events emitted:
 *   'worker-dispatched'  { featureId, sessionId }  — feature dispatched to worker pool
 *   'budget-exhausted'   { retryAfterMs }           — budget slot denied this cycle
 *   'stopped'            { reason }                 — loop halted (paused|no-pending-features)
 *   'error'              Error                      — non-fatal error during poll
 */

const crypto = require('node:crypto');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const { FeaturesStateMachine } = require('../mission/features-state-machine.cjs');
// MEv1 Phase 0.5 wiring — dispatch loop now delegates each enqueue to the
// hardened dispatchFeature() so SKILL_ALLOWLIST + payload cap + retry
// ceiling + proposer/effector resolution all fire on the production path.
// We require the *module* (not destructure) so test-time monkey-patches of
// `dispatcherModule.dispatchFeature` are honored.
const dispatcherModule = require('../mission/worker-features-dispatcher.cjs');

/** Default polling interval: 2 seconds (overridable for tests via pollIntervalMs) */
const DEFAULT_POLL_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a unique worker session ID.
 * @returns {string}
 */
function generateSessionId() {
  return `session-${crypto.randomUUID()}`;
}

/**
 * Read and parse state.json from the workspace directory.
 * Returns null on any read/parse error.
 *
 * @param {string} workspacePath
 * @returns {object|null}
 */
function readState(workspacePath) {
  const statePath = path.join(workspacePath, 'state.json');
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// createDispatchLoop
// ---------------------------------------------------------------------------

/**
 * Create a dispatch loop that polls for eligible features and dispatches workers.
 *
 * @param {object} opts
 * @param {string} opts.workspacePath   - Workspace directory (contains state.json)
 * @param {string} opts.featuresPath    - Path to features.json
 * @param {import('better-sqlite3').Database} opts.db - SQLite db for enqueueing
 * @param {object} opts.budget          - BudgetEnforcementService instance
 * @param {string} opts.missionPath     - Path to mission.md (forwarded to dispatchFeature for persona context)
 * @param {number} [opts.pollIntervalMs=2000] - Override poll interval (for testing)
 * @returns {EventEmitter & { start: function(): void, stop: function(): void }}
 */
function createDispatchLoop({
  workspacePath,
  featuresPath,
  db,
  budget,
  missionPath,
  pollIntervalMs,
}) {
  // Normalise paths once
  const normFeaturesPath = path.normalize(featuresPath);
  const normWorkspacePath = path.normalize(workspacePath);

  const interval =
    pollIntervalMs !== undefined && pollIntervalMs !== null
      ? pollIntervalMs
      : DEFAULT_POLL_INTERVAL_MS;

  const emitter = new EventEmitter();
  let running = false;
  let pollTimer = null;

  // -------------------------------------------------------------------------
  // scheduleNextPoll — schedule the next iteration
  // -------------------------------------------------------------------------
  function scheduleNextPoll() {
    if (!running) return;
    pollTimer = setTimeout(poll, interval);
  }

  // -------------------------------------------------------------------------
  // poll — one iteration of the dispatch loop
  // -------------------------------------------------------------------------
  function poll() {
    if (!running) return;

    // 1. Check mission state — stop if paused
    const state = readState(normWorkspacePath);
    if (state && state.state === 'paused') {
      running = false;
      pollTimer = null;
      setImmediate(() => emitter.emit('stopped', { reason: 'paused' }));
      return;
    }

    // 2. Load features state machine
    let machine;
    try {
      machine = new FeaturesStateMachine(normFeaturesPath);
      machine.load();
    } catch (err) {
      emitter.emit('error', err);
      scheduleNextPoll();
      return;
    }

    // 3. Stop if no features are still pending
    const pendingFeatures = machine.getAllFeatures().filter(f => f.status === 'pending');
    if (pendingFeatures.length === 0) {
      running = false;
      pollTimer = null;
      setImmediate(() => emitter.emit('stopped', { reason: 'no-pending-features' }));
      return;
    }

    // 4. Get features that can be dispatched right now (preconditions met)
    const eligibleFeatures = machine.getEligibleFeatures();

    for (const feature of eligibleFeatures) {
      if (!running) break;

      // 4a. Delegate to the security-hardened dispatcher. This wires the
      //     Phase 0.5 defenses (SKILL_ALLOWLIST + skillName regex,
      //     payload-size cap, retry ceiling, proposer/effector resolution,
      //     budget acquisition + release on error) into the production path.
      let result;
      try {
        result = dispatcherModule.dispatchFeature({
          db,
          budget,
          featuresPath: normFeaturesPath,
          missionPath,
          chatId: 'mission-engine',
          estimatedTokens: 1000,
          validateSkills: false,
          cwd: normWorkspacePath,
        });
      } catch (dispatchErr) {
        emitter.emit('error', dispatchErr);
        continue;
      }

      // 4b. Translate dispatcher result into loop events.
      if (!result || result.dispatched === false) {
        if (result && result.reason === 'budget_exhausted') {
          setImmediate(() =>
            emitter.emit('budget-exhausted', { retryAfterMs: result.retryAfterMs || 0 })
          );
          break;
        }
        // Other rejections (skill_name_invalid, payload_too_large,
        // max_retries_exceeded, skill_not_allowlisted, skill_proposed,
        // enqueue_error, no_eligible_features) surface as error/info events
        // without blocking the loop.
        if (result && result.reason && result.reason !== 'no_eligible_features') {
          const dispatchErr = new Error(
            `dispatchFeature rejected feature ${result.featureId || 'n/a'}: ${result.reason}`
          );
          dispatchErr.code = result.reason;
          dispatchErr.featureId = result.featureId;
          emitter.emit('error', dispatchErr);
        }
        // Stop iterating eligible features — dispatcher only handles one per call
        break;
      }

      // 4c. Successful dispatch — transition state machine and emit event.
      try {
        machine.transition(result.featureId || feature.id, 'in_progress');
      } catch (transitionErr) {
        emitter.emit('error', transitionErr);
        continue;
      }

      const sessionId = generateSessionId();
      const dispatchPayload = { featureId: result.featureId || feature.id, sessionId };
      setImmediate(() => emitter.emit('worker-dispatched', dispatchPayload));
    }

    scheduleNextPoll();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start the dispatch loop. Idempotent — calling start() while running is a no-op.
   */
  function start() {
    if (running) return;
    running = true;
    // First poll immediately (delay 0 so callers can attach listeners first)
    pollTimer = setTimeout(poll, 0);
  }

  /**
   * Stop the dispatch loop. Safe to call multiple times.
   */
  function stop() {
    running = false;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  emitter.start = start;
  emitter.stop = stop;

  return emitter;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { createDispatchLoop };
