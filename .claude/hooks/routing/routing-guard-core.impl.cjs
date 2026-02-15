#!/usr/bin/env node
'use strict';

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
} = require('./routing-guard-core.shared.cjs');
const {
  checkRouterBash,
  checkRouterSelfCheck,
  checkRouterWrite,
  checkMemoryPressure,
} = require('./routing-guard-core.checks-router.cjs');
const {
  checkPlannerFirst,
  checkTaskCreate,
  checkSecurityReview,
  checkSpecialistOverride,
  checkTaskListFirstGate,
  checkCreatorIntentGuard,
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
      if (plannerCheck.markPlanner) {
        routerState.markPlannerSpawned();
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
      if (securityCheck.markSecurity) {
        routerState.markSecuritySpawned();
      }
      captureWarn('security-review-guard', securityCheck);
    }

    const writeCheck = checkRouterWrite(toolName, toolInput);
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

    const intentCheck = checkIntentAgentMatch(toolName, toolInput);
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

async function main() {
  const startTime = Date.now();
  try {
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
      process.exit(result.result === 'block' ? 2 : 0);
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
    if (process.env.HOOK_FAIL_OPEN === 'true') {
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

    auditLog('routing-guard', 'error_fail_closed', { error: err.message });
    logRuntimeHealth({
      component: 'routing-guard',
      status: 'error_fail_closed',
      durationMs: Date.now() - startTime,
      sessionId: process.env.CLAUDE_SESSION_ID || null,
      extra: { error: err.message },
    });

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
  checkPlannerFirst,
  checkTaskCreate,
  checkSecurityReview,
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
  isImplementationAgentSpawn,
  isAlwaysAllowedWrite,
  isRouterInvocation,
  isWhitelistedBashCommand,
  extractTaskIdFromPrompt,
  shouldDelegateTaskChecksToPreTaskUnified,
  applyStaleDetection,
  getCachedRouterState,
  invalidateCachedState,
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
