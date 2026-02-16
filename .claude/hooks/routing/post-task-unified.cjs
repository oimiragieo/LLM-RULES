#!/usr/bin/env node
/**
 * Unified PostToolUse(Task|TaskList|TaskOutput) Hook
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getToolOutput,
  formatResult,
} = require('../../lib/utils/hook-input.cjs');
const { getCachedState } = require('../../lib/utils/state-cache.cjs');
const routerState = require('../../lib/routing/router-state.cjs');
const loopStateManager = require('../../lib/self-healing/loop-state-manager.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');
const { logSpawnEnd } = require('../../lib/monitoring/spawn-log.cjs');
const { createPostTaskUnifiedHelpers } = require('./post-task-unified.helpers.cjs');

// Resolve project root deterministically from this file location:
// <project>/.claude/hooks/routing/post-task-unified.cjs -> <project>
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

let memoryManager = null;
function getMemoryManager() {
  if (memoryManager === null) {
    try {
      memoryManager = require('../../lib/memory/memory-manager.cjs');
    } catch (_err) {
      memoryManager = false;
    }
  }
  return memoryManager || null;
}

let findingsRegistry = null;
function getFindingsRegistry() {
  if (findingsRegistry === null) {
    try {
      findingsRegistry = require('../../lib/memory/findings-registry.cjs');
    } catch (_err) {
      findingsRegistry = false;
    }
  }
  return findingsRegistry || null;
}

const lifecycleState = require('../../lib/routing/task-lifecycle-state.cjs');

const LEARNINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'memory', 'learnings.md');
const EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');
const AUDIT_LOG_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-audit.log');
const TASKUPDATE_RECOVERY_QUEUE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'taskupdate-recovery-queue.jsonl'
);

const helpers = createPostTaskUnifiedHelpers({
  fs,
  path,
  getCachedState,
  routerState,
  getMemoryManager,
  getFindingsRegistry,
  PROJECT_ROOT,
  LEARNINGS_PATH,
  EVOLUTION_STATE_PATH,
  AUDIT_LOG_PATH,
  TASKUPDATE_RECOVERY_QUEUE_PATH,
});

const {
  WORKFLOW_COMPLETE_MARKERS,
  LEARNING_PATTERNS,
  COMPLETION_INDICATORS,
  extractTaskDescription,
  isPlannerSpawn,
  isSecuritySpawn,
  runAgentContextTracker,
  isWorkflowComplete,
  extractLearnings,
  appendLearnings,
  runWorkflowLearningExtraction,
  extractPatterns,
  extractGotchas,
  extractDiscoveries,
  runSessionMemoryExtraction,
  detectsCompletion,
  hasMatchingCompletedTaskUpdate,
  extractExpectedArtifactPaths,
  getMissingArtifacts,
  ingestExpectedReportFindings,
  resolveFindingsFromTaskCompletion,
  recordFindingsTrendSnapshot,
  synthesizeRecoveryTaskUpdate,
  runTaskCompletionGuard,
  runTaskListTracking,
  getEvolutionState,
  isEvolutionCompletion,
  getLatestEvolution,
  formatAuditEntry,
  appendToAuditLog,
  runEvolutionAudit,
} = helpers;

// eslint-disable-next-line complexity
async function main() {
  const startTime = Date.now();
  try {
    const hookInput = await parseHookInputAsync();
    if (!hookInput) {
      process.exit(0);
      return;
    }

    const toolName = getToolName(hookInput);
    if (
      toolName !== 'Task' &&
      toolName !== 'TaskList' &&
      toolName !== 'TaskOutput' &&
      toolName !== 'TaskUpdate'
    ) {
      process.exit(0);
      return;
    }

    if (toolName === 'TaskUpdate') {
      const toolInput = getToolInput(hookInput) || {};
      const status = toolInput.status || toolInput.state || null;
      const taskId = toolInput.taskId || toolInput.task_id || toolInput.id || null;

      if (taskId && status) {
        try {
          routerState.recordTaskUpdate(String(taskId), String(status));
          await lifecycleState.writeTaskStatus(String(taskId), String(status));

          await eventBus.emit(EventTypes.TASK_UPDATED, {
            type: EventTypes.TASK_UPDATED,
            timestamp: new Date().toISOString(),
            taskId: String(taskId),
            status: String(status),
            metadata: toolInput.metadata || {},
          });
        } catch (_err) {
          // Best-effort
        }
      }
      process.exit(0);
      return;
    }

    if (toolName === 'TaskList') {
      runTaskListTracking();
      try {
        await eventBus.emit(EventTypes.TOOL_COMPLETED, {
          type: EventTypes.TOOL_COMPLETED,
          timestamp: new Date().toISOString(),
          toolName: 'TaskList',
          duration: Date.now() - startTime,
          output: { status: 'ok' },
        });
      } catch (_err) {
        // Best-effort
      }
      process.exit(0);
      return;
    }

    if (toolName === 'TaskOutput') {
      const toolInput = getToolInput(hookInput) || {};
      const taskOutput = getToolOutput(hookInput);
      const status = inferTaskOutputStatus(taskOutput);
      const taskId = toolInput?.task_id || toolInput?.taskId || toolInput?.id || null;

      if (taskId && status === 'completed') {
        const hadMatchingCompleted = hasMatchingCompletedTaskUpdate(taskId);
        try {
          routerState.recordTaskUpdate(String(taskId), 'completed');
          await lifecycleState.writeTaskStatus(String(taskId), 'completed');
        } catch (_trackErr) {
          // Best-effort status reconciliation only.
        }

        if (!hadMatchingCompleted) {
          synthesizeRecoveryTaskUpdate(
            String(taskId),
            'taskoutput_completed_without_taskupdate',
            'Agent must call TaskUpdate({ taskId, status: "completed" }) before relying on TaskOutput.',
            {
              source: 'TaskOutput',
              inferredStatus: 'completed',
            }
          );
        }
      } else if (taskId && status === null) {
        if (process.env.DEBUG_HOOKS === 'true') {
          console.warn(
            `[post-task-unified] Warning: Could not infer status from TaskOutput for task ${taskId}`
          );
        }
      }

      process.exit(0);
      return;
    }

    const toolInput = getToolInput(hookInput);
    const toolOutput = getToolOutput(hookInput) || '';
    const toolOutputStr = typeof toolOutput === 'string' ? toolOutput : '';
    let effectiveTaskId = toolInput?.task_id || toolInput?.id || null;

    try {
      let taskId = toolInput?.task_id || toolInput?.id || null;
      if (!taskId) {
        const { getCurrentSpawnTaskId } = require('../../lib/routing/router-state.cjs');
        taskId = getCurrentSpawnTaskId();
      }

      const sessionId = hookInput.session_id || hookInput.sessionId || null;
      let success = true;
      let errorSnippet = null;
      if (toolOutput && typeof toolOutput === 'object' && toolOutput.error) {
        success = false;
        errorSnippet = toolOutput.error.message || String(toolOutput.error);
      }
      logSpawnEnd({ taskId, success, errorSnippet, sessionId });
      effectiveTaskId = taskId || effectiveTaskId;

      if (effectiveTaskId) {
        try {
          routerState.recordTaskUpdate(String(effectiveTaskId), 'in_progress');
          await lifecycleState.writeTaskStatus(String(effectiveTaskId), 'in_progress');
        } catch (_trackErr) {
          // Best-effort tracking only.
        }
      }

      /*
      try {
        const { clearCurrentSpawnTaskId } = require('../../lib/routing/router-state.cjs');
        clearCurrentSpawnTaskId();
      } catch (_clearErr) {
        // Best-effort cleanup.
      }
      */
    } catch (_err) {
      // Best-effort
    }

    runAgentContextTracker(toolInput);
    runWorkflowLearningExtraction(toolOutputStr, toolInput);
    runSessionMemoryExtraction(toolOutputStr);

    const completionGuardResult = runTaskCompletionGuard(toolOutputStr, effectiveTaskId, toolInput);
    if (!completionGuardResult.pass) {
      console.log(formatResult(completionGuardResult.result, completionGuardResult.message));
      process.exit(2);
      return;
    }

    runEvolutionAudit();

    try {
      loopStateManager.decrementSpawnDepth();
    } catch (_err) {
      // Monitoring-only; never block.
    }

    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'Task',
        duration: Date.now() - startTime,
        output: { status: 'ok' },
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
        toolName: 'post-task-unified',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }
    if (process.env.DEBUG_HOOKS) {
      console.error('[post-task-unified] Error:', err.message);
    }
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

function inferTaskOutputStatus(taskOutput) {
  const normalize = value => {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    return normalized;
  };

  if (taskOutput && typeof taskOutput === 'object') {
    const candidates = [
      taskOutput.status,
      taskOutput.task_status,
      taskOutput.state,
      taskOutput.task?.status,
      taskOutput.result?.status,
      taskOutput.metadata?.status,
    ];
    for (const candidate of candidates) {
      const normalized = normalize(candidate);
      if (normalized) return normalized;
    }
    return null;
  }

  if (typeof taskOutput === 'string') {
    const match = taskOutput.match(/"status"\s*:\s*"([^"]+)"/i);
    if (match && match[1]) {
      return normalize(match[1]);
    }
  }

  return null;
}

module.exports = {
  main,
  PROJECT_ROOT,
  extractTaskDescription,
  isPlannerSpawn,
  isSecuritySpawn,
  isWorkflowComplete,
  extractLearnings,
  appendLearnings,
  WORKFLOW_COMPLETE_MARKERS,
  LEARNING_PATTERNS,
  extractPatterns,
  extractGotchas,
  extractDiscoveries,
  detectsCompletion,
  hasMatchingCompletedTaskUpdate,
  extractExpectedArtifactPaths,
  getMissingArtifacts,
  ingestExpectedReportFindings,
  resolveFindingsFromTaskCompletion,
  recordFindingsTrendSnapshot,
  synthesizeRecoveryTaskUpdate,
  runTaskCompletionGuard,
  COMPLETION_INDICATORS,
  TASKUPDATE_RECOVERY_QUEUE_PATH,
  isEvolutionCompletion,
  getLatestEvolution,
  formatAuditEntry,
  appendToAuditLog,
  getEvolutionState,
  EVOLUTION_STATE_PATH,
  AUDIT_LOG_PATH,
  inferTaskOutputStatus,
};
