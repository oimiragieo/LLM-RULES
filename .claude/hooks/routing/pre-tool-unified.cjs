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
const routerState = libRequire(path.join('routing', 'router-state.cjs'));
const { canonicalizePathForPlatform } = libRequire(path.join('utils', 'path-canonicalizer.cjs'));

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
const AGENT_GUARDRAILS_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'agent-guardrails-state.json'
);
const AGENT_BASH_POLL_GUARD = 'AGENT_BASH_POLL_GUARD';
const AGENT_BASH_POLL_STALE_MS = Number(process.env.AGENT_BASH_POLL_STALE_MS || 90 * 1000);
const AGENT_BASH_POLL_REPEAT_THRESHOLD = Number(process.env.AGENT_BASH_POLL_REPEAT_THRESHOLD || 6);
const AGENT_BASH_POLL_WINDOW_MS = Number(process.env.AGENT_BASH_POLL_WINDOW_MS || 120 * 1000);
const AGENT_BASH_POLL_MAX_TRACKED_FILES = Number(
  process.env.AGENT_BASH_POLL_MAX_TRACKED_FILES || 20
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

function isNumericTaskAlias(taskId) {
  return typeof taskId === 'string' && /^[0-9]+$/.test(taskId.trim());
}

function resolveCanonicalTaskId(hookInput, toolInput, currentEntry = null) {
  const hookTaskId =
    extractTaskUpdateTaskId(hookInput) || hookInput?.task_id || hookInput?.taskId || null;
  const toolTaskId = extractTaskUpdateTaskId(toolInput);
  const currentTaskId = currentEntry?.taskId || null;

  if (hookTaskId) {
    const mismatch =
      toolTaskId &&
      String(toolTaskId).trim().length > 0 &&
      String(toolTaskId).trim() !== String(hookTaskId).trim();
    return {
      taskId: String(hookTaskId).trim(),
      mismatch,
      toolTaskId: mismatch ? String(toolTaskId).trim() : null,
      aliasMismatch: mismatch && isNumericTaskAlias(String(toolTaskId).trim()),
    };
  }

  if (toolTaskId) {
    return {
      taskId: String(toolTaskId).trim(),
      mismatch: false,
      toolTaskId: null,
      aliasMismatch: false,
    };
  }

  if (currentTaskId) {
    return {
      taskId: String(currentTaskId).trim(),
      mismatch: false,
      toolTaskId: null,
      aliasMismatch: false,
    };
  }

  return {
    taskId: null,
    mismatch: false,
    toolTaskId: null,
    aliasMismatch: false,
  };
}

function normalizeTaskIdentifier(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
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

  // Final fallback: infer agent context from shared router state when
  // hook payload/env are minimal (observed in some subagent runs).
  try {
    const state = routerState.getState();
    if (state && (state.taskSpawned === true || state.mode === 'agent')) {
      return true;
    }
  } catch (_err) {
    // Best-effort only.
  }

  return false;
}

function allowFromRouterBootstrap(hookInput, sessionId, now, current, stateFile) {
  const bootstrapEnabled = String(process.env.TASKUPDATE_FIRST_BOOTSTRAP || 'false').toLowerCase();
  if (bootstrapEnabled !== 'true') return null;
  try {
    const state = routerState.getState();
    const lastTaskUpdate = routerState.getLastTaskUpdate();
    const candidateTaskId = hookInput?.task_id || hookInput?.taskId || null;
    const hookSessionId = sessionId ? String(sessionId).trim() : '';
    const stateSessionId = state?.sessionId ? String(state.sessionId).trim() : '';
    const hasExplicitSessionMatch =
      hookSessionId.length > 0 && stateSessionId.length > 0 && hookSessionId === stateSessionId;

    // Require explicit session match to prevent cross-session bootstrap leakage.
    if (!hasExplicitSessionMatch) return null;

    const normalizedCandidateTaskId = normalizeTaskIdentifier(candidateTaskId);
    const normalizedLastTaskId = normalizeTaskIdentifier(lastTaskUpdate?.taskId);
    const taskIdMatches =
      !normalizedCandidateTaskId ||
      (normalizedLastTaskId && normalizedCandidateTaskId === normalizedLastTaskId);

    if (
      routerState.wasTaskUpdateCalledRecently() &&
      (lastTaskUpdate?.status === 'in_progress' || lastTaskUpdate?.status === 'in-progress') &&
      taskIdMatches
    ) {
      current.sessions[sessionId] = {
        inProgress: true,
        taskId: String(lastTaskUpdate.taskId || candidateTaskId || ''),
        updatedAt: now,
      };
      writeTaskUpdateFirstState(current, stateFile);
      return { checked: true, action: 'allow' };
    }
  } catch (_err) {
    // Best-effort fallback only.
  }
  return null;
}

function allowWithAutoMark(taskId, toolName) {
  return {
    checked: true,
    action: 'allow',
    warning:
      `[TASKUPDATE-FIRST AUTO-MARK] Missing TaskUpdate call detected before ${toolName}; ` +
      `auto-marked task ${String(taskId)} as in_progress. Agent should call TaskUpdate explicitly next.`,
  };
}

function tryAutoMarkTaskUpdateInProgress({
  hookInput,
  toolInput,
  currentEntry,
  sessionId,
  now,
  current,
  stateFile,
  toolName,
}) {
  const autoMarkEnabled = String(process.env.TASKUPDATE_FIRST_AUTOMARK || 'false').toLowerCase();
  if (autoMarkEnabled === 'off') return null;

  const inferredTaskId = resolveCanonicalTaskId(hookInput, toolInput, currentEntry).taskId;
  if (!inferredTaskId) return null;

  current.sessions[sessionId] = {
    inProgress: true,
    taskId: String(inferredTaskId),
    updatedAt: now,
  };
  writeTaskUpdateFirstState(current, stateFile);

  try {
    routerState.recordTaskUpdate(String(inferredTaskId), 'in_progress');
  } catch (_err) {
    // Best-effort.
  }
  return allowWithAutoMark(inferredTaskId, toolName);
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
  if (toolName === 'Task') return { checked: false, reason: 'task_spawn' };

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
    const taskResolution = resolveCanonicalTaskId(hookInput, toolInput, currentEntry);
    const taskId = taskResolution.taskId;
    const isCompleted = status === 'completed';

    if (isCompleted && taskResolution.mismatch) {
      return {
        checked: true,
        action: 'block',
        message:
          `[TASKUPDATE-FIRST TASK-ID MISMATCH] Refusing TaskUpdate(completed) with taskId="${taskResolution.toolTaskId}". ` +
          `Canonical session taskId is "${taskId}". Use canonical taskId when completing task status.`,
      };
    }

    if (status === 'in_progress' || status === 'in-progress' || status === 'completed') {
      current.sessions[sessionId] = {
        inProgress: !isCompleted,
        taskId: taskId || currentEntry.taskId || null,
        status,
        updatedAt: now,
      };
      writeTaskUpdateFirstState(current, stateFile);
    }
    if (taskResolution.aliasMismatch) {
      return {
        checked: true,
        action: 'allow',
        warning:
          `[TASKUPDATE-FIRST TASK-ID NORMALIZED] Received TaskUpdate taskId="${taskResolution.toolTaskId}" ` +
          `but canonical session taskId="${taskId}". Proceeded with canonical taskId to avoid task-state drift.`,
      };
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

  // Bootstrap fallback: pre-task hook records in_progress in router-state at spawn time.
  // When subagent hook payloads are sparse or delayed, honor that marker to avoid deadlock.
  const bootstrapAllow = allowFromRouterBootstrap(hookInput, sessionId, now, current, stateFile);
  if (bootstrapAllow) return bootstrapAllow;

  const autoMarkAllow = tryAutoMarkTaskUpdateInProgress({
    hookInput,
    toolInput,
    currentEntry,
    sessionId,
    now,
    current,
    stateFile,
    toolName,
  });
  if (autoMarkAllow) return autoMarkAllow;

  const message =
    '[TASKUPDATE-FIRST] Agent must call TaskUpdate({ taskId, status: "in_progress" }) ' +
    `before using ${toolName}.`;
  if (mode === 'warn') {
    return { checked: true, action: 'allow', warning: message };
  }
  return { checked: true, action: 'block', message };
}

function readAgentGuardrailsState(stateFile = AGENT_GUARDRAILS_STATE_FILE) {
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

function writeAgentGuardrailsState(state, stateFile = AGENT_GUARDRAILS_STATE_FILE) {
  try {
    ensureDir(path.dirname(stateFile));
    atomicWriteJSONSync(stateFile, state);
  } catch (_err) {
    // Best-effort state tracking.
  }
}

function getSessionGuardrailEntry(hookInput, state) {
  const sessionId =
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || null;
  if (!sessionId || !state?.sessions || typeof state.sessions !== 'object') {
    return { sessionId: null, entry: null };
  }
  return {
    sessionId,
    entry: state.sessions[sessionId] || null,
  };
}

function getBashCommand(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  if (typeof toolInput.command === 'string') return toolInput.command;
  if (typeof toolInput.cmd === 'string') return toolInput.cmd;
  return '';
}

function normalizeTaskOutputPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let normalized = rawPath.replace(/^['"`]|['"`]$/g, '');
  if (process.platform === 'win32') {
    const unixDriveMatch = normalized.match(/^\/([a-zA-Z])\/(.*)$/);
    if (unixDriveMatch) {
      const drive = unixDriveMatch[1].toUpperCase();
      const rest = unixDriveMatch[2].replace(/\//g, '\\');
      normalized = `${drive}:\\${rest}`;
    }
  }
  return path.resolve(normalized);
}

function extractTaskOutputPathsFromCommand(command) {
  if (!command || typeof command !== 'string') return [];
  const results = new Set();
  const regexes = [
    /([A-Za-z]:\\[^\s"'`]*?tasks\\[^\s"'`]+\.output)/g,
    /(\/[a-zA-Z]\/[^\s"'`]*?\/tasks\/[^\s"'`]+\.output)/g,
  ];
  for (const regex of regexes) {
    let match = regex.exec(command);
    while (match) {
      const normalized = normalizeTaskOutputPath(match[1]);
      if (normalized) results.add(normalized);
      match = regex.exec(command);
    }
  }
  return Array.from(results);
}

function isTaskOutputPollingCommand(command) {
  if (!command || typeof command !== 'string') return false;
  if (extractTaskOutputPathsFromCommand(command).length === 0) return false;
  return /\b(cat|tail|head|grep|wc|ls|stat|sed|awk|Get-Content)\b/i.test(command);
}

function readTailBytes(filePath, maxBytes = 64 * 1024) {
  try {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    if (size <= 0) return '';
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      return buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (_err) {
    return '';
  }
}

function hasTerminalTestSummary(outputTail) {
  if (!outputTail || typeof outputTail !== 'string') return false;
  const hasCounts = /#\s+tests\s+\d+/i.test(outputTail) && /#\s+fail\s+\d+/i.test(outputTail);
  const hasLifecycleExit = /ELIFECYCLE|Test failed\. See above for more details\./i.test(
    outputTail
  );
  const hasTapSummary = /1\.\.\d+/i.test(outputTail) && /#\s+duration_ms\s+\d+/i.test(outputTail);
  return hasCounts || hasLifecycleExit || hasTapSummary;
}

function prunePollHistory(pollHistory, now) {
  if (!pollHistory || typeof pollHistory !== 'object') return {};
  const entries = Object.entries(pollHistory)
    .filter(([, value]) => value && typeof value === 'object')
    .sort((a, b) => Number(b[1].lastSeenAt || 0) - Number(a[1].lastSeenAt || 0))
    .slice(0, AGENT_BASH_POLL_MAX_TRACKED_FILES);
  const pruned = {};
  for (const [key, value] of entries) {
    if (now - Number(value.lastSeenAt || 0) <= TASKUPDATE_FIRST_WINDOW_MS) {
      pruned[key] = value;
    }
  }
  return pruned;
}

function evaluateTaskOutputPolling(command, entry) {
  if (!isTaskOutputPollingCommand(command)) {
    return { action: 'allow', updatedEntry: null };
  }

  const now = Date.now();
  const paths = extractTaskOutputPathsFromCommand(command);
  if (paths.length === 0) {
    return { action: 'allow', updatedEntry: null };
  }

  const pollHistory = prunePollHistory(entry?.pollHistory || {}, now);
  let blockMessage = null;

  for (const outputPath of paths) {
    const previous = pollHistory[outputPath] || {
      repeatCount: 0,
      unchangedCount: 0,
      lastSeenAt: 0,
      lastMtimeMs: 0,
    };

    if (!fs.existsSync(outputPath)) {
      pollHistory[outputPath] = {
        ...previous,
        repeatCount:
          now - Number(previous.lastSeenAt || 0) <= AGENT_BASH_POLL_WINDOW_MS
            ? Number(previous.repeatCount || 0) + 1
            : 1,
        lastSeenAt: now,
      };
      continue;
    }

    const stats = fs.statSync(outputPath);
    const staleMs = now - Number(stats.mtimeMs || 0);
    const unchanged = Number(previous.lastMtimeMs || 0) === Number(stats.mtimeMs || 0);
    const repeatCount =
      now - Number(previous.lastSeenAt || 0) <= AGENT_BASH_POLL_WINDOW_MS
        ? Number(previous.repeatCount || 0) + 1
        : 1;
    const unchangedCount = unchanged ? Number(previous.unchangedCount || 0) + 1 : 0;
    const tail = readTailBytes(outputPath);
    const terminal = hasTerminalTestSummary(tail);

    pollHistory[outputPath] = {
      repeatCount,
      unchangedCount,
      lastSeenAt: now,
      lastMtimeMs: Number(stats.mtimeMs || 0),
      terminalSeen: terminal,
    };

    if (terminal) {
      blockMessage =
        `[AGENT-BASH-POLL-GUARD] Blocking repeated polling for "${outputPath}". ` +
        'The output already contains terminal test summary markers. ' +
        'Stop polling and report the final pass/fail counts.';
      break;
    }

    if (
      staleMs >= AGENT_BASH_POLL_STALE_MS &&
      (repeatCount >= AGENT_BASH_POLL_REPEAT_THRESHOLD ||
        unchangedCount >= AGENT_BASH_POLL_REPEAT_THRESHOLD)
    ) {
      blockMessage =
        `[AGENT-BASH-POLL-GUARD] Blocking stale task-output polling for "${outputPath}". ` +
        `No file updates detected for ${Math.round(staleMs / 1000)}s across repeated polls. ` +
        'Switch to diagnosis or spawn a fresh test run instead of looping.';
      break;
    }
  }

  return {
    action: blockMessage ? 'block' : 'allow',
    message: blockMessage,
    updatedEntry: { ...entry, pollHistory, updatedAt: now },
  };
}

function isGitCommitCommand(command) {
  if (!command || typeof command !== 'string') return false;
  return /\bgit\s+(?:commit|push|merge|rebase|cherry-pick)\b/i.test(command);
}

function isCheckpointCommand(command) {
  if (!command || typeof command !== 'string') return false;
  return (
    /\bgit\s+diff\s+--name-only\b/i.test(command) ||
    /\bgit\s+status\s+(?:--porcelain|--short)\b/i.test(command)
  );
}

function normalizeToolPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  const canonical = canonicalizePathForPlatform(rawPath, PROJECT_ROOT);
  const resolved = path.isAbsolute(canonical) ? canonical : path.resolve(PROJECT_ROOT, canonical);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (relative.startsWith('..')) return null;
  return relative.replace(/\\/g, '/');
}

function getMutationPath(toolName, toolInput) {
  if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
    return null;
  }
  const filePath =
    toolInput?.file_path || toolInput?.filePath || toolInput?.path || toolInput?.notebook_path;
  return normalizeToolPath(filePath);
}

function isAllowedByFilePolicy(targetPath, allowlist) {
  if (!targetPath || !Array.isArray(allowlist) || allowlist.length === 0) return true;
  const normalizedTarget = targetPath.toLowerCase();
  return allowlist.some(entry => {
    const normalizedEntry = normalizeToolPath(entry);
    if (!normalizedEntry) return false;
    const candidate = normalizedEntry.toLowerCase();
    return normalizedTarget === candidate || normalizedTarget.startsWith(`${candidate}/`);
  });
}

function checkAgentGuardrails(
  hookInput,
  toolName,
  toolInput,
  stateFile = AGENT_GUARDRAILS_STATE_FILE
) {
  const mode = (process.env.AGENT_GUARDRAIL_ENFORCEMENT || 'block').toLowerCase();
  if (mode === 'off') return { checked: false, reason: 'disabled' };
  if (!isAgentScopedSession(hookInput)) return { checked: false, reason: 'not_agent_session' };

  const state = readAgentGuardrailsState(stateFile);
  const { sessionId, entry } = getSessionGuardrailEntry(hookInput, state);
  if (!sessionId || !entry) return { checked: false, reason: 'missing_policy' };

  if (toolName === 'Bash') {
    const command = getBashCommand(toolInput);
    const pollMode = (process.env[AGENT_BASH_POLL_GUARD] || 'block').toLowerCase();
    if (pollMode !== 'off') {
      const pollGuard = evaluateTaskOutputPolling(command, entry);
      if (pollGuard.updatedEntry) {
        state.sessions[sessionId] = pollGuard.updatedEntry;
        writeAgentGuardrailsState(state, stateFile);
      }
      if (pollGuard.action === 'block') {
        if (pollMode === 'warn') {
          return { checked: true, action: 'allow', warning: pollGuard.message };
        }
        return { checked: true, action: 'block', message: pollGuard.message };
      }
    }

    if (isCheckpointCommand(command)) {
      state.sessions[sessionId] = {
        ...entry,
        checkpointDone: true,
        updatedAt: Date.now(),
      };
      writeAgentGuardrailsState(state, stateFile);
      return { checked: true, action: 'allow' };
    }

    const commitMode = (process.env.AGENT_GIT_COMMIT_ENFORCEMENT || 'block').toLowerCase();
    if (commitMode !== 'off' && isGitCommitCommand(command) && entry.allowGitCommit !== true) {
      const message =
        '[AGENT-GUARDRAIL] git commit/push/merge/rebase is blocked unless explicitly allowed in spawn policy.';
      if (commitMode === 'warn') {
        return { checked: true, action: 'allow', warning: message };
      }
      return { checked: true, action: 'block', message };
    }
  }

  const mutationPath = getMutationPath(toolName, toolInput);
  if (!mutationPath) {
    return { checked: true, action: 'allow' };
  }

  const fileAllowlistMode = (process.env.AGENT_FILE_ALLOWLIST_ENFORCEMENT || 'block').toLowerCase();
  const hasAllowlist = Array.isArray(entry.allowedFiles) && entry.allowedFiles.length > 0;
  if (hasAllowlist && !isAllowedByFilePolicy(mutationPath, entry.allowedFiles)) {
    const message = `[AGENT-GUARDRAIL] File "${mutationPath}" is outside the assigned allowlist.`;
    if (fileAllowlistMode === 'warn') {
      return { checked: true, action: 'allow', warning: message };
    }
    if (fileAllowlistMode === 'off') {
      // continue
    } else {
      return { checked: true, action: 'block', message };
    }
  }

  const checkpointMode = (process.env.AGENT_EDIT_CHECKPOINT_ENFORCEMENT || 'block').toLowerCase();
  const touchedFiles = Array.isArray(entry.touchedFiles) ? entry.touchedFiles : [];
  const nextTouched = touchedFiles.includes(mutationPath)
    ? touchedFiles
    : [...touchedFiles, mutationPath];

  if (!entry.firstMutationSeen) {
    state.sessions[sessionId] = {
      ...entry,
      firstMutationSeen: true,
      checkpointDone: false,
      touchedFiles: nextTouched,
      updatedAt: Date.now(),
    };
    writeAgentGuardrailsState(state, stateFile);
    return {
      checked: true,
      action: 'allow',
      warning:
        '[AGENT-GUARDRAIL] First mutation recorded. Run `git diff --name-only` before additional edits.',
    };
  }

  if (!entry.checkpointDone && checkpointMode !== 'off') {
    const message =
      '[AGENT-GUARDRAIL] Missing checkpoint. Run `git diff --name-only` or `git status --porcelain` before additional edits.';
    if (checkpointMode === 'warn') {
      state.sessions[sessionId] = {
        ...entry,
        touchedFiles: nextTouched,
        updatedAt: Date.now(),
      };
      writeAgentGuardrailsState(state, stateFile);
      return { checked: true, action: 'allow', warning: message };
    }
    return { checked: true, action: 'block', message };
  }

  state.sessions[sessionId] = {
    ...entry,
    touchedFiles: nextTouched,
    updatedAt: Date.now(),
  };
  writeAgentGuardrailsState(state, stateFile);
  return { checked: true, action: 'allow' };
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
const INTEGRATION_QUEUE_PATH = path.join(REFLECTION_RUNTIME_DIR, 'integration-queue.jsonl');
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
  let normalized = raw;

  // Normalize Unix-style drive-prefixed paths emitted on Windows shells.
  // Example: /c/dev/projects/... -> C:\dev\projects\...
  if (process.platform === 'win32') {
    const unixDriveMatch = normalized.match(/^\/([a-zA-Z])\/(.*)$/);
    if (unixDriveMatch) {
      const drive = unixDriveMatch[1].toUpperCase();
      const rest = unixDriveMatch[2].replace(/\//g, '\\');
      normalized = `${drive}:\\${rest}`;
    }
  }

  return path.isAbsolute(normalized) ? normalized : path.resolve(PROJECT_ROOT, normalized);
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

function ensureIntegrationQueueReadTarget(targetPath) {
  try {
    const normalizedTarget = path.resolve(targetPath);
    if (normalizedTarget !== path.resolve(INTEGRATION_QUEUE_PATH)) return false;
    if (fs.existsSync(normalizedTarget)) return false;
    ensureDir(path.dirname(normalizedTarget));
    fs.writeFileSync(normalizedTarget, '', 'utf8');
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
    ensureIntegrationQueueReadTarget(targetPath);
    if (!fs.existsSync(targetPath)) {
      const missingPathHints = {
        '.claude/lib/memory/memory-query.cjs': '.claude/lib/memory/core/memory-query.cjs',
        '.claude/lib/utils/safe-json-parse.cjs': '.claude/lib/utils/safe-json.cjs',
        'tests/metrics/metrics-schema-contract.test.cjs':
          'tests/lib/monitoring/metrics-schema-contract.test.cjs',
        'tests/metrics/metrics-reader-rollups.test.cjs':
          'tests/lib/monitoring/metrics-reader-rollups.test.cjs',
        '.claude/context/artifacts/research-reports/p0-fix-research-2026-02-13.md':
          '.claude/context/reports/p0-fix-research-2026-02-13.md',
        '.claude/context/artifacts/research-reports/implementation-patterns-research-2026-02-13.md':
          '.claude/context/reports/implementation-patterns-research-2026-02-13.md',
      };
      const relativePath = path.relative(PROJECT_ROOT, targetPath).replace(/\\/g, '/');
      const suggestedPath = missingPathHints[relativePath];
      const suggestionText = suggestedPath
        ? ` Did you mean "${path.join(PROJECT_ROOT, suggestedPath)}"?`
        : '';
      // Never allow host Read on a missing path; this avoids noisy "file does not exist" hard failures.
      return {
        checked: true,
        action: 'block',
        message:
          `[READ SAFETY] "${targetPath}" does not exist. ` +
          `Use Glob/TaskOutput to discover a valid path, or generate the artifact before reading it.${suggestionText}`,
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

    // Check 5: Agent execution guardrails
    const guardrailResult = checkAgentGuardrails(hookInput, toolName, toolInput);
    if (guardrailResult.action === 'block') {
      console.log(formatResult('block', guardrailResult.message));
      process.exit(2);
    }
    if (guardrailResult.warning) {
      console.warn(`[pre-tool-unified:guardrail] ${guardrailResult.warning}`);
    }

    // Check 6: Read Safety Guard
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
  ensureIntegrationQueueReadTarget,
  createDirectoryListingFile,
  readAgentGuardrailsState,
  writeAgentGuardrailsState,
  checkAgentGuardrails,
  extractTaskOutputPathsFromCommand,
  isTaskOutputPollingCommand,
  hasTerminalTestSummary,
  evaluateTaskOutputPolling,
  isGitCommitCommand,
  isCheckpointCommand,
  normalizeToolPath,
  isAllowedByFilePolicy,
  main,
};
