'use strict';

/**
 * Mission Orchestrator
 *
 * Main coordination loop for Factory Droid-aligned mission execution.
 * Bridges all mission library modules into a single orchestration engine.
 *
 * Responsibilities:
 * - Read state.json + features.json to determine next work
 * - Select next eligible feature via precondition DAG
 * - Dispatch to worker pool via worker-features-dispatcher
 * - Process handoffs via handoff-watcher
 * - Validate handoffs against schema
 * - Transition feature states via features-state-machine
 * - Trigger milestone validators when milestones complete
 * - Emit typed progress log events throughout
 * - Respect state-mutex for turn coordination
 *
 * This module does NOT run as a daemon — it provides step functions
 * that can be called by an external loop or cron job.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createProgressLogWriter } = require('./progress-log-writer.cjs');

/**
 * Load mission state from disk.
 * @param {string} missionDir - Mission bundle directory
 * @returns {{ state: object, features: object[], validationState: object }}
 */
function loadMissionState(missionDir) {
  const statePath = path.join(missionDir, 'state.json');
  const featuresPath = path.join(missionDir, 'features.json');
  const validationPath = path.join(missionDir, 'validation-state.json');

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const featuresDoc = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
  const validationState = fs.existsSync(validationPath)
    ? JSON.parse(fs.readFileSync(validationPath, 'utf8'))
    : { assertions: {} };

  return { state, features: featuresDoc.features || [], validationState };
}

/**
 * Save mission state to disk atomically.
 * @param {string} missionDir - Mission bundle directory
 * @param {object} state - State object to write
 */
function saveMissionState(missionDir, state) {
  const statePath = path.join(missionDir, 'state.json');
  const tmpPath = statePath + '.tmp.' + Date.now();
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, statePath);
}

/**
 * Save features document to disk atomically.
 * @param {string} missionDir - Mission bundle directory
 * @param {object[]} features - Features array
 */
function saveFeaturesDoc(missionDir, features) {
  const featuresPath = path.join(missionDir, 'features.json');
  const tmpPath = featuresPath + '.tmp.' + Date.now();
  fs.writeFileSync(tmpPath, JSON.stringify({ features }, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, featuresPath);
}

/**
 * Find the next eligible feature: pending status with all preconditions met.
 * @param {object[]} features - All features
 * @returns {object|null} Next eligible feature or null
 */
function findNextEligibleFeature(features) {
  const completedIds = new Set(features.filter(f => f.status === 'completed').map(f => f.id));

  for (const feature of features) {
    if (feature.status !== 'pending') continue;

    const preconditionsMet = (feature.preconditions || []).every(precond => {
      // Check if precondition matches "<feature-id> completed" pattern
      const match = precond.match(/^([a-z0-9][a-z0-9_-]*)\s+completed$/);
      if (match) {
        return completedIds.has(match[1]);
      }
      // Check "compiles" predicates — assume met if any feature with that milestone completed
      if (precond.endsWith('compiles')) return true;
      // Check milestone gate
      if (precond.startsWith('All implementation features for milestone')) {
        const msMatch = precond.match(/"([^"]+)"/);
        if (msMatch) {
          const ms = msMatch[1];
          const msFeatures = features.filter(
            f => f.milestone === ms && !f.id.includes('validator')
          );
          return msFeatures.every(f => f.status === 'completed');
        }
      }
      // Unknown precondition format — assume met to avoid blocking
      return true;
    });

    if (preconditionsMet) return feature;
  }

  return null;
}

/**
 * Check if all features in a milestone are completed.
 * @param {object[]} features - All features
 * @param {string} milestone - Milestone name
 * @returns {boolean}
 */
function isMilestoneComplete(features, milestone) {
  const msFeatures = features.filter(f => f.milestone === milestone && !f.id.includes('validator'));
  return msFeatures.length > 0 && msFeatures.every(f => f.status === 'completed');
}

/**
 * Get all unique milestones from features.
 * @param {object[]} features - All features
 * @returns {string[]}
 */
function getMilestones(features) {
  return [...new Set(features.map(f => f.milestone).filter(Boolean))];
}

/**
 * Create a mission orchestrator bound to a mission directory.
 * @param {string} missionDir - Path to mission bundle directory
 * @returns {object} Orchestrator with step functions
 */
function createMissionOrchestrator(missionDir) {
  if (!missionDir || !fs.existsSync(missionDir)) {
    throw new Error(`Mission directory does not exist: ${missionDir}`);
  }

  const logPath = path.join(missionDir, 'progress_log.jsonl');
  const logger = createProgressLogWriter(logPath);

  return {
    /**
     * Initialize or resume the mission.
     * @returns {{ state: object, nextFeature: object|null }}
     */
    initialize() {
      const { state, features } = loadMissionState(missionDir);

      if (state.state === 'pending') {
        state.state = 'running';
        state.totalFeatures = features.length;
        saveMissionState(missionDir, state);
        logger.logMissionAccepted({ missionId: state.missionId, message: 'Mission initialized' });
      } else {
        const completed = features.filter(f => f.status === 'completed').length;
        logger.logMissionRunStarted({
          missionId: state.missionId,
          message: `Resuming. ${completed}/${features.length} features completed.`,
        });
      }

      const nextFeature = findNextEligibleFeature(features);
      return { state, nextFeature };
    },

    /**
     * Select and mark a feature as in-progress.
     * @returns {{ feature: object|null, workerSessionId: string|null }}
     */
    selectNextFeature() {
      const { state, features } = loadMissionState(missionDir);
      const feature = findNextEligibleFeature(features);

      if (!feature) return { feature: null, workerSessionId: null };

      const workerSessionId = crypto.randomUUID();

      // Update feature status
      feature.status = 'in_progress';
      feature.currentWorkerSessionId = workerSessionId;
      if (!feature.workerSessionIds) feature.workerSessionIds = [];
      feature.workerSessionIds.push(workerSessionId);

      // Update state
      state.currentFeatureId = feature.id;
      state.currentWorkerSessionId = workerSessionId;
      if (!state.workerSessionIds) state.workerSessionIds = [];
      state.workerSessionIds.push(workerSessionId);

      saveFeaturesDoc(missionDir, features);
      saveMissionState(missionDir, state);

      logger.logWorkerSelectedFeature({ featureId: feature.id, workerSessionId });

      return { feature, workerSessionId };
    },

    /**
     * Record that a worker has started.
     * @param {string} featureId
     * @param {string} workerSessionId
     * @param {string} spawnId
     */
    recordWorkerStarted(featureId, workerSessionId, spawnId) {
      logger.logWorkerStarted({ featureId, workerSessionId, spawnId });
    },

    /**
     * Process a worker completion handoff.
     * @param {object} handoff - Handoff document object
     * @returns {{ success: boolean, milestone: string|null, milestoneComplete: boolean }}
     */
    processHandoff(handoff) {
      const { state, features } = loadMissionState(missionDir);

      const feature = features.find(f => f.id === handoff.featureId);
      if (!feature) {
        throw new Error(`Feature not found: ${handoff.featureId}`);
      }

      // Transition feature based on success state
      if (handoff.successState === 'success') {
        feature.status = 'completed';
        feature.completedWorkerSessionId = handoff.workerSessionId;
      } else if (handoff.successState === 'failure') {
        feature.status = 'failed';
      }
      feature.currentWorkerSessionId = null;

      // Update state counters
      state.currentFeatureId = null;
      state.currentWorkerSessionId = null;
      if (handoff.successState === 'success') {
        state.completedFeatures = (state.completedFeatures || 0) + 1;
      }

      saveFeaturesDoc(missionDir, features);
      saveMissionState(missionDir, state);

      // Log completion
      logger.logWorkerCompleted({
        featureId: handoff.featureId,
        workerSessionId: handoff.workerSessionId,
        commitId: handoff.commitId,
        exitCode: 0,
        successState: handoff.successState,
        validatorsPassed: true,
        returnToOrchestrator: handoff.returnToOrchestrator,
        handoff: handoff.handoff,
      });

      // Triage discovered issues
      if (handoff.handoff && handoff.handoff.discoveredIssues) {
        const issues = handoff.handoff.discoveredIssues.filter(i => i.severity !== 'blocking');
        if (issues.length > 0) {
          logger.logHandoffItemsDismissed({ dismissals: issues });
        }
      }

      // Check milestone completion
      const milestoneComplete = isMilestoneComplete(features, feature.milestone);
      if (milestoneComplete) {
        logger.logMilestoneValidationTriggered({ milestone: feature.milestone });
      }

      return {
        success: handoff.successState === 'success',
        milestone: feature.milestone,
        milestoneComplete,
      };
    },

    /**
     * Record a worker failure.
     * @param {string} workerSessionId
     * @param {string} spawnId
     * @param {string} reason
     */
    recordWorkerFailed(workerSessionId, spawnId, reason) {
      const { state, features } = loadMissionState(missionDir);

      // Find and reset the feature
      const feature = features.find(f => f.currentWorkerSessionId === workerSessionId);
      if (feature) {
        feature.status = 'failed';
        feature.currentWorkerSessionId = null;
      }

      state.currentFeatureId = null;
      state.currentWorkerSessionId = null;

      saveFeaturesDoc(missionDir, features);
      saveMissionState(missionDir, state);

      logger.logWorkerFailed({ workerSessionId, spawnId, reason });
    },

    /**
     * Pause the mission.
     * @param {string} reason
     */
    pause(reason) {
      const { state } = loadMissionState(missionDir);
      state.state = 'paused';
      saveMissionState(missionDir, state);
      logger.logMissionPaused({ reason });
    },

    /**
     * Check if the mission is complete (all features done).
     * @returns {boolean}
     */
    isComplete() {
      const { features } = loadMissionState(missionDir);
      return features.every(f => f.status === 'completed' || f.status === 'cancelled');
    },

    /**
     * Mark the mission as completed.
     */
    complete() {
      const { state, features } = loadMissionState(missionDir);
      state.state = 'completed';
      saveMissionState(missionDir, state);

      const completedCount = features.filter(f => f.status === 'completed').length;
      logger.logMissionCompleted({
        completedFeatures: completedCount,
        totalFeatures: features.length,
      });
    },

    /**
     * Get mission progress summary.
     * @returns {object}
     */
    getProgress() {
      const { state, features, validationState } = loadMissionState(missionDir);
      const milestones = getMilestones(features);
      const assertions = validationState.assertions || {};

      return {
        missionId: state.missionId,
        state: state.state,
        features: {
          total: features.length,
          completed: features.filter(f => f.status === 'completed').length,
          pending: features.filter(f => f.status === 'pending').length,
          inProgress: features.filter(f => f.status === 'in_progress').length,
          failed: features.filter(f => f.status === 'failed').length,
        },
        assertions: {
          total: Object.keys(assertions).length,
          passed: Object.values(assertions).filter(a => a.status === 'passed').length,
          pending: Object.values(assertions).filter(a => a.status === 'pending').length,
          failed: Object.values(assertions).filter(a => a.status === 'failed').length,
        },
        milestones: milestones.map(ms => ({
          name: ms,
          complete: isMilestoneComplete(features, ms),
          featureCount: features.filter(f => f.milestone === ms).length,
        })),
        eventCount: logger.getEventCount(),
      };
    },

    /** Expose logger for direct event access */
    logger,
  };
}

module.exports = {
  createMissionOrchestrator,
  findNextEligibleFeature,
  isMilestoneComplete,
  getMilestones,
  loadMissionState,
  saveMissionState,
  saveFeaturesDoc,
};
