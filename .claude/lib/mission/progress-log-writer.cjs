'use strict';

/**
 * Mission Progress Log Writer
 *
 * Typed event emitter for mission progress logging.
 * Appends JSON-line events to progress_log.jsonl with consistent shapes.
 * Aligned with Factory Droid progress_log.jsonl event format.
 *
 * Event types:
 * - mission_accepted: Mission initialized or resumed
 * - mission_run_started: Orchestrator begins work cycle
 * - worker_selected_feature: Feature chosen for execution
 * - worker_started: Worker subprocess spawned
 * - worker_completed: Worker finished successfully
 * - worker_failed: Worker crashed or timed out
 * - handoff_items_dismissed: Discovered issue triaged away
 * - milestone_validation_triggered: All milestone features done, validators queued
 * - scrutiny_validator_completed: Scrutiny review finished
 * - user_testing_validator_completed: User-testing review finished
 * - mission_paused: Orchestrator paused
 * - mission_completed: All milestones done
 */

const fs = require('node:fs');
const path = require('node:path');

// Lazy-load safeParseJSON to avoid circular dependency issues
let _safeParseJSON;
function getSafeParseJSON() {
  if (!_safeParseJSON) {
    try {
      const mod = require(path.join(__dirname, '..', 'utils', 'safe-json.cjs'));
      _safeParseJSON = mod.safeParseJSON;
    } catch {
      // Fallback if safe-json unavailable
      _safeParseJSON = str => {
        try {
          return JSON.parse(str);
        } catch {
          return null;
        }
      };
    }
  }
  return _safeParseJSON;
}

const VALID_EVENT_TYPES = new Set([
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
]);

/**
 * Create a typed event and append it to the log file.
 * @param {string} logFilePath - Path to progress_log.jsonl
 * @param {string} type - Event type
 * @param {object} fields - Type-specific event fields
 */
function appendEvent(logFilePath, type, fields) {
  if (!VALID_EVENT_TYPES.has(type)) {
    throw new Error(`Invalid event type: ${type}`);
  }

  const event = {
    timestamp: new Date().toISOString(),
    type,
    ...fields,
  };

  const dir = path.dirname(logFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.appendFileSync(logFilePath, JSON.stringify(event) + '\n', 'utf8');
  return event;
}

/**
 * Read events from a progress log file.
 * @param {string} logFilePath - Path to progress_log.jsonl
 * @param {string} [typeFilter] - Optional event type to filter by
 * @returns {object[]} Array of parsed events
 */
function readEvents(logFilePath, typeFilter) {
  if (!fs.existsSync(logFilePath)) {
    return [];
  }

  const safeParseJSON = getSafeParseJSON();
  const content = fs.readFileSync(logFilePath, 'utf8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  const events = [];

  for (const line of lines) {
    const parsed = safeParseJSON(line);
    if (parsed && typeof parsed === 'object' && parsed.type && parsed.timestamp) {
      if (!typeFilter || parsed.type === typeFilter) {
        events.push(parsed);
      }
    }
    // Skip corrupt lines silently
  }

  return events;
}

/**
 * Get total event count from a progress log file.
 * @param {string} logFilePath - Path to progress_log.jsonl
 * @returns {number} Total event count
 */
function getEventCount(logFilePath) {
  if (!fs.existsSync(logFilePath)) {
    return 0;
  }

  const content = fs.readFileSync(logFilePath, 'utf8');
  return content.split('\n').filter(line => line.trim().length > 0).length;
}

/**
 * Create a progress log writer bound to a specific log file.
 * @param {string} logFilePath - Path to progress_log.jsonl
 * @returns {object} Writer with typed event methods
 */
function createProgressLogWriter(logFilePath) {
  if (!logFilePath || typeof logFilePath !== 'string') {
    throw new Error('logFilePath is required and must be a string');
  }

  return {
    logMissionAccepted({ missionId, message }) {
      return appendEvent(logFilePath, 'mission_accepted', { missionId, message });
    },

    logMissionRunStarted({ missionId, message }) {
      return appendEvent(logFilePath, 'mission_run_started', { missionId, message });
    },

    logWorkerSelectedFeature({ featureId, workerSessionId }) {
      return appendEvent(logFilePath, 'worker_selected_feature', {
        featureId,
        workerSessionId,
      });
    },

    logWorkerStarted({ featureId, workerSessionId, spawnId }) {
      return appendEvent(logFilePath, 'worker_started', {
        featureId,
        workerSessionId,
        spawnId,
      });
    },

    logWorkerCompleted({
      featureId,
      workerSessionId,
      commitId,
      exitCode,
      successState,
      validatorsPassed,
      returnToOrchestrator,
      handoff,
    }) {
      return appendEvent(logFilePath, 'worker_completed', {
        featureId,
        workerSessionId,
        commitId,
        exitCode,
        successState,
        validatorsPassed,
        returnToOrchestrator,
        handoff,
      });
    },

    logWorkerFailed({ workerSessionId, spawnId, reason }) {
      return appendEvent(logFilePath, 'worker_failed', {
        workerSessionId,
        spawnId,
        reason,
      });
    },

    logHandoffItemsDismissed({ dismissals }) {
      return appendEvent(logFilePath, 'handoff_items_dismissed', { dismissals });
    },

    logMilestoneValidationTriggered({ milestone }) {
      return appendEvent(logFilePath, 'milestone_validation_triggered', { milestone });
    },

    logScrutinyValidatorCompleted({ milestone, validatorSessionId }) {
      return appendEvent(logFilePath, 'scrutiny_validator_completed', {
        milestone,
        validatorSessionId,
      });
    },

    logUserTestingValidatorCompleted({ milestone, validatorSessionId }) {
      return appendEvent(logFilePath, 'user_testing_validator_completed', {
        milestone,
        validatorSessionId,
      });
    },

    logMissionPaused({ reason }) {
      return appendEvent(logFilePath, 'mission_paused', { reason });
    },

    logMissionCompleted({ completedFeatures, totalFeatures }) {
      return appendEvent(logFilePath, 'mission_completed', {
        completedFeatures,
        totalFeatures,
      });
    },

    readEvents(typeFilter) {
      return readEvents(logFilePath, typeFilter);
    },

    getEventCount() {
      return getEventCount(logFilePath);
    },
  };
}

module.exports = {
  createProgressLogWriter,
  readEvents,
  getEventCount,
  VALID_EVENT_TYPES,
};
