'use strict';

/**
 * Milestone Manager
 *
 * Manages milestone progression and progress logging for the mission orchestrator.
 *
 * Exports:
 * - createMilestoneManager({workspacePath, featuresPath})
 *   Returns { checkMilestoneCompletion(milestone), isMilestoneUnlocked(milestone) }
 *   - checkMilestoneCompletion: evaluates MilestoneGate, returns {passed, blocking}.
 *     When passed, records the milestone in milestone-state.json and unlocks the next
 *     milestone. Logs milestone_gated (and mission_completed for the last milestone)
 *     to the workspace progress log.
 *   - isMilestoneUnlocked: returns true if a milestone may be dispatched.
 *     The first milestone (by declaration order in features.json) is always unlocked.
 *     Subsequent milestones are unlocked only after their predecessor's gate passes.
 *
 * - createProgressLogger(progressLogPath)
 *   Returns { log(event) } that appends JSONL lines:
 *   { timestamp, event, featureId?, milestone?, sessionId?, ...rest }
 *
 * Milestone state persisted to {workspacePath}/milestone-state.json (atomic write).
 * Progress log appended to {workspacePath}/progress/progress_log.jsonl.
 */

const fs = require('node:fs');
const path = require('node:path');

const { MilestoneGate } = require('../mission/milestone-gate.cjs');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Atomic JSON write: write to .tmp file then rename to prevent corruption.
 *
 * @param {string} filePath - Target file path
 * @param {object} data     - Object to serialize
 */
function atomicWriteJSON(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Derive milestone ordering from features.json.
 * Returns milestones in first-appearance order (preserving declaration order).
 *
 * @param {string} featuresPath
 * @returns {string[]}
 */
function getMilestoneOrder(featuresPath) {
  const data = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
  const seen = new Set();
  const order = [];
  for (const feature of data.features || []) {
    if (feature.milestone && !seen.has(feature.milestone)) {
      seen.add(feature.milestone);
      order.push(feature.milestone);
    }
  }
  return order;
}

/**
 * Read milestone-state.json from workspace directory.
 * Returns a default empty state if the file does not exist or is unreadable.
 *
 * @param {string} workspacePath
 * @returns {{ passedMilestones: string[], unlockedMilestones: string[] }}
 */
function readMilestoneState(workspacePath) {
  const statePath = path.join(workspacePath, 'milestone-state.json');
  try {
    if (fs.existsSync(statePath)) {
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return {
        passedMilestones: Array.isArray(raw.passedMilestones) ? raw.passedMilestones : [],
        unlockedMilestones: Array.isArray(raw.unlockedMilestones) ? raw.unlockedMilestones : [],
      };
    }
  } catch {
    // Fall through to default
  }
  return { passedMilestones: [], unlockedMilestones: [] };
}

/**
 * Persist milestone state atomically.
 *
 * @param {string} workspacePath
 * @param {{ passedMilestones: string[], unlockedMilestones: string[] }} state
 */
function writeMilestoneState(workspacePath, state) {
  const statePath = path.join(workspacePath, 'milestone-state.json');
  atomicWriteJSON(statePath, state);
}

// ---------------------------------------------------------------------------
// createProgressLogger
// ---------------------------------------------------------------------------

/**
 * Create a progress logger that appends JSONL lines to a file.
 *
 * Each call to log(event) appends one line:
 *   { timestamp: ISO-string, event: string, ...rest }
 *
 * The parent directory is created automatically on first use.
 *
 * @param {string} progressLogPath - Absolute or relative path to the .jsonl file
 * @returns {{ log: function(object): void }}
 */
function createProgressLogger(progressLogPath) {
  const normPath = path.normalize(progressLogPath);

  /**
   * Append one JSONL event line.
   *
   * @param {object} event - Must include at minimum an `event` string field.
   *   Optional: featureId, milestone, sessionId, and any other fields.
   */
  function log(event) {
    // Ensure parent directory exists (idempotent)
    const dir = path.dirname(normPath);
    fs.mkdirSync(dir, { recursive: true });

    const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(normPath, line, 'utf8');
  }

  return { log };
}

// ---------------------------------------------------------------------------
// createMilestoneManager
// ---------------------------------------------------------------------------

/**
 * Create a milestone manager.
 *
 * @param {object} opts
 * @param {string} opts.workspacePath - Mission workspace directory
 * @param {string} opts.featuresPath  - Path to features.json
 * @returns {{
 *   checkMilestoneCompletion: function(string): Promise<{passed:boolean, blocking:object[]}>,
 *   isMilestoneUnlocked: function(string): boolean
 * }}
 */
function createMilestoneManager({ workspacePath, featuresPath }) {
  const normWorkspacePath = path.normalize(workspacePath);
  const normFeaturesPath = path.normalize(featuresPath);

  // Default progress log path inside the workspace
  const defaultLogPath = path.join(normWorkspacePath, 'progress', 'progress_log.jsonl');
  const logger = createProgressLogger(defaultLogPath);

  // Path to validation-state.json (may not exist; MilestoneGate handles missing gracefully)
  const validationStatePath = path.join(normWorkspacePath, 'validation-state.json');

  // -------------------------------------------------------------------------
  // checkMilestoneCompletion
  // -------------------------------------------------------------------------

  /**
   * Evaluate the MilestoneGate for a milestone.
   *
   * Returns { passed, blocking } from the gate result.
   * When passed:
   *   - Records the milestone in milestone-state.json as passed.
   *   - Adds the next milestone (by declaration order) to unlockedMilestones.
   *   - Logs a `milestone_gated` event.
   *   - If this was the last milestone, also logs a `mission_completed` event.
   *
   * @param {string} milestone - Milestone name to evaluate
   * @returns {Promise<{ passed: boolean, blocking: object[] }>}
   */
  async function checkMilestoneCompletion(milestone) {
    // Always pass validationStatePath — ValidationStateGatekeeper creates the file if missing.
    // Passing null would cause path.normalize(null) to throw inside the gatekeeper.
    const gate = new MilestoneGate({
      milestone,
      featuresPath: normFeaturesPath,
      statePath: validationStatePath,
    });

    const result = await gate.evaluate();

    if (result.passed) {
      // Load current state and milestone ordering
      const milestoneState = readMilestoneState(normWorkspacePath);
      const milestoneOrder = getMilestoneOrder(normFeaturesPath);

      // Record the passed milestone (idempotent)
      if (!milestoneState.passedMilestones.includes(milestone)) {
        milestoneState.passedMilestones.push(milestone);
      }

      // Unlock the next milestone in declaration order
      const currentIdx = milestoneOrder.indexOf(milestone);
      const isLastMilestone = currentIdx === milestoneOrder.length - 1;

      if (!isLastMilestone && currentIdx >= 0) {
        const nextMilestone = milestoneOrder[currentIdx + 1];
        if (!milestoneState.unlockedMilestones.includes(nextMilestone)) {
          milestoneState.unlockedMilestones.push(nextMilestone);
        }
      }

      // Persist updated state atomically
      writeMilestoneState(normWorkspacePath, milestoneState);

      // Log milestone_gated event
      logger.log({ event: 'milestone_gated', milestone });

      // Log mission_completed when every milestone has now passed
      const allPassed = milestoneOrder.every(m => milestoneState.passedMilestones.includes(m));
      if (allPassed) {
        logger.log({ event: 'mission_completed' });
      }
    }

    return { passed: result.passed, blocking: result.blocking };
  }

  // -------------------------------------------------------------------------
  // isMilestoneUnlocked
  // -------------------------------------------------------------------------

  /**
   * Check whether a milestone may be dispatched.
   *
   * Rules:
   * - The first milestone (by declaration order in features.json) is always unlocked.
   * - All subsequent milestones are locked until their predecessor's gate passes
   *   (i.e., they appear in milestone-state.json's unlockedMilestones array).
   *
   * @param {string} milestone - Milestone name to check
   * @returns {boolean}
   */
  function isMilestoneUnlocked(milestone) {
    const milestoneOrder = getMilestoneOrder(normFeaturesPath);

    // First milestone is always unlocked
    if (milestoneOrder.length > 0 && milestoneOrder[0] === milestone) {
      return true;
    }

    // Check whether this milestone was explicitly unlocked
    const milestoneState = readMilestoneState(normWorkspacePath);
    return milestoneState.unlockedMilestones.includes(milestone);
  }

  return { checkMilestoneCompletion, isMilestoneUnlocked };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { createMilestoneManager, createProgressLogger };
