#!/usr/bin/env node
/**
 * Unified PreToolUse Hook (Wildcard Consolidation)
 *
 * Consolidates 3 PreToolUse hooks with empty matcher ("") into a single file for reduced I/O:
 * 1. session-cleanup.cjs - Cleans up stale tmp files (once per session)
 * 2. execution-limit-monitor-hook.cjs - Tracks execution limits for sessions
 * 3. tool-scope-validator.cjs - Validates tool is in agent's allowed_tools list
 *
 * Performance: Reduces 3 processes to 1, shares hook input parsing across checks.
 *
 * Exit codes:
 * - 0: Allow tool to proceed
 * - 2: Block tool (execution limit or tool scope violation)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Resolve paths for reliable module loading
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

// Helper for lib requires
function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

// Import shared utilities
const { parseHookInputAsync, getToolName, getToolInput, formatResult } = libRequire(
  path.join('utils', 'hook-input.cjs')
);
const { atomicWriteJSONSync } = libRequire(path.join('utils', 'atomic-write.cjs'));
const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));
const { appendJsonl } = libRequire(path.join('utils', 'jsonl-utils.cjs'));
const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes } = libRequire(path.join('events', 'event-types.cjs'));

// =============================================================================
// Check 1: Session Cleanup (from session-cleanup.cjs)
// =============================================================================

// Track if cleanup already ran this session
let cleanupRan = false;

function getTmpDir() {
  const claudeDir = path.join(PROJECT_ROOT, '.claude');
  return path.join(claudeDir, 'context', 'tmp');
}

function cleanupFilesInDir(tmpDir, maxAgeMs) {
  if (!fs.existsSync(tmpDir)) {
    return { deleted: 0, errors: 0, bytes: 0 };
  }

  const now = Date.now();
  let deleted = 0;
  let errors = 0;
  let bytes = 0;

  try {
    const files = fs.readdirSync(tmpDir);

    for (const file of files) {
      const filePath = path.join(tmpDir, file);

      try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) continue;

        const age = now - stats.mtimeMs;
        if (age > maxAgeMs) {
          fs.unlinkSync(filePath);
          deleted++;
          bytes += stats.size;
        }
      } catch (err) {
        console.error(`[pre-tool-unified:cleanup] Error processing ${file}: ${err.message}`);
        errors++;
      }
    }
  } catch (err) {
    console.error(`[pre-tool-unified:cleanup] Error reading ${tmpDir}: ${err.message}`);
    errors++;
  }

  return { deleted, errors, bytes };
}

function cleanupTmpFiles() {
  const tmpDir = getTmpDir();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  return cleanupFilesInDir(tmpDir, maxAge);
}

function cleanupMemoryTempFiles() {
  const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  if (!fs.existsSync(memoryDir)) {
    return { deleted: 0, errors: 0, bytes: 0 };
  }

  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  let deleted = 0;
  let errors = 0;
  let bytes = 0;

  try {
    const stack = [memoryDir];
    while (stack.length > 0) {
      const currentDir = stack.pop();
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const filePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(filePath);
          continue;
        }

        const stats = fs.statSync(filePath);
        const isTmpArtifact =
          entry.name.endsWith('.tmp') ||
          entry.name.includes('.tmp.') ||
          entry.name.startsWith('.tmp-');
        if (!isTmpArtifact) {
          continue;
        }

        const age = now - stats.mtimeMs;
        if (age > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
          bytes += stats.size;
        }
      }
    }
  } catch (err) {
    console.error(`[pre-tool-unified:cleanup] Error reading memory dir: ${err.message}`);
    errors++;
  }

  return { deleted, errors, bytes };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkSessionCleanup() {
  try {
    if (cleanupRan) {
      return { ran: false, reason: 'already_ran' };
    }

    cleanupRan = true;

    const tmpResult = cleanupTmpFiles();
    const memoryTmpResult = cleanupMemoryTempFiles();
    const result = {
      deleted: tmpResult.deleted + memoryTmpResult.deleted,
      errors: tmpResult.errors + memoryTmpResult.errors,
      bytes: tmpResult.bytes + memoryTmpResult.bytes,
      tmp: tmpResult,
      memoryTmp: memoryTmpResult,
    };

    if (result.deleted > 0) {
      try {
        const { recordMemoryOperation } = require('../../lib/memory/memory-slo-metrics.cjs');
        recordMemoryOperation({
          staleTempFilesRemoved: result.deleted,
        });
      } catch (_e) {
        // Best-effort metrics only.
      }
    }

    if (result.deleted > 0) {
      console.error(
        `[pre-tool-unified:cleanup] Cleaned ${result.deleted} stale temp file(s) (${formatBytes(result.bytes)}) from tmp/ + memory/`
      );
    }

    if (result.errors > 0) {
      console.error(`[pre-tool-unified:cleanup] ${result.errors} error(s) during cleanup`);
    }

    return { ran: true, result };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:cleanup] Error:', err.message);
    }
    return { ran: false, error: err.message };
  }
}

// =============================================================================
// Check 2: Execution Limit Monitor (from execution-limit-monitor-hook.cjs)
// =============================================================================

const STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'execution-limits.json'
);
const METRICS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'metrics');
const EVENTS_FILE = path.join(METRICS_DIR, 'execution-limit-events.jsonl');
const EXECUTION_LIMIT_EVENTS_MAX_LINES = Number(
  process.env.EXECUTION_LIMIT_EVENTS_MAX_LINES || 2000
);
const TASKUPDATE_FIRST_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'taskupdate-first-state.json'
);

const LOCK_SUFFIX = '.lock';
const MAX_LOCK_WAIT_MS = 2000;
const LOCK_RETRY_MS = 50;

function syncSleep(ms) {
  if (typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined') {
    try {
      const sharedBuffer = new SharedArrayBuffer(4);
      const int32 = new Int32Array(sharedBuffer);
      Atomics.wait(int32, 0, 0, ms);
      return;
    } catch (_e) {
      // fall back
    }
  }
  const start = Date.now();
  while (Date.now() - start < ms) {
    // busy wait
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_err) {
    return false;
  }
}

function tryClaimStaleLock(lockFile) {
  const claimingFile = `${lockFile}.claiming.${process.pid}.${Date.now()}`;

  try {
    fs.renameSync(lockFile, claimingFile);
    try {
      const lockData = JSON.parse(fs.readFileSync(claimingFile, 'utf8'));
      if (lockData.pid && !isProcessAlive(lockData.pid)) {
        fs.unlinkSync(claimingFile);
        return true;
      }

      try {
        fs.renameSync(claimingFile, lockFile);
      } catch (_restoreErr) {
        try {
          fs.unlinkSync(claimingFile);
        } catch {
          // best effort
        }
      }
      return false;
    } catch (_readErr) {
      try {
        fs.unlinkSync(claimingFile);
      } catch {
        // best effort
      }
      return true;
    }
  } catch (_renameErr) {
    return false;
  }
}

function acquireLock(filePath) {
  const lockFile = filePath + LOCK_SUFFIX;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_LOCK_WAIT_MS) {
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, time: Date.now() }), {
        flag: 'wx',
      });
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        if (tryClaimStaleLock(lockFile)) continue;
        syncSleep(LOCK_RETRY_MS);
        continue;
      }
      return false;
    }
  }
  return false;
}

function releaseLock(filePath) {
  const lockFile = filePath + LOCK_SUFFIX;
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // ignore
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readState() {
  const defaults = { updatedAt: new Date().toISOString(), sessions: {} };
  try {
    if (!fs.existsSync(STATE_FILE)) return defaults;
    const content = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = safeParseJSON(content, null);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const sessions = parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
    return { ...defaults, ...parsed, sessions };
  } catch {
    return defaults;
  }
}

function writeState(state) {
  const lockAcquired = acquireLock(STATE_FILE);
  try {
    ensureDir(path.dirname(STATE_FILE));
    atomicWriteJSONSync(STATE_FILE, { ...state, updatedAt: new Date().toISOString() });
  } finally {
    if (lockAcquired) releaseLock(STATE_FILE);
  }
}

function appendEvent(event) {
  try {
    ensureDir(METRICS_DIR);
    appendJsonl(EVENTS_FILE, event, { maxLines: EXECUTION_LIMIT_EVENTS_MAX_LINES });
  } catch {
    // best effort
  }
}

function normalizeLimits(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const maxTurns =
    typeof raw.max_turns === 'number' && Number.isFinite(raw.max_turns) && raw.max_turns > 0
      ? Math.floor(raw.max_turns)
      : null;
  const maxDurationMs =
    typeof raw.max_duration_ms === 'number' &&
    Number.isFinite(raw.max_duration_ms) &&
    raw.max_duration_ms > 0
      ? Math.floor(raw.max_duration_ms)
      : null;
  const maxCostUsd =
    typeof raw.max_cost_usd === 'number' &&
    Number.isFinite(raw.max_cost_usd) &&
    raw.max_cost_usd > 0
      ? raw.max_cost_usd
      : null;

  const timeoutAction =
    raw.timeout_action === 'warn' ||
    raw.timeout_action === 'pause' ||
    raw.timeout_action === 'terminate'
      ? raw.timeout_action
      : 'terminate';

  return {
    max_turns: maxTurns ?? Infinity,
    max_duration_ms: maxDurationMs ?? Infinity,
    max_cost_usd: maxCostUsd ?? Infinity,
    timeout_action: timeoutAction,
  };
}

function getSessionId(hookInput) {
  const sid = hookInput && typeof hookInput.session_id === 'string' ? hookInput.session_id : null;
  return sid || process.env.CLAUDE_SESSION_ID || 'unknown-session';
}

function ensureSessionConfigured(state, sessionId, maybeLimits) {
  const existing = state.sessions[sessionId];

  if (maybeLimits) {
    const normalized = normalizeLimits(maybeLimits);
    if (!normalized) return;

    const nowIso = new Date().toISOString();
    state.sessions[sessionId] = {
      ...(existing && typeof existing === 'object' ? existing : {}),
      configuredAt: existing?.configuredAt || nowIso,
      startedAt: existing?.startedAt || nowIso,
      lastSeenAt: nowIso,
      turns: typeof existing?.turns === 'number' ? existing.turns : 0,
      costUsd: typeof existing?.costUsd === 'number' ? existing.costUsd : 0,
      limits: normalized,
      warningsEmitted: existing?.warningsEmitted || {},
      exceeded: existing?.exceeded || {},
    };

    appendEvent({
      timestamp: nowIso,
      type: 'EXECUTION_LIMITS_CONFIGURED',
      sessionId,
      limits: normalized,
    });
    return;
  }

  if (!existing) {
    const nowIso = new Date().toISOString();
    state.sessions[sessionId] = {
      configuredAt: null,
      startedAt: nowIso,
      lastSeenAt: nowIso,
      turns: 0,
      costUsd: 0,
      limits: null,
      warningsEmitted: {},
      exceeded: {},
    };
  }
}

function checkExecutionLimit(hookInput, toolName, toolInput) {
  try {
    const sessionId = getSessionId(hookInput);
    const state = readState();

    // If this is a Task spawn with execution_limits, store them
    if (toolName === 'Task' && toolInput && toolInput.execution_limits) {
      ensureSessionConfigured(state, sessionId, toolInput.execution_limits);
      writeState(state);
      return { checked: true, action: 'allow' };
    }

    const session = state.sessions[sessionId];
    if (!session || !session.limits) {
      return { checked: false };
    }

    // Update accounting
    const now = Date.now();
    const startedAtMs = session.startedAt ? new Date(session.startedAt).getTime() : now;
    const elapsedMs = now - startedAtMs;
    session.turns = typeof session.turns === 'number' ? session.turns + 1 : 1;
    session.lastSeenAt = new Date().toISOString();
    session.warningsEmitted = session.warningsEmitted || {};
    session.exceeded = session.exceeded || {};

    const {
      max_turns: maxTurns,
      max_duration_ms: maxDurationMs,
      timeout_action: timeoutAction,
    } = session.limits;

    // Warn at 80%
    if (maxTurns !== Infinity) {
      const pct = (session.turns / maxTurns) * 100;
      if (pct >= 80 && !session.warningsEmitted.max_turns) {
        session.warningsEmitted.max_turns = new Date().toISOString();
        appendEvent({
          timestamp: new Date().toISOString(),
          type: 'AGENT_LIMIT_WARNING',
          sessionId,
          limitType: 'max_turns',
          current: session.turns,
          max: maxTurns,
          percentage: pct.toFixed(1),
        });
      }
    }

    if (maxDurationMs !== Infinity) {
      const pct = (elapsedMs / maxDurationMs) * 100;
      if (pct >= 80 && !session.warningsEmitted.max_duration_ms) {
        session.warningsEmitted.max_duration_ms = new Date().toISOString();
        appendEvent({
          timestamp: new Date().toISOString(),
          type: 'AGENT_LIMIT_WARNING',
          sessionId,
          limitType: 'max_duration_ms',
          current: elapsedMs,
          max: maxDurationMs,
          percentage: pct.toFixed(1),
        });
      }
    }

    // Exceeded checks
    let exceeded = null;
    if (maxTurns !== Infinity && session.turns >= maxTurns) {
      exceeded = { limitType: 'max_turns', current: session.turns, max: maxTurns };
    } else if (maxDurationMs !== Infinity && elapsedMs >= maxDurationMs) {
      exceeded = { limitType: 'max_duration_ms', current: elapsedMs, max: maxDurationMs };
    }

    if (exceeded && !session.exceeded[exceeded.limitType]) {
      session.exceeded[exceeded.limitType] = new Date().toISOString();
      appendEvent({
        timestamp: new Date().toISOString(),
        type: 'AGENT_LIMIT_EXCEEDED',
        sessionId,
        action: timeoutAction,
        ...exceeded,
      });
    }

    state.sessions[sessionId] = session;
    writeState(state);

    if (!exceeded) {
      return { checked: true, action: 'allow' };
    }

    if (timeoutAction === 'warn') {
      return { checked: true, action: 'allow' };
    }

    const message = `[EXECUTION LIMIT] ${exceeded.limitType} exceeded (${exceeded.current}/${exceeded.max}). Action: ${timeoutAction}.

If this is expected, increase Task({ task_id: 'task-1', execution_limits: { ... } }) for this session.`;

    return { checked: true, action: 'block', message };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:execution-limit] Error:', err.message);
    }
    return { checked: false, error: err.message };
  }
}

// =============================================================================
// Check 3: Tool Scope Validator (from tool-scope-validator.cjs)
// =============================================================================

const ALWAYS_ALLOWED = ['Read', 'TaskList', 'TaskGet', 'AskUserQuestion'];

function checkToolScope(hookInput, toolName) {
  const mode = process.env.TOOL_SCOPE_VALIDATOR || 'warn';
  if (mode === 'off') {
    return { checked: false, reason: 'disabled' };
  }

  try {
    if (!toolName) {
      return { checked: false, reason: 'no_tool_name' };
    }

    // Skip if no agent context
    const agentAllowedTools = hookInput.allowed_tools || [];
    if (agentAllowedTools.length === 0) {
      return { checked: false, reason: 'no_restrictions' };
    }

    // Check if tool is allowed
    if (!agentAllowedTools.includes(toolName) && !ALWAYS_ALLOWED.includes(toolName)) {
      const message = `Tool ${toolName} not in allowed_tools: [${agentAllowedTools.join(', ')}]`;

      if (mode === 'block') {
        return { checked: true, action: 'block', message };
      } else {
        console.warn(`[WARN] ${message}`);
        return { checked: true, action: 'allow' };
      }
    }

    return { checked: true, action: 'allow' };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:tool-scope] Error:', err.message);
    }
    return { checked: false, error: err.message };
  }
}

// =============================================================================
// Check 4: TaskUpdate-first Guard (agent sessions must mark in_progress first)
// =============================================================================

const TASKUPDATE_FIRST_WINDOW_MS = Number(
  process.env.TASKUPDATE_FIRST_WINDOW_MS || 24 * 60 * 60 * 1000
);

function readTaskUpdateFirstState(stateFile = TASKUPDATE_FIRST_STATE_FILE) {
  try {
    if (!fs.existsSync(stateFile)) return { sessions: {} };
    const parsed = safeParseJSON(fs.readFileSync(stateFile, 'utf8'), null);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.sessions ||
      typeof parsed.sessions !== 'object'
    ) {
      return { sessions: {} };
    }
    return parsed;
  } catch (_err) {
    return { sessions: {} };
  }
}

function writeTaskUpdateFirstState(state, stateFile = TASKUPDATE_FIRST_STATE_FILE) {
  try {
    ensureDir(path.dirname(stateFile));
    atomicWriteJSONSync(stateFile, state);
  } catch (_err) {
    // Best-effort state tracking only.
  }
}

function pruneTaskUpdateFirstState(state, now = Date.now()) {
  const sessions = state && typeof state === 'object' ? state.sessions || {} : {};
  const pruned = {};
  for (const [sessionId, entry] of Object.entries(sessions)) {
    const updatedAt = Number(entry?.updatedAt || 0);
    if (updatedAt > 0 && now - updatedAt <= TASKUPDATE_FIRST_WINDOW_MS) {
      pruned[sessionId] = entry;
    }
  }
  return { sessions: pruned };
}

function extractTaskUpdateStatus(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const raw = toolInput.status ?? toolInput.state ?? null;
  if (raw == null) return null;
  return String(raw).trim().toLowerCase();
}

function extractTaskUpdateTaskId(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const raw = toolInput.taskId ?? toolInput.task_id ?? toolInput.id ?? null;
  if (raw == null) return null;
  return String(raw).trim();
}

function isAgentScopedSession(hookInput) {
  const allowedTools = Array.isArray(hookInput?.allowed_tools) ? hookInput.allowed_tools : [];
  if (allowedTools.includes('TaskUpdate')) return true;

  // Some Claude runs omit allowed_tools in downstream subagent tool hooks.
  // Fall back to task identifiers to keep TaskUpdate-first enforcement active.
  const scopedTaskId = hookInput?.task_id || hookInput?.taskId || null;
  if (typeof scopedTaskId === 'string' && scopedTaskId.trim().length > 0) return true;

  // Last-resort fallback: if we are running inside any non-router agent process,
  // enforce TaskUpdate-first even when hook payload is minimal.
  const agentId = String(process.env.CLAUDE_AGENT_ID || '')
    .trim()
    .toLowerCase();
  if (agentId && agentId !== 'router') return true;

  return false;
}

function checkTaskUpdateFirst(
  hookInput,
  toolName,
  toolInput,
  stateFile = TASKUPDATE_FIRST_STATE_FILE
) {
  const mode = (process.env.TASKUPDATE_FIRST_ENFORCEMENT || 'block').toLowerCase();
  if (mode === 'off') return { checked: false, reason: 'disabled' };
  if (!isAgentScopedSession(hookInput)) return { checked: false, reason: 'not_agent_session' };

  const sessionId =
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || null;
  if (!sessionId) return { checked: false, reason: 'missing_session' };

  const now = Date.now();
  const current = pruneTaskUpdateFirstState(readTaskUpdateFirstState(stateFile), now);
  const currentEntry = current.sessions[sessionId] || {
    inProgress: false,
    taskId: null,
    updatedAt: 0,
  };

  if (toolName === 'TaskUpdate') {
    const status = extractTaskUpdateStatus(toolInput);
    const taskId = extractTaskUpdateTaskId(toolInput);
    if (status === 'in_progress' || status === 'in-progress' || status === 'completed') {
      current.sessions[sessionId] = {
        inProgress: true,
        taskId: taskId || currentEntry.taskId || null,
        updatedAt: now,
      };
      writeTaskUpdateFirstState(current, stateFile);
    }
    return { checked: true, action: 'allow' };
  }

  if (currentEntry.inProgress === true) {
    current.sessions[sessionId] = {
      ...currentEntry,
      updatedAt: now,
    };
    writeTaskUpdateFirstState(current, stateFile);
    return { checked: true, action: 'allow' };
  }

  const message =
    '[TASKUPDATE-FIRST] Agent must call TaskUpdate({ taskId, status: "in_progress" }) ' +
    `before using ${toolName}.`;
  if (mode === 'warn') {
    return { checked: true, action: 'allow', warning: message };
  }
  return { checked: true, action: 'block', message };
}

// =============================================================================
// Check 5: Read Safety Guard (prevents EISDIR and large unchunked reads)
// =============================================================================

const READ_CHUNK_GUARD_BYTES = Number(process.env.READ_CHUNK_GUARD_BYTES || 120000);
const REFLECTION_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const REFLECTION_REMINDER_PATH = path.join(REFLECTION_RUNTIME_DIR, 'reflection-reminder.txt');
const REFLECTION_SPAWN_REQUEST_PATH = path.join(
  REFLECTION_RUNTIME_DIR,
  'reflection-spawn-request.json'
);
const REPORTS_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'reports');
const READ_DIR_LISTING_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'read-safety-dir-listing.txt'
);
const READ_DIR_LISTING_MAX_ATTEMPTS = 5;

function hasReadWindow(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  const numeric = value => Number.isFinite(Number(value)) && Number(value) >= 0;
  return (
    numeric(toolInput.offset) ||
    numeric(toolInput.limit) ||
    numeric(toolInput.start_line) ||
    numeric(toolInput.end_line) ||
    numeric(toolInput.startLine) ||
    numeric(toolInput.endLine)
  );
}

function resolveReadPath(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const raw = toolInput.file_path || toolInput.filePath || toolInput.path || null;
  if (!raw || typeof raw !== 'string') return null;
  return path.isAbsolute(raw) ? raw : path.resolve(PROJECT_ROOT, raw);
}

function isBypassPermissionsMode(hookInput) {
  return hookInput && hookInput.permission_mode === 'bypassPermissions';
}

function ensureReflectionReadTarget(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;

  try {
    if (targetPath === REFLECTION_REMINDER_PATH && !fs.existsSync(targetPath)) {
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, '', 'utf8');
      return true;
    }

    if (targetPath === REFLECTION_SPAWN_REQUEST_PATH && !fs.existsSync(targetPath)) {
      ensureDir(path.dirname(targetPath));
      fs.writeFileSync(targetPath, '[]\n', 'utf8');
      return true;
    }
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:read-safety] Reflection target ensure failed:', err.message);
    }
  }

  return false;
}

function ensureReportReadTarget(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  if (fs.existsSync(targetPath)) return false;

  const normalizedTarget = path.resolve(targetPath);
  const normalizedReportsDir = path.resolve(REPORTS_DIR);
  const isReportPath = normalizedTarget.startsWith(normalizedReportsDir + path.sep);
  const isMarkdown = normalizedTarget.toLowerCase().endsWith('.md');

  if (!isReportPath || !isMarkdown) {
    return false;
  }

  const relativePath = path.relative(normalizedReportsDir, normalizedTarget);
  if (relativePath.startsWith('..')) {
    return false;
  }

  try {
    ensureDir(path.dirname(normalizedTarget));
    const placeholder = [
      '# Missing Report Placeholder',
      '',
      `Requested report was not found at read time: \`${relativePath.replace(/\\/g, '/')}\``,
      '',
      'This placeholder was auto-created by pre-tool read safety to avoid hard tool failure.',
      'Regenerate the missing report if full content is required.',
      '',
    ].join('\n');
    fs.writeFileSync(normalizedTarget, placeholder, 'utf8');
    return true;
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:read-safety] Report target ensure failed:', err.message);
    }
    return false;
  }
}

function ensureTaskOutputReadTarget(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  if (fs.existsSync(targetPath)) return false;

  try {
    const normalizedTarget = path.resolve(targetPath);
    const tempRoot = path.resolve(os.tmpdir(), 'claude');
    const inTempClaude = normalizedTarget.startsWith(tempRoot + path.sep);
    const inTasksDir =
      normalizedTarget.includes(`${path.sep}tasks${path.sep}`) ||
      normalizedTarget.endsWith(`${path.sep}tasks`);
    if (!inTempClaude || !inTasksDir) {
      return false;
    }

    ensureDir(path.dirname(normalizedTarget));
    const placeholder = [
      '# Missing Task Output Placeholder',
      '',
      `Requested task output was not found at read time: \`${normalizedTarget}\``,
      '',
      'This placeholder was auto-created by pre-tool read safety to avoid hard Read failure.',
      '',
    ].join('\n');
    fs.writeFileSync(normalizedTarget, placeholder, 'utf8');
    return true;
  } catch (_err) {
    return false;
  }
}

function createDirectoryListingFile(targetDir) {
  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const lines = [];
    lines.push(`# Directory listing for ${targetDir}`);
    lines.push(`# Generated by pre-tool read safety (${new Date().toISOString()})`);
    lines.push('');
    for (const entry of entries.slice(0, 300)) {
      const kind = entry.isDirectory() ? '[DIR]' : '[FILE]';
      lines.push(`${kind} ${entry.name}`);
    }
    if (entries.length > 300) {
      lines.push('');
      lines.push(`... truncated (${entries.length - 300} additional entries)`);
    }
    lines.push('');
    ensureDir(path.dirname(READ_DIR_LISTING_PATH));

    for (let attempt = 0; attempt < READ_DIR_LISTING_MAX_ATTEMPTS; attempt += 1) {
      const candidatePath =
        attempt === 0
          ? READ_DIR_LISTING_PATH
          : path.join(
              path.dirname(READ_DIR_LISTING_PATH),
              `read-safety-dir-listing-${process.pid}-${Date.now()}-${attempt}.txt`
            );

      try {
        if (fs.existsSync(candidatePath)) {
          const candidateStats = fs.statSync(candidatePath);
          if (candidateStats.isDirectory()) {
            continue;
          }
        }

        fs.writeFileSync(candidatePath, lines.join('\n'), 'utf8');
        const writtenStats = fs.statSync(candidatePath);
        if (!writtenStats.isDirectory()) {
          return candidatePath;
        }
      } catch (_candidateErr) {
        // Try next candidate path.
      }
    }

    return null;
  } catch (_err) {
    return null;
  }
}

function checkReadSafety(toolName, toolInput, hookInput = null) {
  if (toolName !== 'Read') {
    return { checked: false, reason: 'not_read_tool' };
  }

  try {
    const targetPath = resolveReadPath(toolInput);
    if (!targetPath) {
      return {
        checked: true,
        action: 'block',
        message:
          '[READ SAFETY] Missing Read target path. ' +
          'Provide file_path/filePath/path from a prior tool result (TaskOutput/Glob/Write) before calling Read.',
      };
    }

    ensureReflectionReadTarget(targetPath);
    ensureReportReadTarget(targetPath);
    ensureTaskOutputReadTarget(targetPath);
    if (!fs.existsSync(targetPath)) {
      // Never allow host Read on a missing path; this avoids noisy "file does not exist" hard failures.
      return {
        checked: true,
        action: 'block',
        message:
          `[READ SAFETY] "${targetPath}" does not exist. ` +
          'Use Glob/TaskOutput to discover a valid path, or generate the artifact before reading it.',
      };
    }

    const stats = fs.statSync(targetPath);

    if (stats.isDirectory()) {
      if (isBypassPermissionsMode(hookInput)) {
        return {
          checked: true,
          action: 'block',
          message:
            `[READ SAFETY][bypass] "${targetPath}" is a directory. ` +
            'Read requires a concrete file path. Use Glob/rg --files to list files, then Read a specific file.',
        };
      }
      return {
        checked: true,
        action: 'block',
        message:
          `[READ SAFETY] "${targetPath}" is a directory. ` +
          'Use Glob/rg --files for directory listing, then Read a specific file.',
      };
    }

    // If file is large and caller did not request a window, force chunked read.
    if (stats.size > READ_CHUNK_GUARD_BYTES && !hasReadWindow(toolInput)) {
      return {
        checked: true,
        action: 'block',
        message:
          `${
            isBypassPermissionsMode(hookInput) ? '[READ SAFETY][bypass] ' : '[READ SAFETY] '
          }Large file (${stats.size} bytes) requires chunked Read. ` +
          'Retry with offset/limit (or start_line/end_line), e.g. offset: 0, limit: 4000.',
      };
    }

    return { checked: true, action: 'allow' };
  } catch (err) {
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified:read-safety] Error:', err.message);
    }
    return { checked: false, error: err.message };
  }
}

// =============================================================================
// Combined Runner
// =============================================================================

async function main() {
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput) || {};

    // Check 1: Session Cleanup (once per session)
    checkSessionCleanup();

    // Check 2: Execution Limit Monitor
    const limitResult = checkExecutionLimit(hookInput, toolName, toolInput);
    if (limitResult.action === 'block') {
      console.log(formatResult('block', limitResult.message));
      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName,
          reason: 'execution_limit_exceeded',
        });
      } catch (_err) {
        // Best-effort
      }
      process.exit(2);
    }

    // Check 3: Tool Scope Validator
    const scopeResult = checkToolScope(hookInput, toolName);
    if (scopeResult.action === 'block') {
      console.log(formatResult('block', scopeResult.message));
      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName,
          reason: 'tool_scope_violation',
        });
      } catch (_err) {
        // Best-effort
      }
      process.exit(2);
    }

    // Check 4: TaskUpdate-first Guard
    const taskUpdateFirst = checkTaskUpdateFirst(hookInput, toolName, toolInput);
    if (taskUpdateFirst.action === 'block') {
      console.log(formatResult('block', taskUpdateFirst.message));
      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName,
          reason: 'taskupdate_first_violation',
        });
      } catch (_err) {
        // Best-effort
      }
      process.exit(2);
    }
    if (taskUpdateFirst.warning) {
      console.warn(`[pre-tool-unified:taskupdate-first] ${taskUpdateFirst.warning}`);
    }

    // Check 5: Read Safety Guard
    const readSafety = checkReadSafety(toolName, toolInput, hookInput);
    if (readSafety.action === 'block') {
      console.log(formatResult('block', readSafety.message));
      try {
        eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName,
          reason: 'read_safety_violation',
        });
      } catch (_err) {
        // Best-effort
      }
      process.exit(2);
    }
    if (readSafety.action === 'rewrite' && readSafety.rewrittenToolInput) {
      if (readSafety.bypassWarning) {
        console.error(`[pre-tool-unified:read-safety] ${readSafety.bypassWarning}`);
      }
      console.log(JSON.stringify({ tool_input: readSafety.rewrittenToolInput }));
      process.exit(0);
    }
    if (readSafety.bypassWarning) {
      console.error(`[pre-tool-unified:read-safety] ${readSafety.bypassWarning}`);
    }

    // All checks passed
    process.exit(0);
  } catch (err) {
    // Fail open: monitoring must not break tool usage
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified] Error:', err.message);
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

// Exports for testing
module.exports = {
  checkSessionCleanup,
  cleanupMemoryTempFiles,
  checkExecutionLimit,
  checkToolScope,
  checkTaskUpdateFirst,
  readTaskUpdateFirstState,
  writeTaskUpdateFirstState,
  pruneTaskUpdateFirstState,
  extractTaskUpdateStatus,
  extractTaskUpdateTaskId,
  isAgentScopedSession,
  checkReadSafety,
  hasReadWindow,
  resolveReadPath,
  isBypassPermissionsMode,
  ensureReflectionReadTarget,
  ensureReportReadTarget,
  ensureTaskOutputReadTarget,
  createDirectoryListingFile,
  main,
};
