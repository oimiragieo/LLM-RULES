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
const { enqueueMessage } = require('../db/queue-operations.cjs');

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
 * @param {string} opts.missionPath     - Path to mission.md (reserved for future use)
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

  // Use missionPath in future when persona injection is wired here
  void missionPath;

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

      // 4a. Acquire a budget slot — stop dispatching this cycle if denied
      const slot = budget.acquireWorkerSlot(1000);
      if (!slot.allowed) {
        setImmediate(() =>
          emitter.emit('budget-exhausted', { retryAfterMs: slot.retryAfterMs || 0 })
        );
        break;
      }

      // 4b. Transition feature to in_progress
      try {
        machine.transition(feature.id, 'in_progress');
      } catch (transitionErr) {
        slot.release();
        emitter.emit('error', transitionErr);
        continue;
      }

      // 4c. Generate worker session ID
      const sessionId = generateSessionId();

      // 4d. Enqueue dispatch payload to the worker pool
      const payload = {
        featureId: feature.id,
        skillName: feature.skillName || 'unknown',
        sessionId,
      };

      try {
        enqueueMessage(db, {
          chatId: 'mission-engine',
          text: JSON.stringify(payload),
          attachments: [],
        });
        slot.release();
      } catch (enqueueErr) {
        slot.release();
        emitter.emit('error', enqueueErr);
        continue;
      }

      // 4e. Emit worker-dispatched event (setImmediate per testing-quirks.md)
      const dispatchPayload = { featureId: feature.id, sessionId };
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
