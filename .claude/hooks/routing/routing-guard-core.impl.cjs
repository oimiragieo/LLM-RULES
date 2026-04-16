#!/usr/bin/env node
'use strict';
/* eslint-disable max-lines */

let _emitBlockVerdict;
try {
  _emitBlockVerdict = require('../safety/bypass-audit-hook.cjs').emitBlockVerdict;
} catch (_) {
  /* best-effort */
}

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const routerState = require('../../lib/routing/router-state.cjs');
const { logRouterChurnEvent } = require('../../lib/monitoring/router-churn-log.cjs');
const { logRuntimeHealth } = require('../../lib/monitoring/runtime-health-log.cjs');
const {
  ALL_WATCHED_TOOLS,
  BLACKLISTED_TOOLS,
  WHITELISTED_TOOLS,
  WRITE_TOOLS,
  IMPLEMENTATION_AGENTS,
  ROUTER_BASH_WHITELIST,
  SPECIALIST_KEYWORD_MAP,
  isAlwaysAllowedWrite,
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  isHighRiskSpecialistSpawn,
  extractSpawnAgentType,
  isImplementationAgentSpawn,
  isWhitelistedBashCommand,
  extractTaskIdFromPrompt,
} = require('./routing-guard-core.policy.cjs');
const {
  getMemoryMonitor,
  shouldDelegateTaskChecksToPreTaskUnified,
  extractDedupeCount,
  applyStaleDetection,
  getCachedRouterState,
  invalidateCachedState,
  setStateCacheEnabled,
  clearInvocationCache,
  isRouterInvocation,
  resetBlockDedupeState,
} = require('./routing-guard-core.shared.cjs');
const {
  checkRouterBash,
  checkRouterSelfCheck,
  checkRouterReadGovernance,
  checkRouterWrite,
  checkMemoryPressure,
} = require('./routing-guard-core.checks-router.cjs');
const {
  checkTaskPayloadContract,
  checkHierarchicalSubRouterDispatch,
  checkPlannerFirst,
  checkTaskCreate,
  checkSecurityReview,
  checkCodeSimplifierArchitectReview,
  checkHighRiskSpecialistArchitectReview,
  checkSpecialistOverride,
  checkTaskListFirstGate,
  checkCreatorIntentGuard,
  checkSkillAgentConfused,
  checkReflectionBackgroundSpawn,
} = require('./routing-guard-core.checks-task.cjs');
const {
  INTENT_PATTERNS,
  detectIntent,
  agentMatchesIntent,
  checkIntentAgentMatch,
  extractAgentTypeFromPrompt,
  extractModelFromToolInput,
  checkConfigModelValidator,
} = require('./routing-guard-core.intent-model.cjs');

let eventBus;
try {
  eventBus = require('../../lib/events/event-bus.cjs');
} catch (_err) {
  eventBus = null;
}
const { EventTypes } = require('../../lib/events/event-types.cjs');

function runAllChecks(toolName, toolInput, hookInput = null) {
  const previousCacheEnabled = setStateCacheEnabled(true);
  try {
    const warnings = [];

    const captureWarn = (checkName, checkResult) => {
      if (checkResult.result !== 'warn') return;
      console.warn(checkResult.message);
      warnings.push({
        checkName,
        message: checkResult.message || '',
        dedupeCount: extractDedupeCount(checkResult.message),
      });
    };

    // TaskList-first and hierarchical dispatch are checked in pre-task-unified-core.cjs
    // when delegation is active (default). Only run here when delegation is off or
    // ROUTING_GUARD_LEGACY_CHECKS=on forces them.
    const forceLegacy =
      String(process.env.ROUTING_GUARD_LEGACY_CHECKS || 'off').toLowerCase() === 'on';
    if (forceLegacy || !shouldDelegateTaskChecksToPreTaskUnified(toolName)) {
      const taskListCheck = checkTaskListFirstGate(toolName, hookInput);
      if (!taskListCheck.pass) {
        return {
          pass: false,
          result: taskListCheck.result,
          message: taskListCheck.message,
          checkName: 'tasklist-first-gate',
          warnings,
        };
      }
      captureWarn('tasklist-first-gate', taskListCheck);
    }

    const payloadCheck = checkTaskPayloadContract(toolName, toolInput, hookInput);
    if (!payloadCheck.pass) {
      return {
        pass: false,
        result: payloadCheck.result,
        message: payloadCheck.message,
        checkName: 'task-payload-contract',
        warnings,
      };
    }
    captureWarn('task-payload-contract', payloadCheck);

    if (forceLegacy || !shouldDelegateTaskChecksToPreTaskUnified(toolName)) {
      const hierarchicalDispatchCheck = checkHierarchicalSubRouterDispatch(
        toolName,
        toolInput,
        hookInput
      );
      if (!hierarchicalDispatchCheck.pass) {
        return {
          pass: false,
          result: hierarchicalDispatchCheck.result,
          message: hierarchicalDispatchCheck.message,
          checkName: 'hierarchical-sub-router-dispatch',
          warnings,
        };
      }
      captureWarn('hierarchical-sub-router-dispatch', hierarchicalDispatchCheck);
    }

    const bashCheck = checkRouterBash(toolName, toolInput, hookInput);
    if (!bashCheck.pass) {
      return {
        pass: false,
        result: bashCheck.result,
        message: bashCheck.message,
        checkName: 'router-bash-check',
        warnings,
      };
    }
    captureWarn('router-bash-check', bashCheck);

    const selfCheck = checkRouterSelfCheck(toolName, toolInput, hookInput);
    if (!selfCheck.pass) {
      return {
        pass: false,
        result: selfCheck.result,
        message: selfCheck.message,
        checkName: 'router-self-check',
        warnings,
      };
    }
    captureWarn('router-self-check', selfCheck);

    const readGovernance = checkRouterReadGovernance(toolName, toolInput, hookInput);
    if (!readGovernance.pass) {
      return {
        pass: false,
        result: readGovernance.result,
        message: readGovernance.message,
        checkName: 'router-read-governance',
        warnings,
      };
    }
    captureWarn('router-read-governance', readGovernance);

    if (!shouldDelegateTaskChecksToPreTaskUnified(toolName)) {
      const plannerCheck = checkPlannerFirst(toolName, toolInput);
      if (!plannerCheck.pass) {
        return {
          pass: false,
          result: plannerCheck.result,
          message: plannerCheck.message,
          checkName: 'planner-first-guard',
          warnings,
        };
      }
      captureWarn('planner-first-guard', plannerCheck);
    }

    const taskCreateCheck = checkTaskCreate(toolName, hookInput);
    if (!taskCreateCheck.pass) {
      return {
        pass: false,
        result: taskCreateCheck.result,
        message: taskCreateCheck.message,
        checkName: 'task-create-guard',
        warnings,
      };
    }
    captureWarn('task-create-guard', taskCreateCheck);

    if (!shouldDelegateTaskChecksToPreTaskUnified(toolName)) {
      const securityCheck = checkSecurityReview(toolName, toolInput);
      if (!securityCheck.pass) {
        return {
          pass: false,
          result: securityCheck.result,
          message: securityCheck.message,
          checkName: 'security-review-guard',
          warnings,
        };
      }
      captureWarn('security-review-guard', securityCheck);

      const architectCheck = checkCodeSimplifierArchitectReview(toolName, toolInput);
      if (!architectCheck.pass) {
        return {
          pass: false,
          result: architectCheck.result,
          message: architectCheck.message,
          checkName: 'code-simplifier-architect-guard',
          warnings,
        };
      }
      captureWarn('code-simplifier-architect-guard', architectCheck);

      const highRiskArchitectCheck = checkHighRiskSpecialistArchitectReview(toolName, toolInput);
      if (!highRiskArchitectCheck.pass) {
        return {
          pass: false,
          result: highRiskArchitectCheck.result,
          message: highRiskArchitectCheck.message,
          checkName: 'high-risk-specialist-architect-guard',
          warnings,
        };
      }
      captureWarn('high-risk-specialist-architect-guard', highRiskArchitectCheck);
    }

    const writeCheck = checkRouterWrite(toolName, toolInput, hookInput);
    if (!writeCheck.pass) {
      return {
        pass: false,
        result: writeCheck.result,
        message: writeCheck.message,
        checkName: 'router-write-guard',
        warnings,
      };
    }
    captureWarn('router-write-guard', writeCheck);

    const memoryCheck = checkMemoryPressure(toolName);
    if (!memoryCheck.pass) {
      return {
        pass: false,
        result: memoryCheck.result,
        message: memoryCheck.message,
        checkName: 'memory-pressure-check',
        warnings,
      };
    }

    const specialistCheck = checkSpecialistOverride(toolName, toolInput);
    if (!specialistCheck.pass) {
      return {
        pass: false,
        result: specialistCheck.result,
        message: specialistCheck.message,
        checkName: 'specialist-override',
        warnings,
      };
    }
    captureWarn('specialist-override', specialistCheck);

    const creatorCheck = checkCreatorIntentGuard(toolName, toolInput);
    if (!creatorCheck.pass) {
      return {
        pass: false,
        result: creatorCheck.result,
        message: creatorCheck.message,
        checkName: 'creator-intent-guard',
        warnings,
      };
    }
    captureWarn('creator-intent-guard', creatorCheck);

    const reflectionBgCheck = checkReflectionBackgroundSpawn(toolName, toolInput);
    if (!reflectionBgCheck.pass) {
      return {
        pass: false,
        result: reflectionBgCheck.result,
        message: reflectionBgCheck.message,
        checkName: 'reflection-background-spawn',
        warnings,
      };
    }
    captureWarn('reflection-background-spawn', reflectionBgCheck);

    const skillAgentConfusedCheck = checkSkillAgentConfused(toolName, toolInput);
    if (!skillAgentConfusedCheck.pass) {
      return {
        pass: false,
        result: skillAgentConfusedCheck.result,
        message: skillAgentConfusedCheck.message,
        checkName: 'skill-agent-confusion',
        warnings,
      };
    }

    const intentCheck = checkIntentAgentMatch(toolName, toolInput, hookInput);
    if (!intentCheck.pass) {
      return {
        pass: false,
        result: intentCheck.result,
        message: intentCheck.message,
        checkName: 'intent-agent-match',
        warnings,
      };
    }
    captureWarn('intent-agent-match', intentCheck);

    const modelCheck = checkConfigModelValidator(toolName, toolInput, hookInput);
    if (!modelCheck.pass) {
      return {
        pass: false,
        result: modelCheck.result,
        message: modelCheck.message,
        checkName: 'config-model-validator',
        warnings,
      };
    }
    captureWarn('config-model-validator', modelCheck);

    return { pass: true, result: 'allow', message: '', warnings };
  } finally {
    setStateCacheEnabled(previousCacheEnabled);
    clearInvocationCache();
  }
}

function isFailOpenOverrideAuthorized() {
  if (String(process.env.HOOK_FAIL_OPEN || '').toLowerCase() !== 'true') {
    return false;
  }
  const ack = String(process.env.HOOK_FAIL_OPEN_ACK || '').trim();
  const scope = String(process.env.HOOK_FAIL_OPEN_SCOPE || '')
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (ack !== 'ALLOW_HOOK_FAIL_OPEN') {
    return false;
  }
  return scope.includes('all') || scope.includes('routing-guard');
}

/**
 * Security hooks MUST be fail-closed: exit 2 to block, 0 to warn/pass-through.
 * Extracted from main() to stay within ESLint complexity budget.
 */
function resolveExitCode(result) {
  return result.result === 'block' ? 2 : 0;
}

async function main() {
  const startTime = Date.now();
  try {
    if (process.env.ROUTING_GUARD_TEST_FORCE_THROW === '1') {
      throw new Error('Forced routing-guard test failure');
    }

    invalidateCachedState();

    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      process.exit(0);
    }

    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    if (!toolName || !ALL_WATCHED_TOOLS.includes(toolName)) {
      process.exit(0);
    }

    if (!isRouterInvocation(hookInput)) {
      process.exit(0);
    }

    if (eventBus) {
      try {
        eventBus.emit('TOOL_INVOKED', {
          type: 'TOOL_INVOKED',
          toolName,
          input: toolInput,
          agentId: process.env.CLAUDE_AGENT_ID || 'router',
          taskId: process.env.CLAUDE_TASK_ID || 'unknown',
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[routing-guard] Event emission failed:', err.message);
      }
    }

    if (toolName === 'Task' && eventBus) {
      try {
        const agentType = toolInput?.subagent_type || 'general-purpose';
        const taskId = extractTaskIdFromPrompt(toolInput?.prompt) || 'unknown';
        const agentId = `${agentType}-${Date.now()}`;

        eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId,
          agentType,
          taskId,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[routing-guard] AGENT_STARTED event emission failed:', err.message);
      }
    }

    const result = runAllChecks(toolName, toolInput, hookInput);
    const sessionId = process.env.CLAUDE_SESSION_ID || hookInput.session_id || null;

    if (Array.isArray(result.warnings) && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        logRouterChurnEvent({
          sessionId,
          toolName,
          checkName: warning.checkName,
          result: 'warn',
          durationMs: Date.now() - startTime,
          dedupeCount: warning.dedupeCount,
          messageLength: warning.message ? warning.message.length : 0,
        });
      }
    }

    if (!result.pass) {
      logRouterChurnEvent({
        sessionId,
        toolName,
        checkName: result.checkName || 'unknown',
        result: result.result || 'block',
        durationMs: Date.now() - startTime,
        dedupeCount: extractDedupeCount(result.message),
        messageLength: result.message ? result.message.length : 0,
      });
      if (eventBus) {
        try {
          if (result.result === 'block') {
            await eventBus.emit(EventTypes.TOOL_BLOCKED, {
              type: EventTypes.TOOL_BLOCKED,
              timestamp: new Date().toISOString(),
              toolName,
              duration: Date.now() - startTime,
              reason: result.message,
            });
          } else {
            await eventBus.emit(EventTypes.TOOL_COMPLETED, {
              type: EventTypes.TOOL_COMPLETED,
              timestamp: new Date().toISOString(),
              toolName,
              duration: Date.now() - startTime,
              output: {
                status: result.result,
                reason: result.message,
              },
            });
          }
        } catch (_err) {
          // Best-effort
        }
      }

      auditLog('routing-guard', `security_${result.result}`, {
        tool: toolName,
        reason: result.message,
        mode: routerState.getState().mode,
      });

      console.log(formatResult(result.result, result.message));
      logRuntimeHealth({
        component: 'routing-guard',
        status: result.result === 'block' ? 'blocked' : 'warn',
        durationMs: Date.now() - startTime,
        sessionId,
        extra: {
          tool: toolName,
          check: result.checkName || 'unknown',
        },
      });
      try {
        const _inputHash = JSON.stringify(toolInput || {}).slice(0, 64);
        result.result === 'block' &&
          _emitBlockVerdict &&
          _emitBlockVerdict({
            hook: 'routing-guard.cjs',
            tool: toolName || 'unknown',
            filePath: _inputHash,
            reason: result.message || '',
          });
      } catch (_) {
        /* best-effort */
      }
      process.exit(resolveExitCode(result));
    }

    logRouterChurnEvent({
      sessionId,
      toolName,
      checkName: 'all-checks',
      result: 'allow',
      durationMs: Date.now() - startTime,
      dedupeCount: null,
      messageLength: 0,
    });
    if (eventBus) {
      try {
        await eventBus.emit(EventTypes.TOOL_COMPLETED, {
          type: EventTypes.TOOL_COMPLETED,
          timestamp: new Date().toISOString(),
          toolName,
          duration: Date.now() - startTime,
          output: {
            status: 'ok',
          },
        });
      } catch (_err) {
        // Best-effort
      }
    }
    logRuntimeHealth({
      component: 'routing-guard',
      status: 'ok',
      durationMs: Date.now() - startTime,
      sessionId,
      extra: { tool: toolName },
    });
    process.exit(0);
  } catch (err) {
    if (eventBus) {
      try {
        await eventBus.emit(EventTypes.TOOL_FAILED, {
          type: EventTypes.TOOL_FAILED,
          timestamp: new Date().toISOString(),
          toolName: 'routing-guard',
          error: err.message,
        });
      } catch (_err) {
        // Best-effort
      }
    }
    if (isFailOpenOverrideAuthorized()) {
      auditLog('routing-guard', 'fail_open_override', { error: err.message });
      logRuntimeHealth({
        component: 'routing-guard',
        status: 'error_fail_open',
        durationMs: Date.now() - startTime,
        sessionId: process.env.CLAUDE_SESSION_ID || null,
        extra: { error: err.message },
      });
      process.exit(0);
    }

    if (String(process.env.HOOK_FAIL_OPEN || '').toLowerCase() === 'true') {
      auditLog('routing-guard', 'fail_open_override_denied', {
        error: err.message,
        reason: 'HOOK_FAIL_OPEN set without required acknowledgment/scope',
      });
    }

    auditLog('routing-guard', 'error_fail_closed', { error: err.message });
    logRuntimeHealth({
      component: 'routing-guard',
      status: 'error_fail_closed',
      durationMs: Date.now() - startTime,
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      extra: { error: err.message },
    });

    try {
      if (_emitBlockVerdict)
        _emitBlockVerdict({
          hook: 'routing-guard.cjs',
          tool: 'unknown',
          filePath: '',
          reason: `error_fail_closed: ${err.message}`,
        });
    } catch (_) {
      /* best-effort */
    }
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  runAllChecks,
  checkRouterBash,
  checkRouterSelfCheck,
  checkRouterReadGovernance,
  checkPlannerFirst,
  checkTaskPayloadContract,
  checkTaskCreate,
  checkSecurityReview,
  checkCodeSimplifierArchitectReview,
  checkHighRiskSpecialistArchitectReview,
  checkRouterWrite,
  checkMemoryPressure,
  checkSpecialistOverride,
  checkTaskListFirstGate,
  checkCreatorIntentGuard,
  checkIntentAgentMatch,
  checkConfigModelValidator,
  detectIntent,
  agentMatchesIntent,
  extractAgentTypeFromPrompt,
  extractModelFromToolInput,
  isPlannerSpawn,
  isSecuritySpawn,
  isArchitectSpawn,
  isCodeSimplifierSpawn,
  isHighRiskSpecialistSpawn,
  extractSpawnAgentType,
  isImplementationAgentSpawn,
  isAlwaysAllowedWrite,
  isRouterInvocation,
  isWhitelistedBashCommand,
  extractTaskIdFromPrompt,
  shouldDelegateTaskChecksToPreTaskUnified,
  applyStaleDetection,
  getCachedRouterState,
  invalidateCachedState,
  resetBlockDedupeState,
  isFailOpenOverrideAuthorized,
  getMemoryMonitor,
  ALL_WATCHED_TOOLS,
  BLACKLISTED_TOOLS,
  WHITELISTED_TOOLS,
  WRITE_TOOLS,
  IMPLEMENTATION_AGENTS,
  ROUTER_BASH_WHITELIST,
  SPECIALIST_KEYWORD_MAP,
  INTENT_PATTERNS,
};
