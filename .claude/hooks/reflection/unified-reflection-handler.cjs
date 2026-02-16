#!/usr/bin/env node
/**
 * Hook: unified-reflection-handler.cjs
 * Trigger: PostToolUse (TaskUpdate, Bash, Task) + SessionEnd
 * Purpose: Consolidated handler for reflection, memory extraction, and task tracking
 */

'use strict';

const path = require('path');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { appendJsonl } = require('../../lib/utils/jsonl-utils.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getToolOutput,
  auditLog,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');
const routerState = require('../../lib/routing/router-state.cjs');
const { parseAndValidateTaskUpdate } = require('../../lib/routing/task-update-contract.cjs');
const taskClaimLedger = require('../../lib/routing/task-claim-ledger.cjs');

const {
  gatherSessionInsights: gatherSessionInsightsBase,
  parseSessionInsightsFromMarkdown,
} = require('./unified-reflection-insights.cjs');
const { createReflectionEventHandlers } = require('./unified-reflection-events.cjs');
const { createReflectionActions } = require('./unified-reflection-actions.cjs');

let errorSummaryExtractor = null;
try {
  errorSummaryExtractor = require('./error-summary-extractor.cjs');
} catch (_e) {
  // graceful degradation
}

let mlIndex = null;
try {
  mlIndex = require('../../lib/ml/index.cjs');
} catch (_e) {
  // graceful degradation
}

let QUEUE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'reflection-queue.jsonl');
const REFLECTION_QUEUE_MAX_LINES = Number(process.env.REFLECTION_QUEUE_MAX_LINES || 5000);
const SESSION_END_EVENTS = ['Stop', 'SessionEnd'];
const MIN_OUTPUT_LENGTH = 50;

function isEnabled() {
  if (process.env.REFLECTION_ENABLED === 'false') {
    return false;
  }

  const mode = process.env.REFLECTION_HOOK_MODE || 'block';
  if (mode === 'off') {
    return false;
  }

  return true;
}

function gatherSessionInsights(input = null) {
  return gatherSessionInsightsBase(PROJECT_ROOT, input);
}

const eventHandlers = createReflectionEventHandlers({
  getToolName,
  getToolInput,
  getToolOutput,
  debugLog,
  routerState,
  taskClaimLedger,
  parseAndValidateTaskUpdate,
  gatherSessionInsights,
  errorSummaryExtractor,
  sessionEndEvents: SESSION_END_EVENTS,
  minOutputLength: MIN_OUTPUT_LENGTH,
});

const actions = createReflectionActions({
  projectRoot: PROJECT_ROOT,
  isEnabled,
  appendJsonl,
  auditLog,
  debugLog,
  mlIndex,
  reflectionQueueMaxLines: REFLECTION_QUEUE_MAX_LINES,
});

function queueReflection(entry, queueFile = QUEUE_FILE) {
  return actions.queueReflection(entry, queueFile);
}

async function main() {
  const startTime = Date.now();
  const outcome = {
    eventType: null,
    queued: false,
    sessionRecorded: false,
    memoryItemsRecorded: false,
    taskUpdateTracked: false,
    embeddingTriggered: false,
    maintenanceTriggered: false,
  };

  try {
    if (!isEnabled()) {
      process.exit(0);
    }

    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    const eventType = eventHandlers.detectEventType(hookInput);
    if (!eventType) {
      process.exit(0);
    }

    outcome.eventType = eventType;

    switch (eventType) {
      case 'task_completion': {
        const entry = eventHandlers.handleTaskCompletion(hookInput);
        queueReflection(entry);
        outcome.queued = true;
        break;
      }
      case 'task_update': {
        eventHandlers.handleTaskUpdate(hookInput);
        outcome.taskUpdateTracked = true;
        break;
      }
      case 'error_recovery': {
        const entry = eventHandlers.handleErrorRecovery(hookInput);
        queueReflection(entry);
        outcome.queued = true;
        break;
      }
      case 'session_end': {
        const result = eventHandlers.handleSessionEnd(hookInput);
        queueReflection(result.reflection);
        outcome.queued = true;

        await actions.recordSession(result.sessionData);
        outcome.sessionRecorded = true;

        outcome.embeddingTriggered = true;
        await actions.triggerEmbeddingGeneration(result.sessionData).catch(err => {
          debugLog('unified-reflection', 'Embedding generation failed', err);
        });

        actions.triggerMLSessionEnd(result);
        actions.triggerMaintenance();
        actions.triggerObservationCompaction();
        outcome.maintenanceTriggered = true;
        break;
      }
      case 'memory_extraction': {
        const extracted = eventHandlers.handleMemoryExtraction(hookInput);
        actions.recordMemoryItems(extracted);
        outcome.memoryItemsRecorded = true;
        break;
      }
      default:
        break;
    }

    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'unified-reflection-handler',
        output: outcome,
        duration: Date.now() - startTime,
      });
    } catch (_e) {
      // best-effort
    }

    process.exit(0);
  } catch (err) {
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'unified-reflection-handler',
        error: err.message,
      });
    } catch (_e) {
      // best-effort
    }

    debugLog('unified-reflection', 'Hook error during processing', err);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  isEnabled,
  gatherSessionInsights,
  parseSessionInsightsFromMarkdown,
  detectEventType: eventHandlers.detectEventType,

  handleTaskCompletion: eventHandlers.handleTaskCompletion,
  handleTaskUpdate: eventHandlers.handleTaskUpdate,
  handleErrorRecovery: eventHandlers.handleErrorRecovery,
  handleSessionEnd: eventHandlers.handleSessionEnd,
  handleMemoryExtraction: eventHandlers.handleMemoryExtraction,

  extractPatterns: eventHandlers.extractPatterns,
  extractGotchas: eventHandlers.extractGotchas,
  extractDiscoveries: eventHandlers.extractDiscoveries,
  getSessionStats: eventHandlers.getSessionStats,

  queueReflection,
  recordSession: actions.recordSession,
  triggerEmbeddingGeneration: actions.triggerEmbeddingGeneration,
  triggerMLSessionEnd: actions.triggerMLSessionEnd,
  triggerMaintenance: actions.triggerMaintenance,
  triggerObservationCompaction: actions.triggerObservationCompaction,
  recordMemoryItems: actions.recordMemoryItems,

  main,

  SESSION_END_EVENTS,
  MIN_OUTPUT_LENGTH,
  get QUEUE_FILE() {
    return QUEUE_FILE;
  },
  set QUEUE_FILE(val) {
    QUEUE_FILE = val;
  },
};
