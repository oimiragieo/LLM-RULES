#!/usr/bin/env node
/**
 * Pre-Task Unified Hook
 *
 * Thin runtime wrapper around pre-task-unified-core.cjs.
 * Keeps CLI/event behavior and public exports stable while the core checks
 * live in a separate module for maintainability.
 */

'use strict';

const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB_DIR = path.join(PROJECT_ROOT, '.claude', 'lib');

function libRequire(modulePath) {
  return require(path.join(LIB_DIR, modulePath));
}

const { parseHookInputAsync, getToolName, formatResult, auditLog } = libRequire(
  path.join('utils', 'hook-input.cjs')
);
const eventBus = libRequire(path.join('events', 'event-bus.cjs'));
const { EventTypes } = libRequire(path.join('events', 'event-types.cjs'));

const core = require('./pre-task-unified-core.cjs');

const {
  runAllChecks,
  checkTaskListFirst,
  checkAgentContextPreTracker,
  checkCoreMemoryReadBeforeTask,
  checkRoutingGuard,
  checkLoopPrevention,
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  isHighRiskSpecialistSpawn,
  extractSpawnAgentType,
  isImplementationAgentSpawn,
  extractTaskDescription,
  extractAgentType,
  isEvolutionTrigger,
  detectEvolutionType,
  getDepthLimit,
  getLoopState,
  readTaskListLoopStateAsync,
  writeTaskListLoopStateAsync,
  registerTaskListFirstViolationAsync,
  clearTaskListFirstViolationAsync,
  readPlannerFirstLoopStateAsync,
  writePlannerFirstLoopStateAsync,
  registerPlannerFirstViolationAsync,
  clearPlannerFirstViolationAsync,
  invalidateCachedState,
  updateLoopStateAfterAllow,
  checkParallelOwnershipRequired,
  checkTaskOwnershipConflicts,
  registerTaskOwnershipClaimAfterAllow,
  checkSpawnRoleGuardrails,
  hasResumeDirective,
  hasMultiWaveDirective,
  parseAllowedFilesFromPrompt,
  extractGuardrailPolicy,
  readAgentGuardrailsStateAsync,
  writeAgentGuardrailsStateAsync,
  persistGuardrailPolicy,
  PLANNER_PATTERNS,
  SECURITY_PATTERNS,
  IMPLEMENTATION_AGENTS,
  EVOLUTION_TRIGGERS,
  EVOLUTION_TYPES,
  LOOP_STATE_FILE,
  AGENT_GUARDRAILS_STATE_FILE,
} = core;

async function main() {
  const startTime = Date.now();
  try {
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    if (toolName !== 'Task') {
      process.exit(0);
    }

    const result = await runAllChecks(hookInput);

    if (!result.pass) {
      try {
        if (result.exitCode === 2) {
          await eventBus.emit(EventTypes.TOOL_BLOCKED, {
            type: EventTypes.TOOL_BLOCKED,
            timestamp: new Date().toISOString(),
            toolName: 'Task',
            duration: Date.now() - startTime,
            reason: result.message,
          });
        } else {
          await eventBus.emit(EventTypes.TOOL_COMPLETED, {
            type: EventTypes.TOOL_COMPLETED,
            timestamp: new Date().toISOString(),
            toolName: 'Task',
            duration: Date.now() - startTime,
            output: {
              status: 'warn',
              reason: result.message,
            },
          });
        }
      } catch (_err) {
        process.stderr.write(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'error',
            component: 'pre-task-unified',
            event: 'telemetry_emit_failed',
            error: _err.message,
          }) + '\n'
        );
      }
      console.log(formatResult(result.exitCode === 2 ? 'block' : 'warn', result.message));
      process.exit(result.exitCode);
    }

    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'Task',
        duration: Date.now() - startTime,
        output: {
          status: 'ok',
        },
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(0);
  } catch (err) {
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'pre-task-unified',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }

    if (process.env.HOOK_FAIL_OPEN === 'true') {
      auditLog('pre-task-unified', 'fail_open_override', { error: err.message });
      process.exit(0);
    }

    auditLog('pre-task-unified', 'error_fail_closed', { error: err.message });
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  runAllChecks,
  checkTaskListFirst,
  checkAgentContextPreTracker,
  checkCoreMemoryReadBeforeTask,
  checkRoutingGuard,
  checkLoopPrevention,
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  isHighRiskSpecialistSpawn,
  extractSpawnAgentType,
  isImplementationAgentSpawn,
  extractTaskDescription,
  extractAgentType,
  isEvolutionTrigger,
  detectEvolutionType,
  getDepthLimit,
  getLoopState,
  readTaskListLoopStateAsync,
  writeTaskListLoopStateAsync,
  registerTaskListFirstViolationAsync,
  clearTaskListFirstViolationAsync,
  readPlannerFirstLoopStateAsync,
  writePlannerFirstLoopStateAsync,
  registerPlannerFirstViolationAsync,
  clearPlannerFirstViolationAsync,
  invalidateCachedState,
  updateLoopStateAfterAllow,
  checkParallelOwnershipRequired,
  checkTaskOwnershipConflicts,
  registerTaskOwnershipClaimAfterAllow,
  checkSpawnRoleGuardrails,
  hasResumeDirective,
  hasMultiWaveDirective,
  parseAllowedFilesFromPrompt,
  extractGuardrailPolicy,
  readAgentGuardrailsStateAsync,
  writeAgentGuardrailsStateAsync,
  persistGuardrailPolicy,
  PLANNER_PATTERNS,
  SECURITY_PATTERNS,
  IMPLEMENTATION_AGENTS,
  EVOLUTION_TRIGGERS,
  EVOLUTION_TYPES,
  LOOP_STATE_FILE,
  AGENT_GUARDRAILS_STATE_FILE,
};
