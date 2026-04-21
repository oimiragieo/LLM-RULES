#!/usr/bin/env node
/**
 * Unified PreToolUse Hook (Wildcard Consolidation)
 *
 * Consolidates empty-matcher PreToolUse checks into a single entrypoint.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { libRequire } = require('./pre-tool-unified.shared.cjs');
const cleanup = require('./pre-tool-unified.cleanup.cjs');
const execution = require('./pre-tool-unified.execution.cjs');
const taskUpdate = require('./pre-tool-unified.taskupdate.cjs');
const guardrails = require('./pre-tool-unified.guardrails.cjs');
const readSafety = require('./pre-tool-unified.read-safety.cjs');
const memorySync = require('./pre-tool-unified.memory-sync.cjs');

const { parseHookInputAsync, getToolName, getToolInput, formatResult } = libRequire(
  path.join('utils', 'hook-input.cjs')
);
const { PROJECT_ROOT } = libRequire(path.join('utils', 'project-root.cjs'));
const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes } = libRequire(path.join('events', 'event-types.cjs'));
const { atomicWriteJSONSync } = libRequire(path.join('utils', 'atomic-write.cjs'));
const { safeParseJSON } = libRequire(path.join('utils', 'safe-json.cjs'));

const PRETOOL_CIRCUIT_STATE_FILE =
  process.env.PRETOOL_CIRCUIT_STATE_FILE ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'pretool-circuit-state.json');
const PRETOOL_CIRCUIT_BREAKER_THRESHOLD = Number(
  process.env.PRETOOL_CIRCUIT_BREAKER_THRESHOLD || 10
);
const PRETOOL_CIRCUIT_BREAKER_WINDOW_MS = Number(
  process.env.PRETOOL_CIRCUIT_BREAKER_WINDOW_MS || 10 * 60 * 1000
);
const PRETOOL_CIRCUIT_MAX_KEYS = Number(process.env.PRETOOL_CIRCUIT_MAX_KEYS || 200);

async function emitToolBlocked(toolName, reason) {
  try {
    await Promise.race([
      eventBus.emit(EventTypes.TOOL_BLOCKED, {
        type: EventTypes.TOOL_BLOCKED,
        timestamp: new Date().toISOString(),
        toolName,
        reason,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Event emission timeout')), 5000)
      ),
    ]);
  } catch (err) {
    // Non-critical error - log to stderr but don't block
    console.error(`[pre-tool-unified] Event emission error: ${err.message}`);
  }
}

function getCircuitSessionId(hookInput) {
  return (
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown'
  );
}

function normalizeCircuitCategory(toolName, message) {
  const msg = String(message || '');
  if (/windows-incompatible bash heredoc\/tmp/i.test(msg)) return `${toolName}:bash_windows_guard`;
  if (/router bash guard/i.test(msg)) return `${toolName}:router_bash_guard`;
  if (/bash redirection\/heredoc/i.test(msg)) return `${toolName}:bash_artifact_write`;
  if (/tasklist-first violation/i.test(msg)) return `${toolName}:tasklist_first_violation`;
  return `${toolName}:${msg.slice(0, 120).toLowerCase()}`;
}

function readCircuitState() {
  try {
    if (!fs.existsSync(PRETOOL_CIRCUIT_STATE_FILE)) return { sessions: {} };
    const raw = fs.readFileSync(PRETOOL_CIRCUIT_STATE_FILE, 'utf8');
    const parsed = safeParseJSON(raw);
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

function writeCircuitState(state) {
  try {
    atomicWriteJSONSync(PRETOOL_CIRCUIT_STATE_FILE, state);
  } catch (_err) {
    // Best effort only.
  }
}

function applyCircuitBreakerMessage(toolName, message, hookInput) {
  const sessionId = getCircuitSessionId(hookInput);
  const category = normalizeCircuitCategory(toolName, message);
  const now = Date.now();
  const state = readCircuitState();
  const sessionState = state.sessions[sessionId] || {};
  const entry = sessionState[category] || { count: 0, lastAt: 0, firstAt: now };
  const withinWindow = now - Number(entry.lastAt || 0) <= PRETOOL_CIRCUIT_BREAKER_WINDOW_MS;
  const next = {
    count: withinWindow ? Number(entry.count || 0) + 1 : 1,
    firstAt: withinWindow ? Number(entry.firstAt || now) : now,
    lastAt: now,
  };
  sessionState[category] = next;

  // Keep state bounded per session.
  const keys = Object.keys(sessionState);
  if (keys.length > PRETOOL_CIRCUIT_MAX_KEYS) {
    keys
      .sort((a, b) => Number(sessionState[b].lastAt || 0) - Number(sessionState[a].lastAt || 0))
      .slice(PRETOOL_CIRCUIT_MAX_KEYS)
      .forEach(k => delete sessionState[k]);
  }
  state.sessions[sessionId] = sessionState;
  writeCircuitState(state);

  if (next.count < PRETOOL_CIRCUIT_BREAKER_THRESHOLD) return message;

  const repeatedWindowSec = Math.max(1, Math.round((now - Number(next.firstAt || now)) / 1000));
  const genericPrefix =
    `[CIRCUIT-BREAKER] Blocked ${next.count}x in ${repeatedWindowSec}s for the same policy violation. ` +
    'Stop retrying the same command and switch strategy.';
  if (String(toolName || '').toLowerCase() === 'bash') {
    return (
      `${genericPrefix} ` +
      'Do not retry with Bash. Use the Write tool for file content: Write({ file_path: "<path>", content: "..." }). ' +
      'Avoid heredoc, `/tmp`, and `/c/...` on Windows.'
    );
  }
  return `${genericPrefix} Last violation: ${message}`;
}

async function main() {
  try {
    if (process.env.PRETOOL_UNIFIED_TEST_FORCE_THROW === '1') {
      throw new Error('Forced pre-tool-unified test failure');
    }

    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput) || {};

    cleanup.checkSessionCleanup();

    const limitResult = execution.checkExecutionLimit(hookInput, toolName, toolInput);
    if (limitResult.action === 'block') {
      const message = applyCircuitBreakerMessage(toolName, limitResult.message, hookInput);
      console.log(formatResult('block', message));
      await emitToolBlocked(toolName, 'execution_limit_exceeded');
      process.exit(2);
    }

    const scopeResult = execution.checkToolScope(hookInput, toolName);
    if (scopeResult.action === 'block') {
      const message = applyCircuitBreakerMessage(toolName, scopeResult.message, hookInput);
      console.log(formatResult('block', message));
      await emitToolBlocked(toolName, 'tool_scope_violation');
      process.exit(2);
    }

    const taskUpdateFirst = taskUpdate.checkTaskUpdateFirst(hookInput, toolName, toolInput);
    if (taskUpdateFirst.action === 'block') {
      const message = applyCircuitBreakerMessage(toolName, taskUpdateFirst.message, hookInput);
      console.log(formatResult('block', message));
      await emitToolBlocked(toolName, 'taskupdate_first_violation');
      process.exit(2);
    }
    if (taskUpdateFirst.warning) {
      console.warn(`[pre-tool-unified:taskupdate-first] ${taskUpdateFirst.warning}`);
    }

    const memorySyncResult = memorySync.checkDynamicMemorySync(hookInput);
    if (memorySyncResult.hasUpdate && memorySyncResult.warning) {
      console.warn(`[pre-tool-unified:memory-sync] ${memorySyncResult.warning}`);
    }

    const bashArtifactWriteResult = guardrails.checkBashArtifactWriteSafety(
      toolName,
      toolInput,
      hookInput
    );
    if (bashArtifactWriteResult.action === 'block') {
      const message = applyCircuitBreakerMessage(
        toolName,
        bashArtifactWriteResult.message,
        hookInput
      );
      console.log(formatResult('block', message));
      process.exit(0);
    }
    if (bashArtifactWriteResult.warning) {
      console.warn(`[pre-tool-unified:guardrail] ${bashArtifactWriteResult.warning}`);
    }

    const structuredMemoryWriteResult = guardrails.checkStructuredMemoryDirectWrite(
      toolName,
      toolInput
    );
    if (structuredMemoryWriteResult.action === 'block') {
      const message = applyCircuitBreakerMessage(
        toolName,
        structuredMemoryWriteResult.message,
        hookInput
      );
      console.log(formatResult('block', message));
      process.exit(0);
    }
    if (structuredMemoryWriteResult.warning) {
      console.warn(`[pre-tool-unified:memory-guard] ${structuredMemoryWriteResult.warning}`);
    }

    const guardrailResult = guardrails.checkAgentGuardrails(hookInput, toolName, toolInput);
    if (guardrailResult.action === 'block') {
      const message = applyCircuitBreakerMessage(toolName, guardrailResult.message, hookInput);
      console.log(formatResult('block', message));
      process.exit(0);
    }
    if (guardrailResult.action === 'rewrite' && guardrailResult.rewrittenCommand) {
      if (guardrailResult.bypassWarning) {
        console.error(`[pre-tool-unified:guardrail] ${guardrailResult.bypassWarning}`);
      }
      console.log(
        JSON.stringify({ tool_input: { ...toolInput, command: guardrailResult.rewrittenCommand } })
      );
      process.exit(0);
    }
    if (guardrailResult.warning) {
      console.warn(`[pre-tool-unified:guardrail] ${guardrailResult.warning}`);
    }

    const readSafetyResult = readSafety.checkReadSafety(toolName, toolInput, hookInput);
    if (readSafetyResult.action === 'block') {
      const message = applyCircuitBreakerMessage(toolName, readSafetyResult.message, hookInput);
      console.log(formatResult('block', message));
      await emitToolBlocked(toolName, 'read_safety_violation');
      // Deviation DR-1: converted ambiguous-read block to exit 3 (escalate) per ADR-2026-04-21.
      // Read safety violations are policy-ambiguous: they may need human confirmation rather than
      // a hard block. Exit 3 defers the tool call and surfaces a TaskUpdate(blocked) to the router.
      console.error(`ESCALATE: blockerType=safety needsFrom=user blocker=read_safety_violation`);
      process.exit(3);
    }
    if (readSafetyResult.action === 'rewrite' && readSafetyResult.rewrittenToolInput) {
      if (readSafetyResult.bypassWarning) {
        console.error(`[pre-tool-unified:read-safety] ${readSafetyResult.bypassWarning}`);
      }
      console.log(JSON.stringify({ tool_input: readSafetyResult.rewrittenToolInput }));
      process.exit(0);
    }
    if (readSafetyResult.bypassWarning) {
      console.error(`[pre-tool-unified:read-safety] ${readSafetyResult.bypassWarning}`);
    }

    process.exit(0);
  } catch (err) {
    // Log ALL errors to stderr with context
    const hookInput = process.argv[2];
    let toolInfo = '';
    try {
      const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
      const input = safeParseJSON(hookInput || '{}', null, null, {});
      const tool = input.tool || 'unknown';
      toolInfo = ` [tool=${tool}]`;
    } catch (_) {
      // Ignore parse errors
    }
    console.error(`[pre-tool-unified] Hook error${toolInfo}: ${err.message}`);
    if (err.stack) {
      console.error(`[pre-tool-unified] Stack: ${err.stack}`);
    }
    // Security-critical hook must fail closed on internal errors.
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkSessionCleanup: cleanup.checkSessionCleanup,
  cleanupMemoryTempFiles: cleanup.cleanupMemoryTempFiles,
  checkExecutionLimit: execution.checkExecutionLimit,
  checkToolScope: execution.checkToolScope,
  checkTaskUpdateFirst: taskUpdate.checkTaskUpdateFirst,
  readTaskUpdateFirstState: taskUpdate.readTaskUpdateFirstState,
  writeTaskUpdateFirstState: taskUpdate.writeTaskUpdateFirstState,
  pruneTaskUpdateFirstState: taskUpdate.pruneTaskUpdateFirstState,
  extractTaskUpdateStatus: taskUpdate.extractTaskUpdateStatus,
  extractTaskUpdateTaskId: taskUpdate.extractTaskUpdateTaskId,
  isAgentScopedSession: taskUpdate.isAgentScopedSession,
  checkReadSafety: readSafety.checkReadSafety,
  hasReadWindow: readSafety.hasReadWindow,
  resolveReadPath: readSafety.resolveReadPath,
  isBypassPermissionsMode: readSafety.isBypassPermissionsMode,
  ensureReflectionReadTarget: readSafety.ensureReflectionReadTarget,
  ensureReportReadTarget: readSafety.ensureReportReadTarget,
  ensureTaskOutputReadTarget: readSafety.ensureTaskOutputReadTarget,
  ensureIntegrationQueueReadTarget: readSafety.ensureIntegrationQueueReadTarget,
  createDirectoryListingFile: readSafety.createDirectoryListingFile,
  readAgentGuardrailsState: guardrails.readAgentGuardrailsState,
  writeAgentGuardrailsState: guardrails.writeAgentGuardrailsState,
  checkBashArtifactWriteSafety: guardrails.checkBashArtifactWriteSafety,
  checkStructuredMemoryDirectWrite: guardrails.checkStructuredMemoryDirectWrite,
  checkAgentGuardrails: guardrails.checkAgentGuardrails,
  applyCircuitBreakerMessage,
  normalizeCircuitCategory,
  getCircuitSessionId,
  extractTaskOutputPathsFromCommand: guardrails.extractTaskOutputPathsFromCommand,
  isTaskOutputPollingCommand: guardrails.isTaskOutputPollingCommand,
  hasTerminalTestSummary: guardrails.hasTerminalTestSummary,
  evaluateTaskOutputPolling: guardrails.evaluateTaskOutputPolling,
  isGitCommitCommand: guardrails.isGitCommitCommand,
  isCheckpointCommand: guardrails.isCheckpointCommand,
  normalizeToolPath: guardrails.normalizeToolPath,
  isAllowedByFilePolicy: guardrails.isAllowedByFilePolicy,
  main,
};
