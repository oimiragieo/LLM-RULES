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
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
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
const TASKUPDATE_RECOVERY_QUEUE_PATH =
  process.env.TASKUPDATE_RECOVERY_QUEUE_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'taskupdate-recovery-queue.jsonl');
const TASK_OUTPUT_CONTRACTS_PATH =
  process.env.TASK_OUTPUT_CONTRACTS_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'task-output-contracts.json');
const TASK_ARTIFACT_AUDIT_PATH =
  process.env.TASK_ARTIFACT_AUDIT_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'task-artifact-audit.jsonl');

/** Best-effort intent feedback recording (extracted to reduce nesting depth) */
function _recordIntentSuccess(routerState) {
  try {
    const lastIntent = routerState.getLastClassifiedIntent
      ? routerState.getLastClassifiedIntent()
      : null;
    if (!lastIntent) return;
    const { recordIntentFeedback } = require(
      path.join(PROJECT_ROOT, '.claude', 'lib', 'routing', 'intent-classifier.cjs')
    );
    recordIntentFeedback(lastIntent, true);
  } catch (_e) {
    // Best-effort — never block task completion
  }
}

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

function readTaskOutputContract(taskId) {
  try {
    if (!taskId || !fs.existsSync(TASK_OUTPUT_CONTRACTS_PATH)) return null;
    const raw = fs.readFileSync(TASK_OUTPUT_CONTRACTS_PATH, 'utf8');
    const parsed = safeParseJSON(raw, null);
    const tasks = parsed && typeof parsed === 'object' ? parsed.tasks : null;
    if (!tasks || typeof tasks !== 'object') return null;
    return tasks[String(taskId)] || null;
  } catch (_err) {
    return null;
  }
}

function appendTaskArtifactAudit(entry) {
  try {
    fs.mkdirSync(path.dirname(TASK_ARTIFACT_AUDIT_PATH), { recursive: true });
    fs.appendFileSync(TASK_ARTIFACT_AUDIT_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_err) {
    // Best-effort audit logging only.
  }
}

function resolveOutputPath(outputPath) {
  const normalized = String(outputPath || '').trim();
  if (!normalized) return null;
  if (path.isAbsolute(normalized)) return normalized;
  return path.resolve(PROJECT_ROOT, normalized);
}

function isReadSafetyPlaceholderPath(targetPath) {
  const basename = path.basename(String(targetPath || '')).toLowerCase();
  return basename.startsWith('read-safety-blocked-read');
}

function hasPlaceholderMarker(content) {
  const text = String(content || '');
  return (
    text.includes('# Missing Report Placeholder') ||
    text.includes('# Read Safety Blocked Target') ||
    text.includes('NON-DELIVERABLE')
  );
}

function validateRequiredOutputs(requiredOutputs) {
  const missing = [];
  const invalid = [];
  for (const output of requiredOutputs || []) {
    const resolved = resolveOutputPath(output);
    if (!resolved || !fs.existsSync(resolved)) {
      missing.push(output);
      continue;
    }
    if (isReadSafetyPlaceholderPath(resolved)) {
      invalid.push(output);
      continue;
    }
    try {
      const content = fs.readFileSync(resolved, 'utf8');
      if (hasPlaceholderMarker(content)) invalid.push(output);
    } catch (_err) {
      invalid.push(output);
    }
  }
  return { passed: missing.length === 0 && invalid.length === 0, missing, invalid };
}

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

function performWorktreeCleanupIfCompleted(status) {
  if (String(status).toLowerCase() !== 'completed') return;
  try {
    const { isUnderWorktreesDir, gitRun } = require('../../lib/worktree/worktree-utils.cjs');
    if (isUnderWorktreesDir(process.cwd())) {
      if (process.env.DEBUG_HOOKS === 'true') {
        console.error(
          `[post-task-unified] Worktree context detected. Purging untracked files before deletion...`
        );
      }
      gitRun(['clean', '-fdx'], process.cwd());
    }
  } catch (err) {
    if (process.env.DEBUG_HOOKS === 'true') {
      console.error(`[post-task-unified] Worktree cleanup failed: ${err.message}`);
    }
  }
}

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
          performWorktreeCleanupIfCompleted(String(status));

          const outputContract = readTaskOutputContract(taskId);
          appendTaskArtifactAudit({
            timestamp: new Date().toISOString(),
            taskId: String(taskId),
            status: String(status),
            hasOutputContract: Boolean(outputContract),
            requiredOutputCount: Array.isArray(outputContract?.requiredOutputs)
              ? outputContract.requiredOutputs.length
              : 0,
            source: 'TaskUpdate',
          });

          await Promise.race([
            eventBus.emit(EventTypes.TASK_UPDATED, {
              type: EventTypes.TASK_UPDATED,
              timestamp: new Date().toISOString(),
              taskId: String(taskId),
              status: String(status),
              metadata: toolInput.metadata || {},
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Event emission timeout')), 5000)
            ),
          ]);
        } catch (err) {
          // Non-critical error - log to stderr but don't block
          console.error(`[post-task-unified:TaskUpdate] Event emission error: ${err.message}`);
        }
      }
      process.exit(0);
      return;
    }

    if (toolName === 'TaskList') {
      runTaskListTracking();
      try {
        await Promise.race([
          eventBus.emit(EventTypes.TOOL_COMPLETED, {
            type: EventTypes.TOOL_COMPLETED,
            timestamp: new Date().toISOString(),
            toolName: 'TaskList',
            duration: Date.now() - startTime,
            output: { status: 'ok' },
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Event emission timeout')), 5000)
          ),
        ]);
      } catch (err) {
        // Non-critical error - log to stderr but don't block
        console.error(`[post-task-unified:TaskList] Event emission error: ${err.message}`);
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
        const outputContract = readTaskOutputContract(taskId);
        const requiredOutputs = Array.isArray(outputContract?.requiredOutputs)
          ? outputContract.requiredOutputs
          : [];
        const outputValidation = validateRequiredOutputs(requiredOutputs);
        const canAdvanceCompletion = !requiredOutputs.length || outputValidation.passed;
        const hadMatchingCompleted = hasMatchingCompletedTaskUpdate(taskId);
        if (canAdvanceCompletion) {
          try {
            routerState.recordTaskUpdate(String(taskId), 'completed');
            await lifecycleState.writeTaskStatus(String(taskId), 'completed');
            performWorktreeCleanupIfCompleted('completed');
            // Intent feedback loop (best-effort, extracted to reduce nesting)
            _recordIntentSuccess(routerState);
          } catch (_trackErr) {
            // Best-effort status reconciliation only.
          }
        } else {
          appendTaskArtifactAudit({
            timestamp: new Date().toISOString(),
            taskId: String(taskId),
            status: 'taskoutput_completed_blocked_missing_artifacts',
            hasOutputContract: true,
            requiredOutputCount: requiredOutputs.length,
            missingOutputs: outputValidation.missing,
            invalidOutputs: outputValidation.invalid,
            source: 'TaskOutput',
          });
        }

        if (!hadMatchingCompleted) {
          synthesizeRecoveryTaskUpdate(
            String(taskId),
            canAdvanceCompletion
              ? 'taskoutput_completed_without_taskupdate'
              : 'taskoutput_completed_missing_required_outputs',
            canAdvanceCompletion
              ? 'Agent must call TaskUpdate({ taskId, status: "completed" }) before relying on TaskOutput.'
              : 'TaskOutput reported completed, but required outputs are missing/invalid. Agent must produce required artifacts and call TaskUpdate(completed).',
            {
              source: 'TaskOutput',
              inferredStatus: 'completed',
              missingOutputs: outputValidation.missing,
              invalidOutputs: outputValidation.invalid,
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
      process.exit(0);
      return;
    }

    runEvolutionAudit();

    try {
      loopStateManager.decrementSpawnDepth();
    } catch (_err) {
      // Monitoring-only; never block.
    }

    try {
      await Promise.race([
        eventBus.emit(EventTypes.TOOL_COMPLETED, {
          type: EventTypes.TOOL_COMPLETED,
          timestamp: new Date().toISOString(),
          toolName: 'Task',
          duration: Date.now() - startTime,
          output: { status: 'ok' },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Event emission timeout')), 5000)
        ),
      ]);
    } catch (err) {
      // Non-critical error - log to stderr but don't block
      console.error(`[post-task-unified:Task] Event emission error: ${err.message}`);
    }

    // --- Token Saver Chat Update ---
    try {
      const { execFileSync } = require('child_process');
      const statsCmd = path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'token-saver-stats.cjs');
      if (fs.existsSync(statsCmd)) {
        const stats = execFileSync('node', [statsCmd], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          windowsHide: true,
        });
        if (stats && stats.trim() && !stats.includes('No telemetry data found yet')) {
          console.error('\n' + stats);
        }
      }
    } catch (_statErr) {
      // Non-blocking telemetry
    }

    process.exit(0);
  } catch (err) {
    // Log ALL errors to stderr with context
    console.error(`[post-task-unified] Hook error: ${err.message}`);
    if (err.stack) {
      console.error(`[post-task-unified] Stack: ${err.stack}`);
    }

    try {
      await Promise.race([
        eventBus.emit(EventTypes.TOOL_FAILED, {
          type: EventTypes.TOOL_FAILED,
          timestamp: new Date().toISOString(),
          toolName: 'post-task-unified',
          error: err.message,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Event emission timeout')), 5000)
        ),
      ]);
    } catch (emitErr) {
      // Non-critical error - log to stderr but don't block
      console.error(`[post-task-unified] Event emission error: ${emitErr.message}`);
    }

    // Exit 0 for non-critical errors (don't block tool pipeline)
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
