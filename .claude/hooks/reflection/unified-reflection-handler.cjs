#!/usr/bin/env node
/**
 * Hook: unified-reflection-handler.cjs
 * Trigger: PostToolUse (TaskUpdate, Bash, Task) + SessionEnd
 * Purpose: Consolidated handler for reflection, memory extraction, and task tracking
 */

'use strict';

const fs = require('node:fs');
const path = require('path');
const crypto = require('node:crypto');

const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const { appendJsonl } = require('../../lib/utils/jsonl-utils.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
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
  generateAndPersistDispatchPlan,
  DEFAULT_DISPATCH_PATH,
} = require('../../lib/evolution/evolution-request-router.cjs');

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
const REFLECTION_QUEUE_MAX_LINES = Number(process.env.REFLECTION_QUEUE_MAX_LINES || 2000);
const SESSION_END_EVENTS = ['Stop', 'SessionEnd'];
const MIN_OUTPUT_LENGTH = 50;
const STALE_ARTIFACTS_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'stale-artifacts.json'
);
const EVOLUTION_REQUESTS_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'evolution-requests.jsonl'
);
const STALE_CONSUMPTION_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'stale-artifacts-consumed.json'
);
const FAILURE_RECURRENCE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'failure-recurrence.json'
);

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

async function appendReflectionLogEntry(entry, options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const appendFn = options.appendJsonl || appendJsonl;
  const logPath = path.join(projectRoot, '.claude', 'context', 'memory', 'reflection-log.jsonl');
  const payload = {
    ...entry,
    timestamp: entry?.timestamp || new Date().toISOString(),
    memoryWrites: Array.isArray(entry?.memoryWrites) ? entry.memoryWrites : [],
    memoryReadSource: entry?.memoryReadSource || 'static_only',
  };
  appendFn(logPath, payload, { maxLines: 5000 });
}

async function attachSemanticPriorLearnings(entry, options = {}) {
  const baseEntry = entry && typeof entry === 'object' ? { ...entry } : {};
  const semanticReadEnabled =
    (process.env.REFLECTION_SEMANTIC_READ || 'on').toLowerCase() !== 'off';
  if (!semanticReadEnabled) {
    return {
      ...baseEntry,
      priorRelatedLearnings: [],
      memoryReadSource: 'static_only',
    };
  }

  const query = String(baseEntry.summary || baseEntry.error || baseEntry.tool || '').trim();
  if (!query) {
    return {
      ...baseEntry,
      priorRelatedLearnings: [],
      memoryReadSource: 'static_only',
    };
  }

  try {
    const contextualMemory =
      options.contextualMemory ||
      new (require('../../lib/memory/contextual-memory.cjs').ContextualMemory)({
        projectRoot: PROJECT_ROOT,
      });
    const limit = Number.isFinite(options.limit) ? options.limit : 5;
    const results = await contextualMemory.search(query, { limit });
    const priorRelatedLearnings = Array.isArray(results)
      ? results
          .map(item => String(item?.content || item?.text || '').trim())
          .filter(Boolean)
          .slice(0, limit)
      : [];

    return {
      ...baseEntry,
      priorRelatedLearnings,
      memoryReadSource: priorRelatedLearnings.length > 0 ? 'semantic+static' : 'static_only',
    };
  } catch (_err) {
    return {
      ...baseEntry,
      priorRelatedLearnings: [],
      memoryReadSource: 'static_only',
    };
  }
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const parsed = safeParseJSON(fs.readFileSync(filePath, 'utf8'), null, null, fallback);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_err) {
    return fallback;
  }
}

function trackFailureRecurrence(entry, options = {}) {
  const runtimePath = options.filePath || FAILURE_RECURRENCE_FILE;
  const trigger = String(entry?.trigger || '').trim();
  if (!trigger) return null;
  const failureClass =
    trigger === 'error'
      ? String(entry?.failureType || 'tool_failure').trim() || 'tool_failure'
      : String(entry?.summary || '')
            .toLowerCase()
            .includes('without summary metadata')
        ? 'missing_task_summary'
        : null;
  if (!failureClass) return null;

  const payload = safeReadJson(runtimePath, { lastUpdatedAt: null, classes: {} }) || {
    lastUpdatedAt: null,
    classes: {},
  };
  const classes =
    payload.classes && typeof payload.classes === 'object' && !Array.isArray(payload.classes)
      ? payload.classes
      : {};
  const bucket =
    classes[failureClass] && typeof classes[failureClass] === 'object'
      ? classes[failureClass]
      : { count: 0, lastSeenAt: null, lastTrigger: trigger };
  bucket.count = Number(bucket.count || 0) + 1;
  bucket.lastSeenAt = new Date().toISOString();
  bucket.lastTrigger = trigger;
  classes[failureClass] = bucket;
  const next = { lastUpdatedAt: bucket.lastSeenAt, classes };
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, JSON.stringify(next, null, 2), 'utf8');
  return { failureClass, count: bucket.count, filePath: runtimePath };
}

function readExistingEvolutionRequestIds(queuePath) {
  try {
    if (!fs.existsSync(queuePath)) return new Set();
    const content = fs.readFileSync(queuePath, 'utf8');
    const ids = new Set();
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = safeParseJSON(trimmed);
        if (parsed && typeof parsed.id === 'string' && parsed.id.trim()) {
          ids.add(parsed.id.trim());
        }
      } catch (_e) {
        // Ignore malformed lines
      }
    }
    return ids;
  } catch (_err) {
    return new Set();
  }
}

function ingestStaleArtifactRecommendations(options = {}) {
  const staleArtifactsPath = options.staleArtifactsPath || STALE_ARTIFACTS_FILE;
  const queuePath = options.queuePath || EVOLUTION_REQUESTS_FILE;
  const statePath = options.statePath || STALE_CONSUMPTION_STATE_FILE;
  const source = options.source || 'reflection-agent';

  const stalePayload = safeReadJson(staleArtifactsPath, null);
  if (!stalePayload || typeof stalePayload !== 'object') {
    return { created: 0, reason: 'no_stale_artifacts' };
  }

  const timestamp = String(stalePayload.timestamp || '').trim();
  if (!timestamp) {
    return { created: 0, reason: 'missing_timestamp' };
  }

  const priorState = safeReadJson(statePath, {});
  if (priorState && priorState.lastProcessedTimestamp === timestamp) {
    return { created: 0, reason: 'already_processed' };
  }

  const stale = Array.isArray(stalePayload.stale) ? stalePayload.stale : [];
  const unverified = Array.isArray(stalePayload.unverified) ? stalePayload.unverified : [];
  const artifacts = [...stale, ...unverified];
  if (artifacts.length === 0) {
    return { created: 0, reason: 'no_candidates' };
  }

  const existingIds = readExistingEvolutionRequestIds(queuePath);
  const now = new Date().toISOString();
  const lines = [];
  let created = 0;

  for (const artifact of artifacts) {
    const type = String(artifact?.type || 'unknown').trim() || 'unknown';
    const name = String(artifact?.name || 'unknown').trim() || 'unknown';
    const status = String(artifact?.status || 'stale').trim() || 'stale';
    const fingerprint = `${type}:${name}:${timestamp}:${status}`;
    // M-03: non-security use (fingerprint ID); MD5/SHA-1 is acceptable
    const id = `evo_${crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 12)}`;
    if (existingIds.has(id)) continue;

    const entry = {
      id,
      timestamp: now,
      source,
      trigger: 'stale_skill',
      evidence: `${type} ${name} flagged as ${status} by stale-artifacts audit (${timestamp}).`,
      suggestedArtifactType: type === 'agent' ? 'agent' : 'skill',
      targetArtifact: {
        type,
        name,
      },
      summary: `Refresh ${type} ${name} due to ${status} verification state.`,
      status: 'proposed',
    };

    lines.push(`${JSON.stringify(entry)}\n`);
    existingIds.add(id);
    created++;
  }

  if (created > 0) {
    fs.mkdirSync(path.dirname(queuePath), { recursive: true });
    fs.appendFileSync(queuePath, lines.join(''), 'utf8');
  }

  const state = {
    lastProcessedTimestamp: timestamp,
    processedAt: now,
    created,
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  return { created };
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
        const enrichedEntry = await attachSemanticPriorLearnings(entry);
        const recurrence = trackFailureRecurrence(enrichedEntry);
        if (recurrence) {
          enrichedEntry.recurrence = recurrence;
        }
        queueReflection(enrichedEntry);
        await appendReflectionLogEntry(enrichedEntry);
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
        const enrichedEntry = await attachSemanticPriorLearnings(entry);
        const recurrence = trackFailureRecurrence(enrichedEntry);
        if (recurrence) {
          enrichedEntry.recurrence = recurrence;
        }
        queueReflection(enrichedEntry);
        await appendReflectionLogEntry(enrichedEntry);
        outcome.queued = true;
        break;
      }
      case 'session_end': {
        const staleIngest = ingestStaleArtifactRecommendations();
        outcome.staleSkillRecommendations = staleIngest.created || 0;
        const dispatchPlan = generateAndPersistDispatchPlan({
          queuePath: EVOLUTION_REQUESTS_FILE,
          outputPath: DEFAULT_DISPATCH_PATH,
        });
        outcome.evolutionDispatchActions = Array.isArray(dispatchPlan?.actions)
          ? dispatchPlan.actions.length
          : 0;
        const result = eventHandlers.handleSessionEnd(hookInput);
        queueReflection(result.reflection);
        await appendReflectionLogEntry(result.reflection);
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
        const memoryResult = await actions.recordMemoryItems(extracted);
        await appendReflectionLogEntry({
          trigger: 'memory_extraction',
          memoryWrites: memoryResult?.memoryWrites || [],
          memoryReadSource: 'static_only',
        });
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
  appendReflectionLogEntry,
  attachSemanticPriorLearnings,
  ingestStaleArtifactRecommendations,
  trackFailureRecurrence,
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
