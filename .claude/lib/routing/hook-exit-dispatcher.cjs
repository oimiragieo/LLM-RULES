// Agent: developer | Task: v2.3.0-S4-phase2 | Session: 2026-04-21
'use strict';

/**
 * Hook Exit-Code Dispatcher
 *
 * Implements the ADR-2026-04-21 exit-code contract extension.
 * Handles codes 3 (escalate-to-user) and 4 (retry-with-degraded-model).
 * Codes 0/1/2 are noop — existing callers handle them unchanged.
 *
 * ADR: .claude/context/artifacts/analysis/hook-exit-code-contract-2026-04-21.md
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DEFAULT_COUNTER_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'degrade-retries.json'
);
const DEFAULT_TOOL_EVENTS_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'tool-events.jsonl'
);

const MAX_DEGRADE_RETRIES = Number(process.env.MAX_DEGRADE_RETRIES || 2);

// ---------------------------------------------------------------------------
// Trailer parsers
// ---------------------------------------------------------------------------

/**
 * Parse last ESCALATE: trailer from stderr.
 * Format: `ESCALATE: blockerType=<val> needsFrom=<val> blocker=<val>`
 * Returns safe defaults if missing or malformed.
 *
 * @param {string} stderr
 * @returns {{ blockerType: string, needsFrom: string, blocker: string }}
 */
function parseEscalateTrailer(stderr) {
  const defaults = { blockerType: 'safety', needsFrom: 'user', blocker: 'unspecified' };
  if (!stderr || typeof stderr !== 'string') return defaults;

  const lines = stderr.split('\n');
  // Find last ESCALATE: line
  let trailerLine = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^ESCALATE:/i.test(lines[i].trim())) {
      trailerLine = lines[i].trim();
      break;
    }
  }
  if (!trailerLine) return defaults;

  // Strip prefix
  const body = trailerLine.replace(/^ESCALATE:\s*/i, '');
  const pairs = parseKeyValuePairs(body);

  return {
    blockerType: pairs.blockerType || pairs.blockertype || defaults.blockerType,
    needsFrom: pairs.needsFrom || pairs.needsfrom || defaults.needsFrom,
    blocker: pairs.blocker || pairs.reason || defaults.blocker,
  };
}

/**
 * Parse last DEGRADE: trailer from stderr.
 * Format: `DEGRADE: reason=<val> attempt=<int>`
 * Returns safe defaults if missing or malformed.
 *
 * @param {string} stderr
 * @returns {{ reason: string, attempt: number }}
 */
function parseDegradeTrailer(stderr) {
  const defaults = { reason: 'unspecified', attempt: 1 };
  if (!stderr || typeof stderr !== 'string') return defaults;

  const lines = stderr.split('\n');
  let trailerLine = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^DEGRADE:/i.test(lines[i].trim())) {
      trailerLine = lines[i].trim();
      break;
    }
  }
  if (!trailerLine) return defaults;

  const body = trailerLine.replace(/^DEGRADE:\s*/i, '');
  const pairs = parseKeyValuePairs(body);

  return {
    reason: pairs.reason || defaults.reason,
    attempt: parseInt(pairs.attempt, 10) || defaults.attempt,
  };
}

/**
 * Parse space-separated key=value pairs into an object.
 * Values may contain hyphens and underscores but not spaces.
 *
 * @param {string} body
 * @returns {Record<string, string>}
 */
function parseKeyValuePairs(body) {
  const result = {};
  if (!body || typeof body !== 'string') return result;
  const re = /(\w+)=([^\s]+)/g;
  let match = re.exec(body);
  while (match) {
    result[match[1]] = match[2];
    match = re.exec(body);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Retry counter
// ---------------------------------------------------------------------------

/**
 * Read the per-taskId retry counter.
 *
 * @param {string} filePath
 * @returns {Record<string, number>}
 */
function readCounter(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (_err) {
    return {};
  }
}

/**
 * Write counter back to file (atomic best-effort).
 *
 * @param {string} filePath
 * @param {Record<string, number>} counter
 */
function writeCounter(filePath, counter) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(counter, null, 2), 'utf8');
  } catch (_err) {
    // Best-effort — never crash dispatcher on write failure
  }
}

/**
 * Increment retry count for taskId and return new count.
 *
 * @param {string} taskId
 * @param {string} filePath
 * @returns {number} new count after increment
 */
function incrementRetryCounter(taskId, filePath) {
  const counter = readCounter(filePath);
  const next = (counter[taskId] || 0) + 1;
  counter[taskId] = next;
  writeCounter(filePath, counter);
  return next;
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

/**
 * Append a structured event to tool-events.jsonl.
 * Fire-and-forget; never throws.
 *
 * @param {string} eventsFile
 * @param {object} event
 */
function appendToolEvent(eventsFile, event) {
  try {
    const dir = path.dirname(eventsFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n';
    fs.appendFileSync(eventsFile, line, 'utf8');
  } catch (_err) {
    // Best-effort
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a hook result based on its exit code.
 *
 * @param {object} hookResult
 * @param {number}   hookResult.code     - Hook exit code
 * @param {string}   hookResult.stderr   - Hook stderr output
 * @param {string}   hookResult.hookName - Hook identifier for logging
 * @param {object} taskContext
 * @param {string}   taskContext.taskId      - Current task ID (may be null)
 * @param {string}  [taskContext.counterFile] - Override path for degrade-retries.json
 * @param {string}  [taskContext.eventsFile]  - Override path for tool-events.jsonl
 * @returns {object} Dispatch result:
 *   - { action: 'noop' }
 *   - { action: 'noop', anomaly: { code, hookName, stderr } }
 *   - { action: 'escalate', update: { status, metadata } }
 *   - { action: 'degrade', respawn: { model, reason } }
 */
function dispatchExitCode(hookResult, taskContext = {}) {
  const { code, stderr = '', hookName = 'unknown' } = hookResult;
  const {
    taskId = null,
    counterFile = DEFAULT_COUNTER_FILE,
    eventsFile = DEFAULT_TOOL_EVENTS_FILE,
  } = taskContext;

  // Codes 0/1/2 — existing semantics unchanged, no dispatcher action
  if (code === 0 || code === 1 || code === 2) {
    return { action: 'noop' };
  }

  // Code 3 — escalate-to-user
  if (code === 3) {
    const { blockerType, needsFrom, blocker } = parseEscalateTrailer(stderr);

    appendToolEvent(eventsFile, {
      type: 'hook_escalate',
      hookName,
      taskId,
      blockerType,
      blocker,
    });

    return {
      action: 'escalate',
      update: {
        taskId,
        status: 'blocked',
        metadata: {
          blockerType,
          needsFrom,
          blocker,
          source: 'hook_exit_3',
          hookName,
        },
      },
    };
  }

  // Code 4 — retry-with-degraded-model
  if (code === 4) {
    // If no taskId, treat as exit-3 (cannot respawn without task context)
    if (!taskId) {
      appendToolEvent(eventsFile, {
        type: 'hook_degrade_no_task',
        hookName,
        note: 'exit-4 without taskId, escalating as exit-3',
      });
      return {
        action: 'escalate',
        update: {
          taskId: null,
          status: 'blocked',
          metadata: {
            blockerType: 'safety',
            needsFrom: 'user',
            blocker: 'degrade_no_task_context',
            source: 'hook_exit_4_no_task',
            hookName,
          },
        },
      };
    }

    const attempts = incrementRetryCounter(taskId, counterFile);

    if (attempts > MAX_DEGRADE_RETRIES) {
      // Retry exhausted — escalate
      appendToolEvent(eventsFile, {
        type: 'hook_degrade_exhausted',
        hookName,
        taskId,
        attempts,
        maxRetries: MAX_DEGRADE_RETRIES,
      });

      return {
        action: 'escalate',
        update: {
          taskId,
          status: 'blocked',
          metadata: {
            blockerType: 'capability',
            needsFrom: 'user',
            blocker: `degrade_exhausted_after_${MAX_DEGRADE_RETRIES}_attempts`,
            source: 'hook_exit_4_exhausted',
            hookName,
          },
        },
      };
    }

    const { reason } = parseDegradeTrailer(stderr);

    appendToolEvent(eventsFile, {
      type: 'hook_degrade',
      hookName,
      taskId,
      attempts,
      reason,
      model: 'haiku',
    });

    return {
      action: 'degrade',
      respawn: {
        taskId,
        model: 'haiku',
        reason,
        attempt: attempts,
      },
    };
  }

  // Unknown exit code — fail-open per existing policy, log anomaly
  appendToolEvent(eventsFile, {
    type: 'hook_unknown_exit_code',
    hookName,
    code,
    taskId,
    stderr,
  });

  return {
    action: 'noop',
    anomaly: {
      code,
      hookName,
      stderr,
      taskId,
      message: `Unknown hook exit code ${code}; treating as fail-open per policy`,
    },
  };
}

module.exports = {
  dispatchExitCode,
  parseEscalateTrailer,
  parseDegradeTrailer,
  parseKeyValuePairs,
  incrementRetryCounter,
  MAX_DEGRADE_RETRIES,
};
