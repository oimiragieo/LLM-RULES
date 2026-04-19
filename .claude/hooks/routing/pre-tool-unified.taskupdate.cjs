'use strict';

const fs = require('fs');
const path = require('path');

const {
  PROJECT_ROOT,
  atomicWriteJSONSync,
  safeParseJSON,
  routerState,
} = require('./pre-tool-unified.shared.cjs');
const { ensureDir } = require('./pre-tool-unified.execution.cjs');

const TASKUPDATE_FIRST_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'taskupdate-first-state.json'
);
const TASKUPDATE_FIRST_WINDOW_MS = Number(
  process.env.TASKUPDATE_FIRST_WINDOW_MS || 24 * 60 * 60 * 1000
);
const TASKUPDATE_FIRST_PREFLIGHT_TASKLIST_MAX = Number(
  process.env.TASKUPDATE_FIRST_PREFLIGHT_TASKLIST_MAX || 1
);
const TASKUPDATE_FIRST_MAX_VIOLATIONS = Number(process.env.TASKUPDATE_FIRST_MAX_VIOLATIONS || 1);

function isTaskUpdateFirstSelfHealEnabled() {
  const value = String(process.env.TASKUPDATE_FIRST_SELF_HEAL || 'off')
    .trim()
    .toLowerCase();
  return value === 'on';
}

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

function resolveGuidanceTaskId(hookInput, toolInput, currentEntry) {
  const directResolution = resolveCanonicalTaskId(hookInput, toolInput, currentEntry).taskId;
  if (directResolution) return directResolution;

  const hookTaskId = hookInput?.task_id || hookInput?.taskId || null;
  if (typeof hookTaskId === 'string' && hookTaskId.trim().length > 0) {
    return hookTaskId.trim();
  }

  const currentTaskId = currentEntry?.taskId || null;
  if (typeof currentTaskId === 'string' && currentTaskId.trim().length > 0) {
    return currentTaskId.trim();
  }

  try {
    const stateTaskId = routerState.getCurrentSpawnTaskId();
    if (typeof stateTaskId === 'string' && stateTaskId.trim().length > 0) {
      return stateTaskId.trim();
    }
  } catch (_err) {
    // Best-effort fallback only.
  }

  try {
    const state = routerState.getState();
    const fallbackTaskId = state?.currentSpawnTaskId || state?.lastTaskUpdateTaskId || null;
    if (typeof fallbackTaskId === 'string' && fallbackTaskId.trim().length > 0) {
      return fallbackTaskId.trim();
    }
  } catch (_err) {
    // Best-effort fallback only.
  }

  return null;
}

function allowWithSelfHeal(taskId, toolName) {
  return {
    checked: true,
    action: 'allow',
    warning:
      `[TASKUPDATE-FIRST SELF-HEAL] First preflight violation before ${toolName}; ` +
      `auto-marked task ${String(taskId)} as in_progress and allowed execution to prevent deny-loop.`,
  };
}

function isAgentScopedSession(hookInput) {
  const agentId = String(process.env.CLAUDE_AGENT_ID || '')
    .trim()
    .toLowerCase();

  // The Router is the root coordinator and should NEVER be restricted by task-first protocols.
  if (agentId === 'router') return false;

  const allowedTools = Array.isArray(hookInput?.allowed_tools) ? hookInput.allowed_tools : [];
  if (allowedTools.includes('TaskUpdate')) return true;

  const scopedTaskId = hookInput?.task_id || hookInput?.taskId || null;
  if (typeof scopedTaskId === 'string' && scopedTaskId.trim().length > 0) return true;

  if (agentId && agentId !== '') return true;

  try {
    const state = routerState.getState();
    const hookSessionId = String(hookInput?.session_id || hookInput?.sessionId || '').trim();
    const stateSessionId = String(state?.sessionId || '').trim();
    if (!hookSessionId || !stateSessionId || hookSessionId !== stateSessionId) return false;
    const stateTaskId = String(
      state?.currentSpawnTaskId || state?.lastTaskUpdateTaskId || ''
    ).trim();
    if (stateTaskId && (state.taskSpawned === true || state.mode === 'agent')) return true;
  } catch (_err) {
    // Best-effort only.
  }

  return false;
}

function resolveRouterSessionTaskId(hookInput) {
  try {
    const state = routerState.getState();
    const hookSessionId = String(hookInput?.session_id || hookInput?.sessionId || '').trim();
    const stateSessionId = String(state?.sessionId || '').trim();
    if (!hookSessionId || !stateSessionId || hookSessionId !== stateSessionId) return null;
    const taskId = String(state?.currentSpawnTaskId || state?.lastTaskUpdateTaskId || '').trim();
    return taskId || null;
  } catch (_err) {
    return null;
  }
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
  if (autoMarkEnabled !== 'true') return null;

  const inferredTaskId =
    resolveCanonicalTaskId(hookInput, toolInput, currentEntry).taskId ||
    resolveRouterSessionTaskId(hookInput);
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

/**
 * F-LIFECYCLE: Handle TaskUpdate(deleted/cancelled) — removes session and orphan entries.
 * Extracted to reduce cyclomatic complexity of checkTaskUpdateFirst.
 * @returns {{ checked: true, action: 'allow' }}
 */
function handleTaskUpdateDeletion(sessionId, taskId, toolInput, current, stateFile) {
  if (current.sessions[sessionId]) {
    delete current.sessions[sessionId];
    writeTaskUpdateFirstState(current, stateFile);
  }
  // Remove ANY session whose taskId matches the deletion target (handles orphan test-fixture entries)
  const targetTaskId = taskId || extractTaskUpdateTaskId(toolInput);
  if (targetTaskId) {
    let mutated = false;
    for (const [sid, entry] of Object.entries(current.sessions)) {
      if (entry && entry.taskId === targetTaskId) {
        delete current.sessions[sid];
        mutated = true;
      }
    }
    if (mutated) writeTaskUpdateFirstState(current, stateFile);
  }
  return { checked: true, action: 'allow' };
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
    preflightTaskListCalls: 0,
    preflightViolations: 0,
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

    // F-LIFECYCLE: handle deleted/cancelled status — remove session entry and orphan cleanup
    if (status === 'deleted' || status === 'cancelled') {
      return handleTaskUpdateDeletion(sessionId, taskId, toolInput, current, stateFile);
    }

    if (
      status === 'in_progress' ||
      status === 'in-progress' ||
      status === 'completed' ||
      (!status && taskId)
    ) {
      current.sessions[sessionId] = {
        inProgress: status !== 'completed',
        taskId: taskId || currentEntry.taskId || null,
        status: status || currentEntry.status || 'in_progress',
        preflightTaskListCalls: 0,
        preflightViolations: 0,
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

  if (toolName === 'TaskList') {
    const nextTaskListCalls = Number(currentEntry.preflightTaskListCalls || 0) + 1;
    current.sessions[sessionId] = {
      ...currentEntry,
      preflightTaskListCalls: nextTaskListCalls,
      updatedAt: now,
    };
    writeTaskUpdateFirstState(current, stateFile);

    if (nextTaskListCalls <= TASKUPDATE_FIRST_PREFLIGHT_TASKLIST_MAX) {
      return { checked: true, action: 'allow' };
    }

    const canonicalTaskId = resolveGuidanceTaskId(hookInput, toolInput, currentEntry);
    const recommendedTaskId = canonicalTaskId || '<canonical-task-id>';
    return {
      checked: true,
      action: 'block',
      message:
        `[TASKUPDATE-FIRST HARD-FAIL] Repeated TaskList() preflight without TaskUpdate(in_progress). ` +
        `Before any further tools, run TaskUpdate({ taskId: "${recommendedTaskId}", status: "in_progress" }).`,
    };
  }

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

  const nextViolations = Number(currentEntry.preflightViolations || 0) + 1;
  const canonicalTaskId = resolveGuidanceTaskId(hookInput, toolInput, currentEntry);
  const recommendedTaskId = canonicalTaskId || '<canonical-task-id>';

  const selfHealEnabled = isTaskUpdateFirstSelfHealEnabled();
  if (selfHealEnabled && nextViolations === 1 && canonicalTaskId) {
    current.sessions[sessionId] = {
      inProgress: true,
      taskId: canonicalTaskId,
      status: 'in_progress',
      preflightTaskListCalls: Number(currentEntry.preflightTaskListCalls || 0),
      preflightViolations: 0,
      updatedAt: now,
    };
    writeTaskUpdateFirstState(current, stateFile);
    try {
      routerState.recordTaskUpdate(String(canonicalTaskId), 'in_progress');
    } catch (_err) {
      // Best-effort.
    }
    return allowWithSelfHeal(canonicalTaskId, toolName);
  }

  current.sessions[sessionId] = {
    ...currentEntry,
    preflightViolations: nextViolations,
    updatedAt: now,
  };
  writeTaskUpdateFirstState(current, stateFile);

  const baseGuidance =
    `Only TaskList() and TaskUpdate() are allowed before first in_progress. ` +
    `Run TaskUpdate({ taskId: "${recommendedTaskId}", status: "in_progress" }) before using ${toolName}.`;
  const message =
    nextViolations > TASKUPDATE_FIRST_MAX_VIOLATIONS
      ? `[TASKUPDATE-FIRST HARD-FAIL] Repeated preflight violation. ${baseGuidance}`
      : `[TASKUPDATE-FIRST AUTO-REROUTE] ${baseGuidance}`;
  if (mode === 'warn') {
    return { checked: true, action: 'allow', warning: message };
  }
  return { checked: true, action: 'block', message };
}

module.exports = {
  TASKUPDATE_FIRST_STATE_FILE,
  readTaskUpdateFirstState,
  writeTaskUpdateFirstState,
  pruneTaskUpdateFirstState,
  extractTaskUpdateStatus,
  extractTaskUpdateTaskId,
  isAgentScopedSession,
  checkTaskUpdateFirst,
};
