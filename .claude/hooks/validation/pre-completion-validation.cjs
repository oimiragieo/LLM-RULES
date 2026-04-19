#!/usr/bin/env node
/**
 * pre-completion-validation.cjs
 *
 * PreToolUse hook that validates artifact integration and task status transitions
 * before allowing TaskUpdate.
 *
 * Trigger: PreToolUse on TaskUpdate
 *
 * ENVIRONMENT VARIABLES:
 * - TASK_STATUS_ENFORCEMENT: 'block' (default) | 'warn' | 'off'
 * - PRE_COMPLETION_SUMMARY_ENFORCEMENT: 'block' (default) | 'warn' | 'off' — legacy summary gate
 * - SUMMARY_REQUIRED_ENFORCEMENT: 'block' (default) | 'warn' | 'off' — blocks fallback strings and short summaries (<50 chars)
 * - REFLECTION_SCORE_ENFORCEMENT: 'warn' (default) | 'block' | 'off'
 * - TASK_OUTPUT_ENFORCEMENT: 'block' (default) | 'warn' | 'off'
 */

'use strict';

// SE-03 safety: hooks must exit 0 (allow) or 2 (block). Exit 1 is treated as
// error by the Claude Code tool pipeline and is never a valid outcome here.
// On any uncaught error we fail-open (exit 0) and log to stderr so the
// pipeline is not blocked by a crashing hook.
process.on('uncaughtException', e => {
  try {
    process.stderr.write(
      `[pre-completion-validation] uncaughtException: ${(e && e.message) || e}\n`
    );
  } catch (_) {
    void _;
  }
  process.exit(0);
});
process.on('unhandledRejection', e => {
  try {
    process.stderr.write(
      `[pre-completion-validation] unhandledRejection: ${(e && e.message) || e}\n`
    );
  } catch (_) {
    void _;
  }
  process.exit(0);
});

let fs;
let path;
let spawnSync;
let PROJECT_ROOT;
let getEnforcementMode;
let auditLog;
let parseHookInputAsync;
let getToolName;
let getToolInput;
let formatHookResult;
let parseAndValidateTaskUpdate;
let VALID_TASK_STATUSES;
let lifecycleState;
let shouldBypassPreCompletionValidation;
let enforceSummaryRequirements;
let isValidSummary;
let isFallbackSummary;
let readActiveCreatorSkills;
let isEcosystemCreatorAction;
let validateCreatorEcosystem;
let resolveRequiredOutputsForTask;
let validateRequiredOutputs;
let enforceRequiredOutputs;
let enforceDrainGate;

try {
  fs = require('fs');
  path = require('path');
  ({ spawnSync } = require('child_process'));

  // Use shared utility for project root
  ({ PROJECT_ROOT } = require('../../lib/utils/project-root.cjs'));
  ({
    getEnforcementMode,
    auditLog,
    parseHookInputAsync,
    getToolName,
    getToolInput,
    formatResult: formatHookResult,
  } = require('../../lib/utils/hook-input.cjs'));
  ({
    parseAndValidateTaskUpdate,
    VALID_TASK_STATUSES,
  } = require('../../lib/routing/task-update-contract.cjs'));
  lifecycleState = require('../../lib/routing/task-lifecycle-state.cjs');
  ({ shouldBypassPreCompletionValidation } = require('./pre-completion-validation.guards.cjs'));
  ({
    enforceSummaryRequirements,
    isValidSummary,
    isFallbackSummary,
  } = require('./pre-completion-validation.summary.cjs'));
  ({
    readActiveCreatorSkills,
    isEcosystemCreatorAction,
    validateCreatorEcosystem,
    resolveRequiredOutputsForTask,
    validateRequiredOutputs,
    enforceRequiredOutputs,
  } = require('./pre-completion-validation.task-output.cjs'));
  ({ enforceDrainGate } = require('./pre-completion-validation.drain-gate.cjs'));
} catch (e) {
  try {
    process.stderr.write(
      `[pre-completion-validation] require() failed: ${(e && e.message) || e}\n`
    );
  } catch (_) {
    void _;
  }
  process.exit(0);
}

// Paths
const VALIDATION_SCRIPT = path.join(
  PROJECT_ROOT,
  '.claude',
  'tools',
  'cli',
  'validate-integration.cjs'
);

/**
 * Read current task status from file
 * @param {string} taskId - Task ID to look up
 * @returns {string} Current status ('pending' if not found)
 */
function readTaskStatus(taskId) {
  return lifecycleState.readTaskStatus(taskId);
}

/**
 * Check if transition is valid
 */
function isValidTransition(currentStatus, newStatus) {
  return lifecycleState.isValidTransition(currentStatus, newStatus);
}

/**
 * Get transition error message
 */
function getTransitionError(taskId, currentStatus, newStatus) {
  return lifecycleState.getTransitionError(taskId, currentStatus, newStatus);
}

/**
 * Extract task metadata from TaskUpdate parameters.
 */
function extractTaskMetadata(params) {
  try {
    const metadata = params.metadata || {};
    return {
      filesModified: metadata.filesModified || [],
      summary: metadata.summary || '',
      taskId: params.taskId || params.task_id || params.id,
    };
  } catch (_err) {
    return { filesModified: [], summary: '', taskId: null };
  }
}

/**
 * Detect if any modified files are artifacts.
 */
function detectArtifacts(filesModified) {
  const artifacts = [];
  if (!Array.isArray(filesModified)) return artifacts;

  for (const filePath of filesModified) {
    const normalizedPath = filePath.replace(/\\/g, '/');

    if (
      normalizedPath.includes('/.claude/agents/') ||
      normalizedPath.includes('/.claude/skills/') ||
      normalizedPath.includes('/.claude/workflows/') ||
      normalizedPath.includes('/.claude/hooks/')
    ) {
      const type = normalizedPath.includes('/agents/')
        ? 'agent'
        : normalizedPath.includes('/skills/')
          ? 'skill'
          : normalizedPath.includes('/workflows/')
            ? 'workflow'
            : 'hook';

      artifacts.push({ path: filePath, type });
    }
  }
  return artifacts;
}

/**
 * Run validation script on artifact.
 */
function validateArtifact(artifactPath) {
  try {
    const result = spawnSync(process.execPath, [VALIDATION_SCRIPT, artifactPath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      windowsHide: true,
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'Validation failed');
    }

    return { passed: true, issues: [] };
  } catch (err) {
    const output = err.stdout || err.stderr || '';
    const issues = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('✗') || line.includes('FAIL')) {
        issues.push(line.trim());
      }
    }
    return {
      passed: false,
      issues: issues.length > 0 ? issues : ['Integration validation failed'],
    };
  }
}

/**
 * Enforce reflection score integrity — block/warn when a numeric score is emitted
 * without a dataQuality field that verifies it was not fabricated.
 * @param {object} toolParams - Raw TaskUpdate parameters
 */
function enforceReflectionScore(toolParams) {
  const isReflectionCompletion =
    (toolParams.metadata &&
      Array.isArray(toolParams.metadata.processedReflectionIds) &&
      toolParams.metadata.processedReflectionIds.length > 0) ||
    (toolParams.metadata && typeof toolParams.metadata.score === 'number');

  if (!isReflectionCompletion) return;

  const hasScore = toolParams.metadata && typeof toolParams.metadata.score === 'number';
  const hasDataQuality = toolParams.metadata && toolParams.metadata.dataQuality !== undefined;

  if (hasScore && !hasDataQuality) {
    const reflectionMode = getEnforcementMode('REFLECTION_SCORE_ENFORCEMENT', 'warn');
    const reflectionMsg =
      '[pre-completion-validation] Reflection score emitted without dataQuality field — cannot verify score was not fabricated. Add metadata.dataQuality: "full"|"partial"|"insufficient"';
    if (reflectionMode === 'block') {
      console.log(formatHookResult('block', reflectionMsg));
      process.exit(2);
    } else if (reflectionMode !== 'off') {
      process.stderr.write(reflectionMsg + '\n');
    }
  }
}

/**
 * Main hook execution.
 */
// eslint-disable-next-line complexity -- pre-existing; refactoring tracked separately
async function main() {
  try {
    const input = await parseHookInputAsync({ timeout: 300 });
    if (!input) process.exit(0);

    const toolName = getToolName(input);
    const toolParams = getToolInput(input);

    if (toolName !== 'TaskUpdate') process.exit(0);

    const bypassDecision = shouldBypassPreCompletionValidation({
      input,
      toolName,
      toolInput: toolParams,
    });
    if (bypassDecision.reason === 'in_progress') process.exit(0);

    const parsedParams = parseAndValidateTaskUpdate(toolParams, {
      allowedStatuses: VALID_TASK_STATUSES,
      requireTaskId: false,
      requireStatus: false,
    });

    const taskStatusMode = getEnforcementMode('TASK_STATUS_ENFORCEMENT', 'block');

    if (taskStatusMode !== 'off') {
      const taskId = parsedParams.normalized.taskId;
      const newStatus = parsedParams.normalized.status;

      if (taskId && newStatus) {
        if (!VALID_TASK_STATUSES.includes(newStatus)) {
          const msg = `Invalid status: "${newStatus}". Valid: ${VALID_TASK_STATUSES.join(', ')}`;
          if (taskStatusMode === 'block') {
            console.log(formatHookResult('block', msg));
            process.exit(2);
          } else {
            console.warn(`[WARN] ${msg}`);
          }
        } else {
          const currentStatus = readTaskStatus(taskId);
          const isValid = isValidTransition(currentStatus, newStatus);

          if (currentStatus === newStatus) {
            // Idempotent self-transition
          } else if (!isValid) {
            const msg = getTransitionError(taskId, currentStatus, newStatus);
            if (taskStatusMode === 'block') {
              console.log(formatHookResult('block', msg));
              process.exit(2);
            } else {
              console.warn(`[WARN] ${msg}`);
            }
          } else {
            // Valid transition - allow but don't write yet.
            // PostToolUse (post-task-unified.cjs) will persist the new status.
            auditLog('pre-completion-validation', 'allow', { taskId, currentStatus, newStatus });
          }
        }
      }
    }

    if (parsedParams.normalized.status !== 'completed') process.exit(0);

    const bypassAgentCompletionChecks = bypassDecision.reason === 'router_completed';

    if (!bypassAgentCompletionChecks) {
      enforceSummaryRequirements({ toolParams, getEnforcementMode, formatHookResult });

      // GIT_COMMIT_VERIFICATION: block devops/deploy completions when git status shows dirty state.
      // This catches the 50% devops commit failure rate caused by silent pre-commit hook blocks.
      const commitVerifyMode = getEnforcementMode('GIT_COMMIT_VERIFICATION', 'block');
      if (commitVerifyMode !== 'off') {
        const summary = (toolParams.metadata && toolParams.metadata.summary) || '';
        const summaryLower = summary.toLowerCase();
        const isCommitTask =
          summaryLower.includes('commit') ||
          summaryLower.includes('push') ||
          summaryLower.includes('deploy') ||
          summaryLower.includes('git');
        if (isCommitTask) {
          try {
            const gitResult = spawnSync('git', ['status', '--porcelain'], {
              cwd: PROJECT_ROOT,
              stdio: 'pipe',
              encoding: 'utf-8',
              shell: false,
              windowsHide: true,
              timeout: 5000,
            });
            const dirtyFiles = (gitResult.stdout || '')
              .split('\n')
              .filter(line => line.trim() && !line.startsWith('??'))
              .map(line => line.trim());
            if (dirtyFiles.length > 0) {
              const gitMsg = `GIT COMMIT VERIFICATION FAILED: TaskUpdate(completed) claims commit/push but ${dirtyFiles.length} file(s) have uncommitted changes:\n${dirtyFiles.slice(0, 5).join('\n')}${dirtyFiles.length > 5 ? `\n... and ${dirtyFiles.length - 5} more` : ''}\nFix: stage and commit remaining changes before marking task complete. Set GIT_COMMIT_VERIFICATION=off to disable.`;
              if (commitVerifyMode === 'block') {
                console.log(formatHookResult('block', gitMsg));
                process.exit(2);
              } else {
                process.stderr.write(`[pre-completion-validation] WARNING: ${gitMsg}\n`);
              }
            }
          } catch (_gitErr) {
            // Best effort — don't block on git check failure
          }
        }
      }

      // Shared heuristic: detect pipeline-level completions from summary text
      const completionSummary = (toolParams.metadata && toolParams.metadata.summary) || '';
      const completionSummaryLower = completionSummary.toLowerCase();
      const isPipelineCompletion =
        completionSummaryLower.includes('pipeline') ||
        completionSummaryLower.includes('phase') ||
        completionSummaryLower.includes('milestone') ||
        completionSummaryLower.includes('all tasks') ||
        completionSummaryLower.includes('wired') ||
        completionSummaryLower.includes('integration complete') ||
        completionSummaryLower.includes('pushed to main');

      // MILESTONE_SELF_REVIEW_ENFORCEMENT: require self-review trace entry before pipeline completion.
      // Agents must emit a hook-trace entry with checkedBy containing "self-review" before completing
      // pipeline-level tasks. This prevents the pattern of rushing to completion without reflection.
      const selfReviewMode = getEnforcementMode('MILESTONE_SELF_REVIEW_ENFORCEMENT', 'warn');
      if (selfReviewMode !== 'off' && isPipelineCompletion) {
        // Check for self-review trace in hook-trace.jsonl (last 50 lines)
        let hasSelfReview = false;
        try {
          const traceFile = path.join(PROJECT_ROOT, '.claude/context/runtime/hook-trace.jsonl');
          if (fs.existsSync(traceFile)) {
            const content = fs.readFileSync(traceFile, 'utf8');
            const lines = content.trim().split('\n').slice(-50);
            const { safeParseJSON: safeParse } = require('../../lib/utils/safe-json.cjs');
            hasSelfReview = lines.some(line => {
              const { success: ok, data: entry } = safeParse(line, null);
              if (!ok || !entry) return false;
              return entry.checkedBy && String(entry.checkedBy).includes('self-review');
            });
          }
        } catch (_e) {
          // Best effort
        }
        // Also accept metadata flag as alternative
        if (toolParams.metadata && toolParams.metadata.selfReviewCompleted) {
          hasSelfReview = true;
        }
        if (!hasSelfReview) {
          const selfReviewMsg =
            'MILESTONE SELF-REVIEW REQUIRED: Pipeline/phase completion detected but no self-review trace found. ' +
            'Before completing, ask "Can I improve this?" and either (a) emit a hook-trace entry with checkedBy:"self-review:milestone" ' +
            'or (b) include metadata.selfReviewCompleted:true. Set MILESTONE_SELF_REVIEW_ENFORCEMENT=off to disable.';
          if (selfReviewMode === 'block') {
            console.log(formatHookResult('block', selfReviewMsg));
            process.exit(2);
          } else {
            process.stderr.write(`[pre-completion-validation] WARNING: ${selfReviewMsg}\n`);
          }
        }
      }

      // CCUSAGE_REPORT_ENFORCEMENT: require token usage reporting on pipeline completions.
      // Ensures agents report cost/token data at milestone boundaries.
      const ccusageMode = getEnforcementMode('CCUSAGE_REPORT_ENFORCEMENT', 'warn');
      if (ccusageMode !== 'off' && isPipelineCompletion) {
        const hasTokenReport =
          (toolParams.metadata && toolParams.metadata.tokenUsage) ||
          (toolParams.metadata && toolParams.metadata.costUsd) ||
          completionSummaryLower.includes('token') ||
          completionSummaryLower.includes('cost') ||
          completionSummaryLower.includes('ccusage');
        if (!hasTokenReport) {
          const ccusageMsg =
            'CCUSAGE REPORT REQUIRED: Pipeline completion detected but no token/cost data found. ' +
            'Run ccusage and include token stats in metadata or summary. Set CCUSAGE_REPORT_ENFORCEMENT=off to disable.';
          if (ccusageMode === 'block') {
            console.log(formatHookResult('block', ccusageMsg));
            process.exit(2);
          } else {
            process.stderr.write(`[pre-completion-validation] WARNING: ${ccusageMsg}\n`);
          }
        }
      }

      enforceDrainGate({
        currentTaskId: parsedParams.normalized.taskId,
        isPipelineCompletion,
        getEnforcementMode,
        formatHookResult,
      });

      // PLANNER_TOKEN_ESTIMATION_ENFORCEMENT: verify planner tasks include token estimates.
      // Prevents agents from dying mid-task due to context overflow from underestimated workloads.
      const plannerEstMode = getEnforcementMode('PLANNER_TOKEN_ESTIMATION_ENFORCEMENT', 'warn');
      if (plannerEstMode !== 'off') {
        const isPlannerCompletion =
          completionSummaryLower.includes('plan') &&
          (completionSummaryLower.includes('created') ||
            completionSummaryLower.includes('generated') ||
            completionSummaryLower.includes('complete'));
        if (isPlannerCompletion) {
          const hasTokenEstimate =
            (toolParams.metadata && toolParams.metadata.estimatedTokens) ||
            (toolParams.metadata && toolParams.metadata.estimated_tokens) ||
            completionSummaryLower.includes('estimated') ||
            completionSummaryLower.includes('token budget');
          if (!hasTokenEstimate) {
            const plannerMsg =
              'PLANNER TOKEN ESTIMATION REQUIRED: Plan completion detected but no token estimates found. ' +
              'Include metadata.estimatedTokens with per-task estimates to prevent agent context overflow. ' +
              'Set PLANNER_TOKEN_ESTIMATION_ENFORCEMENT=off to disable.';
            if (plannerEstMode === 'block') {
              console.log(formatHookResult('block', plannerMsg));
              process.exit(2);
            } else {
              process.stderr.write(`[pre-completion-validation] WARNING: ${plannerMsg}\n`);
            }
          }
        }
      }

      // REFLECTION_SCORE_ENFORCEMENT: detect reflection agent fabricating scores without dataQuality.
      enforceReflectionScore(toolParams);
    }

    const completionTaskId = parsedParams.normalized.taskId;
    enforceRequiredOutputs(completionTaskId, toolParams, {
      getEnforcementMode,
      formatHookResult,
    });

    if (bypassAgentCompletionChecks) process.exit(0);

    if (isEcosystemCreatorAction(toolParams)) {
      const ecosystem = validateCreatorEcosystem();
      if (!ecosystem.passed) {
        const msg = ['CREATOR ECOSYSTEM ALIGNMENT FAILED', ...ecosystem.issues].join('\n');
        console.log(formatHookResult('block', msg));
        process.exit(2);
      }
    }

    const metadata = extractTaskMetadata(toolParams);
    const artifacts = detectArtifacts(metadata.filesModified);

    if (artifacts.length === 0) process.exit(0);

    const failed = [];
    for (const art of artifacts) {
      const v = validateArtifact(art.path);
      if (!v.passed) failed.push({ ...art, issues: v.issues });
    }

    if (failed.length === 0) process.exit(0);

    const blockMsg = [
      'PRE-COMPLETION VALIDATION FAILED',
      ...failed.map(f => `[${f.type}] ${f.path}`),
    ].join('\n');
    console.log(formatHookResult('block', blockMsg));
    process.exit(2);
  } catch (err) {
    console.error(`[pre-completion-validation] Hook failed: ${err.message}`);
    process.exit(0);
  }
}

if (require.main === module) {
  // SE-03: advisory hook must fail-open. Attach .catch() so an unexpected
  // rejection from main() does not become an unhandled-rejection that Node.js
  // terminates with exit code 1 (which Claude Code treats as a hard error,
  // silently blocking the tool with no stderr output).
  main().catch(err => {
    process.stderr.write(`[pre-completion-validation] Fatal: ${(err && err.message) || String(err)}
`);
    process.exit(0);
  });
}

module.exports = {
  main,
  extractTaskMetadata,
  detectArtifacts,
  readTaskStatus,
  isValidTransition,
  getTransitionError,
  validateArtifact,
  isEcosystemCreatorAction,
  validateCreatorEcosystem,
  readActiveCreatorSkills,
  resolveRequiredOutputsForTask,
  validateRequiredOutputs,
  isValidSummary,
  isFallbackSummary,
};
