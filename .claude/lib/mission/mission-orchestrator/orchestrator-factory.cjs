'use strict';

/**
 * Mission Orchestrator — Factory
 *
 * createMissionOrchestrator factory function with 12 closure methods.
 * Binds to a mission directory and provides step functions for the
 * orchestration loop.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeParseJSON } = require('../../utils/safe-json.cjs');
const { createProgressLogWriter } = require('../progress-log-writer.cjs');
const { loadMissionState, saveMissionState, saveFeaturesDoc } = require('./state-io.cjs');
const {
  findNextEligibleFeature,
  isMilestoneComplete,
  getMilestones,
  injectMilestoneValidators,
} = require('./feature-selection.cjs');

/**
 * Create a mission orchestrator bound to a mission directory.
 * @param {string} missionDir - Path to mission bundle directory
 * @returns {object} Orchestrator with step functions
 */
function createMissionOrchestrator(missionDir) {
  if (!isDirectory(missionDir)) {
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

      // Check milestone completion and auto-inject validators
      const milestoneComplete = isMilestoneComplete(features, feature.milestone);
      let validatorsInjected = null;
      if (milestoneComplete) {
        logger.logMilestoneValidationTriggered({ milestone: feature.milestone });
        validatorsInjected = injectMilestoneValidators(missionDir, features, feature.milestone);

        // Update state with milestone validation planned
        if (validatorsInjected.injected) {
          const updatedState = loadMissionState(missionDir).state;
          if (!updatedState.milestonesWithValidationPlanned) {
            updatedState.milestonesWithValidationPlanned = [];
          }
          if (!updatedState.milestonesWithValidationPlanned.includes(feature.milestone)) {
            updatedState.milestonesWithValidationPlanned.push(feature.milestone);
          }
          updatedState.totalFeatures = loadMissionState(missionDir).features.length;
          saveMissionState(missionDir, updatedState);
        }
      }

      // Aggregate skill feedback after each handoff for deviation tracking
      let skillHealth = null;
      if (handoff.handoff && handoff.handoff.skillFeedback && feature.skillName) {
        try {
          const { checkSkillHealth } = require('../skill-feedback-aggregator.cjs');
          skillHealth = checkSkillHealth(missionDir, feature.skillName);
        } catch {
          // Aggregator may not be available — skip silently
        }
      }

      return {
        success: handoff.successState === 'success',
        milestone: feature.milestone,
        milestoneComplete,
        validatorsInjected,
        skillHealth,
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

    /**
     * Collect evidence for a completed feature and bind to validation-state.
     * @param {string} featureId - Feature to collect evidence for
     * @param {string} workingDirectory - Target repo path
     * @param {number} [timeoutMs=30000] - Per-step timeout
     * @returns {{ results: Array, evidenceFiles: string[], assertionsUpdated: string[] }}
     */
    collectEvidence(featureId, workingDirectory, timeoutMs = 30000) {
      const { features } = loadMissionState(missionDir);
      const feature = features.find(f => f.id === featureId);
      if (!feature) throw new Error(`Feature not found: ${featureId}`);

      const { collectAndBindEvidence } = require('../evidence-collector.cjs');

      const evidenceDir = path.join(missionDir, 'evidence');
      const validationStatePath = path.join(missionDir, 'validation-state.json');

      const result = collectAndBindEvidence({
        feature,
        evidenceDir,
        workingDirectory,
        validationStatePath,
        timeoutMs,
      });

      logger.logEvidenceCollected({
        featureId,
        evidenceFiles: result.evidenceFiles.length,
        assertionsUpdated: result.assertionsUpdated,
      });

      return result;
    },

    /**
     * Grade the mission or a specific feature using the alignment rubric.
     * @param {string} [featureId] - Optional feature to grade (grades entire mission if omitted)
     * @returns {object} Grading report conforming to grading-report.schema.json
     */
    grade(featureId) {
      const { MissionGrader } = require('../mission-grader.cjs');
      const grader = new MissionGrader();

      if (featureId) {
        const { features, validationState } = loadMissionState(missionDir);
        const feature = features.find(f => f.id === featureId);
        if (!feature) throw new Error(`Feature not found: ${featureId}`);

        // Find latest handoff for this feature
        const handoffsDir = path.join(missionDir, 'handoffs');
        let handoff = null;
        if (fs.existsSync(handoffsDir)) {
          const files = fs.readdirSync(handoffsDir).filter(f => f.endsWith('.json'));
          for (const file of files) {
            try {
              const h = safeParseJSON(
                fs.readFileSync(path.join(handoffsDir, file), 'utf8'),
                {}
              ).data;
              if (h.featureId === featureId) {
                if (!handoff || h.timestamp > handoff.timestamp) {
                  handoff = h;
                }
              }
            } catch {
              // Skip malformed
            }
          }
        }

        if (!handoff) throw new Error(`No handoff found for feature: ${featureId}`);

        const validationContract = fs.existsSync(path.join(missionDir, 'validation-contract.md'))
          ? fs.readFileSync(path.join(missionDir, 'validation-contract.md'), 'utf8')
          : '';

        return grader.gradeFeature(feature, handoff, {
          featuresDocument: { features },
          validationState,
          validationContract,
        });
      }

      return grader.gradeMission(missionDir);
    },

    /**
     * Generate a validation contract from features.json fulfills mappings.
     * Creates validation-contract.md and initializes validation-state.json.
     * @returns {{ contractPath: string, assertionCount: number }}
     */
    generateValidationContract() {
      const { features } = loadMissionState(missionDir);
      const contractPath = path.join(missionDir, 'validation-contract.md');
      const validationStatePath = path.join(missionDir, 'validation-state.json');

      // Collect all VAL-* IDs grouped by milestone
      const milestoneAssertions = {};
      for (const feature of features) {
        if (!feature.fulfills || feature.fulfills.length === 0) continue;
        const ms = feature.milestone || 'default';
        if (!milestoneAssertions[ms]) milestoneAssertions[ms] = [];
        for (const valId of feature.fulfills) {
          milestoneAssertions[ms].push({
            valId,
            featureId: feature.id,
            description: feature.description,
            verificationSteps: feature.verificationSteps || [],
          });
        }
      }

      // Generate contract markdown
      const lines = ['# Validation Contract\n'];
      let assertionCount = 0;

      for (const [milestone, assertions] of Object.entries(milestoneAssertions)) {
        lines.push(`## Milestone: ${milestone}\n`);
        for (const a of assertions) {
          lines.push(`### ${a.valId}: ${a.featureId}`);
          lines.push(`${a.description}`);
          if (a.verificationSteps.length > 0) {
            lines.push(`Evidence: ${a.verificationSteps[0]}`);
          }
          lines.push('');
          assertionCount++;
        }
      }

      fs.writeFileSync(contractPath, lines.join('\n'), 'utf8');

      // Initialize validation-state.json with all assertions as pending
      let validationState = { assertions: {} };
      if (fs.existsSync(validationStatePath)) {
        try {
          validationState = safeParseJSON(fs.readFileSync(validationStatePath, 'utf8'), {
            assertions: {},
          }).data;
        } catch {
          validationState = { assertions: {} };
        }
      }

      for (const assertions of Object.values(milestoneAssertions)) {
        for (const a of assertions) {
          if (!validationState.assertions[a.valId]) {
            validationState.assertions[a.valId] = {
              status: 'pending',
            };
          }
        }
      }

      const tmpPath = validationStatePath + '.tmp.' + Date.now();
      fs.writeFileSync(tmpPath, JSON.stringify(validationState, null, 2) + '\n', 'utf8');
      fs.renameSync(tmpPath, validationStatePath);

      return { contractPath, assertionCount };
    },

    /** Expose logger for direct event access */
    logger,
  };
}

function isDirectory(dir) {
  if (!dir) {
    return false;
  }

  try {
    return fs.statSync(dir).isDirectory();
  } catch (_err) {
    return false;
  }
}

module.exports = {
  createMissionOrchestrator,
};
