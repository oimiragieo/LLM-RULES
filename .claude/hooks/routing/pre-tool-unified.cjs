#!/usr/bin/env node
/**
 * Unified PreToolUse Hook (Wildcard Consolidation)
 *
 * Consolidates empty-matcher PreToolUse checks into a single entrypoint.
 */

'use strict';

const path = require('path');

const { libRequire } = require('./pre-tool-unified.shared.cjs');
const cleanup = require('./pre-tool-unified.cleanup.cjs');
const execution = require('./pre-tool-unified.execution.cjs');
const taskUpdate = require('./pre-tool-unified.taskupdate.cjs');
const guardrails = require('./pre-tool-unified.guardrails.cjs');
const readSafety = require('./pre-tool-unified.read-safety.cjs');

const { parseHookInputAsync, getToolName, getToolInput, formatResult } = libRequire(
  path.join('utils', 'hook-input.cjs')
);
const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes } = libRequire(path.join('events', 'event-types.cjs'));

function emitToolBlocked(toolName, reason) {
  try {
    eventBus.emit(EventTypes.TOOL_BLOCKED, {
      type: EventTypes.TOOL_BLOCKED,
      timestamp: new Date().toISOString(),
      toolName,
      reason,
    });
  } catch (_err) {
    // Best-effort.
  }
}

async function main() {
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput) || {};

    cleanup.checkSessionCleanup();

    const limitResult = execution.checkExecutionLimit(hookInput, toolName, toolInput);
    if (limitResult.action === 'block') {
      console.log(formatResult('block', limitResult.message));
      emitToolBlocked(toolName, 'execution_limit_exceeded');
      process.exit(2);
    }

    const scopeResult = execution.checkToolScope(hookInput, toolName);
    if (scopeResult.action === 'block') {
      console.log(formatResult('block', scopeResult.message));
      emitToolBlocked(toolName, 'tool_scope_violation');
      process.exit(2);
    }

    const taskUpdateFirst = taskUpdate.checkTaskUpdateFirst(hookInput, toolName, toolInput);
    if (taskUpdateFirst.action === 'block') {
      console.log(formatResult('block', taskUpdateFirst.message));
      emitToolBlocked(toolName, 'taskupdate_first_violation');
      process.exit(2);
    }
    if (taskUpdateFirst.warning) {
      console.warn(`[pre-tool-unified:taskupdate-first] ${taskUpdateFirst.warning}`);
    }

    const guardrailResult = guardrails.checkAgentGuardrails(hookInput, toolName, toolInput);
    if (guardrailResult.action === 'block') {
      console.log(formatResult('block', guardrailResult.message));
      process.exit(2);
    }
    if (guardrailResult.warning) {
      console.warn(`[pre-tool-unified:guardrail] ${guardrailResult.warning}`);
    }

    const readSafetyResult = readSafety.checkReadSafety(toolName, toolInput, hookInput);
    if (readSafetyResult.action === 'block') {
      console.log(formatResult('block', readSafetyResult.message));
      emitToolBlocked(toolName, 'read_safety_violation');
      process.exit(2);
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
    if (process.env.DEBUG_HOOKS) {
      console.error('[pre-tool-unified] Error:', err.message);
    }
    process.exit(0);
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
  checkAgentGuardrails: guardrails.checkAgentGuardrails,
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
