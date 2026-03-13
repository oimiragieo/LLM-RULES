#!/usr/bin/env node
/**
 * Hook: reflection-queue-processor.cjs
 * Trigger: Can be invoked manually or by session hooks
 * Purpose: Process pending reflection queue entries and spawn reflection-agent
 *
 * This hook reads the reflection queue file, processes pending entries,
 * outputs spawn instructions for the reflection-agent, and marks entries
 * as processed.
 *
 * The queue file is a JSONL file at:
 *   .claude/context/reflection-queue.jsonl
 *
 * Queue Entry Format:
 *   - taskId: (for task_completion) Task ID that was completed
 *   - context: (for session_end/error) Context type
 *   - trigger: "task_completion" | "session_end" | "error"
 *   - timestamp: ISO date string
 *   - priority: "high" | "medium" | "low"
 *   - processed: boolean (skip if true)
 *
 * ENFORCEMENT MODES:
 * - block (default): Process queue (no blocking, this is informational)
 * - warn: Process queue with extra logging
 * - off: Disabled, no processing
 *
 * Environment variables:
 *   REFLECTION_ENABLED=false - Disable all reflection
 *   REFLECTION_HOOK_MODE=off - Disable this hook
 *   DEBUG_HOOKS=true - Enable debug logging
 */

'use strict';

const fs = require('fs');
const path = require('path');
// ATOMIC-001 FIX: Use atomic write utility to prevent data corruption
const { atomicWriteSync } = require('../../lib/utils/atomic-write.cjs');
const { trimJsonlFile } = require('../../lib/utils/jsonl-utils.cjs');
// PROC-002: Use shared utility instead of duplicated findProjectRoot
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
// HOOK-006 FIX: Use standardized audit logging
const { auditLog, debugLog } = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { readSpawnRequestsFile } = require('../../lib/reflection/spawn-request-contract.cjs');

// Configuration
let QUEUE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'reflection-queue.jsonl');
const REFLECTION_QUEUE_MAX_LINES = Number(process.env.REFLECTION_QUEUE_MAX_LINES || 2000);
const REFLECTION_LOG_FILE =
  process.env.REFLECTION_LOG_FILE_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'reflection-log.jsonl');
const TASK_STATUS_FILE =
  process.env.TASK_STATUS_FILE_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'task-status.json');
const REFLECTION_GHOST_SUPPRESS_HOURS = Number(process.env.REFLECTION_GHOST_SUPPRESS_HOURS || 24);

function getContextDir(queueFile = QUEUE_FILE) {
  return path.dirname(queueFile);
}

function getRuntimeDir(queueFile = QUEUE_FILE) {
  return path.join(getContextDir(queueFile), 'runtime');
}

function getSpawnRequestFile(queueFile = QUEUE_FILE) {
  return path.join(getRuntimeDir(queueFile), 'reflection-spawn-request.json');
}

/**
 * Check if reflection is enabled
 * @returns {boolean} True if reflection should run
 */
function isEnabled() {
  // Check REFLECTION_ENABLED (default: true)
  if (process.env.REFLECTION_ENABLED === 'false') {
    return false;
  }

  // Check REFLECTION_HOOK_MODE (default: block, which means enabled)
  const mode = process.env.REFLECTION_HOOK_MODE || 'block';
  if (mode === 'off') {
    return false;
  }

  return true;
}

/**
 * Read all entries from the queue file
 * @param {string} queueFile - Path to queue file
 * @returns {Array<object>} Array of parsed queue entries (excluding processed)
 */
function readQueueEntries(queueFile) {
  try {
    if (!fs.existsSync(queueFile)) {
      return [];
    }

    const content = fs.readFileSync(queueFile, 'utf8');
    if (!content.trim()) {
      return [];
    }

    const lines = content.split('\n').filter(line => line.trim());
    const entries = [];

    for (const line of lines) {
      const entry = safeParseJSON(line, null);
      if (entry && typeof entry === 'object' && Object.keys(entry).length > 0) {
        // Skip entries already marked as processed
        if (!entry.processed) {
          entries.push(entry);
        }
      } else {
        // Skip malformed JSON lines, log if debug enabled
        debugLog(
          'reflection-queue-processor',
          'Skipping malformed line in queue',
          new Error('parse_failed')
        );
      }
    }

    return entries;
  } catch (err) {
    debugLog('reflection-queue-processor', 'Error reading queue file', err);
    return [];
  }
}

/**
 * Filter entries to get only pending (unprocessed) entries
 * @param {Array<object>} entries - All queue entries
 * @returns {Array<object>} Pending entries only
 */
function getPendingEntries(entries) {
  return entries.filter(entry => !entry.processed);
}

function readTaskStatusMap() {
  try {
    if (!fs.existsSync(TASK_STATUS_FILE)) return {};
    const raw = fs.readFileSync(TASK_STATUS_FILE, 'utf8');
    const parsed = safeParseJSON(raw, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function readReflectionLogEntries() {
  try {
    if (!fs.existsSync(REFLECTION_LOG_FILE)) return [];
    const raw = fs.readFileSync(REFLECTION_LOG_FILE, 'utf8');
    if (!raw.trim()) return [];
    return raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => safeParseJSON(line, null))
      .filter(entry => entry && typeof entry === 'object');
  } catch (_err) {
    return [];
  }
}

function buildGhostTaskSet(logEntries) {
  const ghosts = new Set();
  if (!Array.isArray(logEntries) || logEntries.length === 0) return ghosts;

  const cutoffMs = Date.now() - REFLECTION_GHOST_SUPPRESS_HOURS * 60 * 60 * 1000;
  for (const entry of logEntries) {
    const taskId = entry.taskId != null ? String(entry.taskId).trim() : '';
    if (!taskId) continue;
    const reason = String(entry.reason || '').toLowerCase();
    const ts = Date.parse(entry.timestamp || '');
    const isRecent = Number.isFinite(ts) ? ts >= cutoffMs : true;
    if (!isRecent) continue;
    if (reason.includes('task') && reason.includes('not found')) {
      ghosts.add(taskId);
    }
  }
  return ghosts;
}

function dedupePendingEntries(pending, options = {}) {
  const taskStatus = options.taskStatus || readTaskStatusMap();
  const hasTaskStatusData = Object.keys(taskStatus).length > 0;
  const logs = options.reflectionLogEntries || readReflectionLogEntries();
  const knownGhostTasks = buildGhostTaskSet(logs);
  const accepted = [];
  const seenIds = new Set();
  const taskCompletionsByTaskId = new Map();
  const dropped = {
    duplicateRequestId: 0,
    duplicateTaskCompletion: 0,
    knownGhostTask: 0,
    missingTaskStatus: 0,
  };

  for (const entry of pending) {
    const requestId = `${entry.trigger || 'unknown'}:${entry.timestamp || ''}:${entry.taskId || entry.context || ''}`;
    if (seenIds.has(requestId)) {
      dropped.duplicateRequestId++;
      continue;
    }
    seenIds.add(requestId);

    if (entry.trigger !== 'task_completion') {
      accepted.push(entry);
      continue;
    }

    const taskId = entry.taskId != null ? String(entry.taskId).trim() : '';
    if (!taskId) {
      accepted.push(entry);
      continue;
    }

    if (knownGhostTasks.has(taskId)) {
      dropped.knownGhostTask++;
      continue;
    }

    if (hasTaskStatusData && !Object.prototype.hasOwnProperty.call(taskStatus, taskId)) {
      dropped.missingTaskStatus++;
      continue;
    }

    const existing = taskCompletionsByTaskId.get(taskId);
    if (!existing) {
      taskCompletionsByTaskId.set(taskId, entry);
      accepted.push(entry);
      continue;
    }

    const existingTs = Date.parse(existing.timestamp || '');
    const nextTs = Date.parse(entry.timestamp || '');
    const replace =
      Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs > existingTs);
    dropped.duplicateTaskCompletion++;
    if (replace) {
      const idx = accepted.indexOf(existing);
      if (idx >= 0) accepted[idx] = entry;
      taskCompletionsByTaskId.set(taskId, entry);
    }
  }

  return {
    entries: accepted,
    dropped,
  };
}

/**
 * Generate spawn instruction for a reflection entry
 * @param {object} entry - Queue entry
 * @returns {string} Spawn instruction text
 */
function generateSpawnInstruction(entry) {
  const _trigger = entry.trigger || 'unknown';
  const reason = buildReason(entry);
  const taskPrompt = buildTaskPrompt(entry);

  return `[REFLECTION-TRIGGER] Spawn reflection-agent for: ${reason}
Task({
  task_id: 'task-1',
  subagent_type: "reflection-agent",
  description: "Reflection: ${reason}",
  prompt: \`${taskPrompt}\`
})`;
}

/**
 * Generate a machine-readable spawn request payload for a reflection entry.
 *
 * Claude Code's hook runner does not parse stderr to invoke `Task(...)`, so
 * writing a request file is the handoff mechanism to make reflection actionable.
 *
 * @param {object} entry - Queue entry
 * @returns {object} Spawn request payload
 */
function generateSpawnRequest(entry) {
  const reason = buildReason(entry);
  const taskPrompt = buildTaskPrompt(entry);
  const rawId = `${entry.trigger}:${entry.timestamp}:${entry.taskId || entry.context || ''}`;
  const id = `reflection-${rawId
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()
    .slice(0, 40)}`;

  return {
    id,
    subagent_type: 'reflection-agent',
    description: `Reflection: ${reason}`,
    prompt: taskPrompt,
    source: {
      trigger: entry.trigger || 'unknown',
      timestamp: entry.timestamp || null,
      taskId: entry.taskId || null,
      context: entry.context || null,
      priority: entry.priority || 'medium',
    },
  };
}

function readExistingSpawnRequests(spawnRequestFile) {
  return readSpawnRequestsFile(spawnRequestFile);
}

function writeSpawnRequests(newRequests, queueFile = QUEUE_FILE) {
  if (!Array.isArray(newRequests) || newRequests.length === 0) {
    return { written: 0 };
  }

  try {
    const runtimeDir = getRuntimeDir(queueFile);
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }

    const spawnRequestFile = getSpawnRequestFile(queueFile);
    const existing = readExistingSpawnRequests(spawnRequestFile);
    const existingById = new Map(
      existing
        .filter(r => r && typeof r === 'object' && typeof r.id === 'string')
        .map(r => [r.id, r])
    );

    for (const req of newRequests) {
      if (!req || typeof req !== 'object' || typeof req.id !== 'string') continue;
      if (!existingById.has(req.id)) {
        existingById.set(req.id, req);
      }
    }

    const merged = Array.from(existingById.values());
    atomicWriteSync(spawnRequestFile, JSON.stringify(merged, null, 2));

    return { written: newRequests.length, total: merged.length, file: spawnRequestFile };
  } catch (err) {
    debugLog('reflection-queue-processor', 'Error writing spawn request file', err);
    return { written: 0 };
  }
}

/**
 * Build a human-readable reason from the entry
 * @param {object} entry - Queue entry
 * @returns {string} Human-readable reason
 */
function buildReason(entry) {
  switch (entry.trigger) {
    case 'task_completion':
      return `task ${entry.taskId || 'unknown'} completed`;
    case 'session_end':
      return 'session ended - batch reflection for unreflected tasks';
    case 'error':
      return `error in ${entry.tool || 'unknown tool'}: ${entry.error || 'unknown error'}`;
    default:
      return `${entry.trigger || 'unknown trigger'}`;
  }
}

/**
 * Read the session gap log and return a formatted section for injection into prompts.
 * @returns {string} Formatted gap log section, or empty string if none.
 */
function readSessionGapLog() {
  const gapLogPath =
    process.env.GAP_LOG_PATH_OVERRIDE ||
    path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'session-gap-log.jsonl');
  try {
    if (!fs.existsSync(gapLogPath)) return '';
    const raw = fs.readFileSync(gapLogPath, 'utf8').trim();
    if (!raw) return '';
    const lines = raw.split('\n').filter(l => l.trim());
    if (lines.length === 0) return '';
    const entries = [];
    for (const line of lines) {
      const parsed = safeParseJSON(line, null);
      if (parsed && typeof parsed === 'object') entries.push(parsed);
    }
    if (entries.length === 0) return '';
    // Cap at 20 most recent to avoid prompt bloat
    const capped = entries.slice(-20);
    const formatted = capped
      .map(
        e =>
          `- [${e.type || 'unknown'}] ${e.description || '(no description)'}${e.taskId ? ` (task: ${e.taskId})` : ''}${e.agent ? ` (agent: ${e.agent})` : ''}${e.context ? `\n  context: ${e.context}` : ''}`
      )
      .join('\n');
    return `\n## Router Gap Observations (${entries.length} total, showing last ${capped.length})\nThe Router observed these gaps/issues during this session:\n${formatted}\n\nFor each entry above: determine if it is a systemic pattern or one-off. Record systemic patterns to learnings.md. Record recurring issues to issues.md.\n`;
  } catch (_err) {
    return '';
  }
}

/**
 * Build the task prompt for spawning reflection-agent
 * @param {object} entry - Queue entry
 * @returns {string} Task prompt
 */
function buildTaskPrompt(entry) {
  const trigger = entry.trigger || 'unknown';
  const timestamp = entry.timestamp || new Date().toISOString();
  const priority = entry.priority || 'medium';
  const id = `${trigger}:${timestamp}:${entry.taskId || entry.context || ''}`;
  // Derive a stable, contract-compliant taskId for the reflection agent.
  // Since reflection tasks are not created via TaskCreate, we derive an ID
  // from the queue entry so the TaskUpdate atomic handshake can include it.
  const reflectionTaskId = `reflection-${id
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()
    .slice(0, 40)}`;

  let context = '';
  switch (trigger) {
    case 'task_completion':
      context = `Analyze completed task ${entry.taskId || 'unknown'}.
${entry.summary ? `Summary: ${entry.summary}` : ''}`;
      break;
    case 'session_end':
      context = `Session ended. Perform batch reflection for all unreflected tasks.
${entry.stats ? `Stats: ${JSON.stringify(entry.stats)}` : ''}`;
      break;
    case 'error':
      context = `Error occurred during ${entry.tool || 'unknown'} execution.
Error: ${entry.error || 'unknown'}`;
      break;
    default:
      context = `Reflection triggered: ${trigger}`;
  }

  return `You are the REFLECTION-AGENT.

Trigger: ${trigger}
Timestamp: ${timestamp}
Priority: ${priority}

${context}
${readSessionGapLog()}
Instructions:
1. Read your agent definition: .claude/agents/core/reflection-agent.md
2. Analyze the context and extract learnings
3. Update memory files as appropriate
4. Document any patterns or issues discovered
5. ATOMIC COMPLETION: In your final TaskUpdate call, you MUST use this exact format:
   TaskUpdate({ taskId: "${reflectionTaskId}", status: "completed", metadata: { processedReflectionIds: ["${reflectionTaskId}"] } })
   Your reflection task ID is: ${reflectionTaskId}`;
}

/**
 * Remove processed entries from the queue file (drop instead of mark).
 * Keeps only unprocessed entries, preventing unbounded file growth.
 * @param {Array<object>} processedEntries - Entries that were just processed
 * @param {string} queueFile - Path to queue file
 */
function markEntriesProcessed(processedEntries, queueFile) {
  if (!processedEntries || processedEntries.length === 0) {
    return;
  }

  try {
    if (!fs.existsSync(queueFile)) {
      return;
    }

    const content = fs.readFileSync(queueFile, 'utf8');
    if (!content.trim()) {
      return;
    }

    const lines = content.split('\n').filter(line => line.trim());

    // Build set of identifiers for entries just processed
    const processedSet = new Set(
      processedEntries.map(e => `${e.trigger}:${e.timestamp}:${e.taskId || e.context || ''}`)
    );

    // Keep only entries that were NOT processed in this run and are not already marked processed
    const remainingLines = [];
    for (const line of lines) {
      const entry = safeParseJSON(line, null);
      if (entry && typeof entry === 'object' && Object.keys(entry).length > 0) {
        const identifier = `${entry.trigger}:${entry.timestamp}:${entry.taskId || entry.context || ''}`;
        if (!processedSet.has(identifier) && !entry.processed) {
          remainingLines.push(JSON.stringify(entry));
        }
        // processed entries are dropped — not written back
      }
      // malformed lines are also dropped
    }

    atomicWriteSync(queueFile, remainingLines.length > 0 ? remainingLines.join('\n') + '\n' : '');
  } catch (err) {
    debugLog('reflection-queue-processor', 'Error removing processed entries', err);
  }
}

/**
 * Process the queue and return spawn instructions
 * @param {string} queueFile - Path to queue file
 * @returns {object} Result with processed count and instructions
 */
function processQueue(queueFile = QUEUE_FILE) {
  const result = {
    processed: 0,
    instructions: [],
    spawnRequests: [],
    dropped: {
      duplicateRequestId: 0,
      duplicateTaskCompletion: 0,
      knownGhostTask: 0,
      missingTaskStatus: 0,
    },
  };

  if (!isEnabled()) {
    return result;
  }

  const entries = readQueueEntries(queueFile);
  const pending = getPendingEntries(entries);

  if (pending.length === 0) {
    return result;
  }

  const deduped = dedupePendingEntries(pending);
  result.dropped = deduped.dropped;

  for (const entry of deduped.entries) {
    const instruction = generateSpawnInstruction(entry);
    result.instructions.push(instruction);
    result.spawnRequests.push(generateSpawnRequest(entry));
    result.processed++;
  }

  // Mark entries as processed
  markEntriesProcessed(pending, queueFile);
  trimJsonlFile(queueFile, REFLECTION_QUEUE_MAX_LINES);

  return result;
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  try {
    // Check if enabled
    if (!isEnabled()) {
      process.exit(0);
    }

    // Proactively trim queue file on every invocation to prevent unbounded growth
    trimJsonlFile(QUEUE_FILE, REFLECTION_QUEUE_MAX_LINES);

    // Process the queue
    const result = processQueue(QUEUE_FILE);

    // Write a machine-readable spawn request file so a follow-up Router turn can
    // actually call Task() for each request.
    const writeResult = writeSpawnRequests(result.spawnRequests);

    // Output spawn instructions to stderr for visibility
    if (result.instructions.length > 0) {
      for (const instruction of result.instructions) {
        console.error(instruction);
        console.error(''); // Blank line between instructions
      }

      const mode = process.env.REFLECTION_HOOK_MODE || 'block';
      if (mode === 'warn') {
        auditLog('reflection-queue-processor', 'processed', {
          count: result.processed,
          spawnRequestsWritten: writeResult.written || 0,
        });
      }
    }

    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'reflection-queue-processor',
        output: {
          processed: result.processed,
          spawnRequestsWritten: writeResult.written || 0,
          spawnRequestFile: writeResult.file || null,
        },
        duration: Date.now() - startTime,
      });
    } catch (_e) {
      // Best-effort
    }
    // Informational hook - always exit 0
    process.exit(0);
  } catch (err) {
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'reflection-queue-processor',
        error: err.message,
      });
    } catch (_e) {
      // Best-effort
    }
    // Fail open - log error but don't block
    debugLog('reflection-queue-processor', 'Hook error during processing', err);
    process.exit(0);
  }
}

// Run if main module
if (require.main === module) {
  main();
}

// Exports for testing
module.exports = {
  isEnabled,
  readQueueEntries,
  getPendingEntries,
  generateSpawnInstruction,
  generateSpawnRequest,
  writeSpawnRequests,
  readExistingSpawnRequests,
  markEntriesProcessed,
  readTaskStatusMap,
  readReflectionLogEntries,
  buildGhostTaskSet,
  dedupePendingEntries,
  processQueue,
  main,
  getSpawnRequestFile,
  get QUEUE_FILE() {
    return QUEUE_FILE;
  },
  set QUEUE_FILE(val) {
    QUEUE_FILE = val;
  },
};
