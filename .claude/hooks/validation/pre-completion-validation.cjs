#!/usr/bin/env node
/* eslint-disable max-lines */
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

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Use shared utility for project root
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  getEnforcementMode,
  auditLog,
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult: formatHookResult,
} = require('../../lib/utils/hook-input.cjs');
const {
  parseAndValidateTaskUpdate,
  VALID_TASK_STATUSES,
} = require('../../lib/routing/task-update-contract.cjs');
const lifecycleState = require('../../lib/routing/task-lifecycle-state.cjs');

// Paths
const VALIDATION_SCRIPT = path.join(
  PROJECT_ROOT,
  '.claude',
  'tools',
  'cli',
  'validate-integration.cjs'
);
const ACTIVE_CREATORS_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude/context/runtime/active-creators.json'
);
const TASK_OUTPUT_CONTRACTS_PATH =
  process.env.TASK_OUTPUT_CONTRACTS_PATH ||
  path.join(PROJECT_ROOT, '.claude/context/runtime/task-output-contracts.json');
const TASK_OUTPUT_METRICS_PATH =
  process.env.TASK_OUTPUT_METRICS_PATH ||
  path.join(PROJECT_ROOT, '.claude/context/runtime/task-output-enforcement-metrics.json');
const CREATOR_ECOSYSTEM_VALIDATOR =
  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-creator-ecosystem.cjs');
const SKILL_ECOSYSTEM_VALIDATOR =
  process.env.SKILL_ECOSYSTEM_VALIDATOR_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-skill-ecosystem.cjs');
const AGENT_SKILL_REFERENCE_VALIDATOR =
  process.env.AGENT_SKILL_REFERENCE_VALIDATOR_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-agent-skill-references.cjs');
const ENFORCED_CREATOR_SKILLS = [
  'agent-creator',
  'command-creator',
  'rule-creator',
  'tool-creator',
  'hook-creator',
  'semgrep-rule-creator',
  'skill-creator',
  'template-creator',
  'workflow-creator',
];

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

function readActiveCreatorSkills() {
  try {
    if (!fs.existsSync(ACTIVE_CREATORS_STATE_FILE)) return [];
    const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
    const state = safeParseJSON(
      fs.readFileSync(ACTIVE_CREATORS_STATE_FILE, 'utf8'),
      null,
      null,
      {}
    );
    return Object.entries(state)
      .filter(([, value]) => value && value.active)
      .map(([key]) => key);
  } catch (_err) {
    return [];
  }
}

function hasCreatorKeyword(text = '') {
  const normalized = String(text).toLowerCase();
  return ENFORCED_CREATOR_SKILLS.some(skill => normalized.includes(skill));
}

function isEcosystemCreatorAction(params = {}) {
  const metadata = params.metadata || {};
  const filesTouched = [...(metadata.filesCreated || []), ...(metadata.filesModified || [])].map(
    file => String(file).replace(/\\/g, '/').toLowerCase()
  );

  const touchedCreatorDomains = filesTouched.some(file =>
    [
      '/.claude/skills/',
      '/.claude/agents/',
      '/.claude/hooks/',
      '/.claude/workflows/',
      '/.claude/templates/',
      '/.claude/commands/',
      '/.claude/rules/',
      '/.claude/tools/',
    ].some(prefix => file.includes(prefix))
  );

  const textSignal = [metadata.summary, metadata.subject, params.taskId, params.task_id]
    .filter(Boolean)
    .some(value => hasCreatorKeyword(value));

  const activeCreatorSignal = readActiveCreatorSkills().some(skill =>
    ENFORCED_CREATOR_SKILLS.includes(skill)
  );

  return touchedCreatorDomains || textSignal || activeCreatorSignal;
}

function runValidatorScript(scriptPath, args = [], fallbackIssue = 'Validation failed') {
  try {
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      windowsHide: true,
    });

    if (result.status === 0) return { passed: true, issues: [] };

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const issues = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('- ') || line.length > 0)
      .slice(0, 10)
      .map(line => (line.startsWith('- ') ? line.slice(2) : line));

    return {
      passed: false,
      issues: issues.length > 0 ? issues : [fallbackIssue],
    };
  } catch (err) {
    return { passed: false, issues: [`${fallbackIssue}: ${err.message}`] };
  }
}

function validateCreatorEcosystem() {
  const creatorValidation = runValidatorScript(
    CREATOR_ECOSYSTEM_VALIDATOR,
    [],
    'Creator ecosystem validation failed'
  );
  const skillValidation = runValidatorScript(
    SKILL_ECOSYSTEM_VALIDATOR,
    ['--min-score', '70'],
    'Skill ecosystem gate failed'
  );
  const agentSkillReferenceValidation = runValidatorScript(
    AGENT_SKILL_REFERENCE_VALIDATOR,
    [],
    'Agent skill reference validation failed'
  );

  const issues = [
    ...creatorValidation.issues,
    ...skillValidation.issues,
    ...agentSkillReferenceValidation.issues,
  ];
  return { passed: issues.length === 0, issues };
}

function readTaskOutputContracts() {
  try {
    if (!fs.existsSync(TASK_OUTPUT_CONTRACTS_PATH)) return { tasks: {} };
    const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
    const parsed = safeParseJSON(
      fs.readFileSync(TASK_OUTPUT_CONTRACTS_PATH, 'utf8'),
      null,
      null,
      {}
    );
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tasks !== 'object') {
      return { tasks: {} };
    }
    return { tasks: parsed.tasks || {} };
  } catch (_err) {
    return { tasks: {} };
  }
}

function resolveRequiredOutputsForTask(taskId, params = {}) {
  const contracts = readTaskOutputContracts();
  const contractOutputs = contracts.tasks?.[String(taskId)]?.requiredOutputs;
  const metadata = params.metadata && typeof params.metadata === 'object' ? params.metadata : {};
  const declared = metadata.requiredOutputs || metadata.required_outputs || [];
  const fromParams = [];
  if (Array.isArray(declared)) {
    for (const output of declared) {
      if (typeof output === 'string') fromParams.push(output);
      else if (output && typeof output === 'object') {
        fromParams.push(output.path || output.file_path || output.filePath || '');
      }
    }
  }
  const raw = [...(Array.isArray(contractOutputs) ? contractOutputs : []), ...fromParams]
    .map(item => String(item || '').trim())
    .filter(Boolean);
  const seen = new Set();
  const normalized = [];
  for (const entry of raw) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(entry);
  }
  return normalized;
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
  for (const output of requiredOutputs) {
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
      if (hasPlaceholderMarker(content)) {
        invalid.push(output);
      }
    } catch (_err) {
      invalid.push(output);
    }
  }
  return { passed: missing.length === 0 && invalid.length === 0, missing, invalid };
}

function incrementTaskOutputMetric(counterName) {
  try {
    const now = new Date().toISOString();
    let state = { counters: {}, updatedAt: now };
    if (fs.existsSync(TASK_OUTPUT_METRICS_PATH)) {
      try {
        const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
        const parsed = safeParseJSON(
          fs.readFileSync(TASK_OUTPUT_METRICS_PATH, 'utf8'),
          null,
          null,
          {}
        );
        if (parsed && typeof parsed === 'object') {
          state = {
            counters: parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : {},
            updatedAt: parsed.updatedAt || now,
          };
        }
      } catch (_err) {
        // Reset invalid metrics state.
      }
    }
    const key = String(counterName || '').trim();
    if (!key) return;
    state.counters[key] = Number(state.counters[key] || 0) + 1;
    state.updatedAt = now;
    fs.mkdirSync(path.dirname(TASK_OUTPUT_METRICS_PATH), { recursive: true });
    fs.writeFileSync(TASK_OUTPUT_METRICS_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch (_err) {
    // Best effort only.
  }
}

/**
 * Validate that a summary string is meaningful and not a known fallback/placeholder.
 * @param {*} summary - The summary value to validate
 * @returns {boolean} true if valid, false if missing or placeholder
 */
function isValidSummary(summary) {
  if (!summary || typeof summary !== 'string') return false;
  const trimmed = summary.trim();
  if (trimmed.length < 50) return false; // Require substantive summary (50+ chars; shorter strings are placeholders)
  // Reject known fallback/placeholder strings
  const FALLBACK_PATTERNS = [
    /task\s+\d+\s+completed\s+without\s+summary\s+metadata/i,
    /^task\s+\d+\s+completed\s+without\s+summary/i,
    /^completed\s+without\s+summary/i,
    /^no\s+summary\s+(provided|available|metadata)/i,
    /^task\s+completed$/i,
    /^completed\s+task\s+\d+$/i, // "Completed task 2" etc.
    /^done$/i,
    /^finished$/i,
  ];
  return !FALLBACK_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Check if a summary is the known agent fallback string.
 * @param {*} summary - The summary value to check
 * @returns {boolean} true if it matches the fallback pattern
 */
function isFallbackSummary(summary) {
  if (!summary || typeof summary !== 'string') return false;
  return /task\s+\d+\s+completed\s+without\s+summary\s+metadata/i.test(summary.trim());
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
 * Enforce required output artifacts for a completing task.
 * @param {string|undefined} completionTaskId - The task ID being completed
 * @param {object} toolParams - Raw TaskUpdate parameters
 */
function enforceRequiredOutputs(completionTaskId, toolParams) {
  const requiredOutputs = resolveRequiredOutputsForTask(completionTaskId, toolParams);
  const taskOutputMode = getEnforcementMode('TASK_OUTPUT_ENFORCEMENT', 'block');
  if (taskOutputMode === 'off' || !completionTaskId || requiredOutputs.length === 0) return;

  const outputValidation = validateRequiredOutputs(requiredOutputs);
  if (outputValidation.passed) return;

  incrementTaskOutputMetric('artifact_completion_blocked');
  if (outputValidation.invalid.length > 0) {
    incrementTaskOutputMetric('placeholder_attempt_detected');
  }
  const lines = ['REQUIRED OUTPUT VALIDATION FAILED'];
  if (outputValidation.missing.length > 0) {
    lines.push('Missing required outputs:');
    for (const item of outputValidation.missing) lines.push(`- ${item}`);
  }
  if (outputValidation.invalid.length > 0) {
    lines.push('Invalid placeholder outputs:');
    for (const item of outputValidation.invalid) lines.push(`- ${item}`);
  }
  const validationMessage = lines.join('\n');
  if (taskOutputMode === 'warn') {
    console.warn(`[WARN] ${validationMessage}`);
  } else {
    console.log(formatHookResult('block', validationMessage));
    process.exit(2);
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

    // PRE_COMPLETION_SUMMARY_ENFORCEMENT: require metadata.summary on completed tasks
    const summaryMode = getEnforcementMode('PRE_COMPLETION_SUMMARY_ENFORCEMENT', 'block');
    if (summaryMode !== 'off') {
      if (!isValidSummary(toolParams.metadata && toolParams.metadata.summary)) {
        const summaryMsg =
          'TaskUpdate(completed) requires metadata.summary. Set PRE_COMPLETION_SUMMARY_ENFORCEMENT=warn to downgrade.';
        if (summaryMode === 'block') {
          console.log(formatHookResult('block', summaryMsg));
          process.exit(2);
        } else {
          process.stderr.write(
            `[pre-completion-validation] WARNING: TaskUpdate(completed) missing metadata.summary — reflection will be blind\n`
          );
        }
      }
    }

    // SUMMARY_REQUIRED_ENFORCEMENT: block completion when summary is the known agent fallback
    // string or is missing/empty/under 50 chars. Default is 'block' — advisory mode has failed
    // to produce compliance (17+ documented violations across multiple sessions).
    const summaryRequiredMode = getEnforcementMode('SUMMARY_REQUIRED_ENFORCEMENT', 'block');
    if (summaryRequiredMode !== 'off') {
      const rawSummary = toolParams.metadata && toolParams.metadata.summary;
      const isFallback = isFallbackSummary(rawSummary);
      const isMissingOrShort =
        !rawSummary || typeof rawSummary !== 'string' || rawSummary.trim().length < 50;

      if (isFallback || isMissingOrShort) {
        const blockReason = isFallback
          ? 'summary is the agent fallback string ("Task N completed without summary metadata") — provide a real summary describing what was done'
          : 'summary is missing, empty, or under 50 characters — provide a substantive summary (50+ chars)';
        const summaryRequiredMsg = `TaskUpdate blocked: summary metadata is required (50+ chars, not the fallback string). Reason: ${blockReason}. Set SUMMARY_REQUIRED_ENFORCEMENT=warn to downgrade.`;
        if (summaryRequiredMode === 'block') {
          console.log(formatHookResult('block', summaryRequiredMsg));
          process.exit(2);
        } else {
          process.stderr.write(
            `[pre-completion-validation] SUMMARY_REQUIRED_ENFORCEMENT WARNING: ${blockReason}\n`
          );
        }
      }
    }

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

    // DRAIN_GATE_ENFORCEMENT: verify no open tasks remain before pipeline completion.
    // Prevents "all done" claims while tasks sit pending/in_progress.
    const drainGateMode = getEnforcementMode('DRAIN_GATE_ENFORCEMENT', 'warn');
    if (drainGateMode !== 'off' && isPipelineCompletion) {
      try {
        const taskStatusFile = path.join(PROJECT_ROOT, '.claude/context/runtime/task-status.json');
        if (fs.existsSync(taskStatusFile)) {
          const { safeParseJSON: parseJSON } = require('../../lib/utils/safe-json.cjs');
          const taskStates = parseJSON(fs.readFileSync(taskStatusFile, 'utf8'));
          const openTasks = [];
          for (const [taskId, status] of Object.entries(taskStates)) {
            if (status === 'pending' || status === 'in_progress') {
              openTasks.push(`${taskId}:${status}`);
            }
          }
          // Exclude the current task being completed from the count
          const currentTaskId = parsedParams.normalized.taskId;
          const otherOpenTasks = openTasks.filter(t => !t.startsWith(`${currentTaskId}:`));
          if (otherOpenTasks.length > 0) {
            const drainMsg =
              `DRAIN GATE FAILED: Pipeline completion claimed but ${otherOpenTasks.length} task(s) still open: ` +
              `${otherOpenTasks.slice(0, 5).join(', ')}${otherOpenTasks.length > 5 ? '...' : ''}. ` +
              `Close all tasks before claiming pipeline complete. Set DRAIN_GATE_ENFORCEMENT=off to disable.`;
            if (drainGateMode === 'block') {
              console.log(formatHookResult('block', drainMsg));
              process.exit(2);
            } else {
              process.stderr.write(`[pre-completion-validation] WARNING: ${drainMsg}\n`);
            }
          }
        }
      } catch (_e) {
        // Best effort — don't block on state file read failure
      }
    }

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

    const completionTaskId = parsedParams.normalized.taskId;
    enforceRequiredOutputs(completionTaskId, toolParams);

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
