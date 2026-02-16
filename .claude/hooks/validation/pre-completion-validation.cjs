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

const VALID_STATUSES = VALID_TASK_STATUSES;

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
    const state = JSON.parse(fs.readFileSync(ACTIVE_CREATORS_STATE_FILE, 'utf8'));
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
    ['--require-perfect'],
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

/**
 * Main hook execution.
 */
async function main() {
  try {
    const input = await parseHookInputAsync({ timeout: 300 });
    if (!input) process.exit(0);

    const toolName = getToolName(input);
    const toolParams = getToolInput(input);

    if (toolName !== 'TaskUpdate') process.exit(0);

    const parsedParams = parseAndValidateTaskUpdate(toolParams, {
      allowedStatuses: VALID_STATUSES,
      requireTaskId: false,
      requireStatus: false,
    });

    const taskStatusMode = getEnforcementMode('TASK_STATUS_ENFORCEMENT', 'block');

    if (taskStatusMode !== 'off') {
      const taskId = parsedParams.normalized.taskId;
      const newStatus = parsedParams.normalized.status;

      if (taskId && newStatus) {
        if (!VALID_STATUSES.includes(newStatus)) {
          const msg = `Invalid status: "${newStatus}". Valid: ${VALID_STATUSES.join(', ')}`;
          if (taskStatusMode === 'block') {
            console.log(formatHookResult('block', msg));
            process.exit(0);
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
              process.exit(0);
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

    if (isEcosystemCreatorAction(toolParams)) {
      const ecosystem = validateCreatorEcosystem();
      if (!ecosystem.passed) {
        const msg = ['CREATOR ECOSYSTEM ALIGNMENT FAILED', ...ecosystem.issues].join('\n');
        console.log(formatHookResult('block', msg));
        process.exit(0);
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
    process.exit(0);
  } catch (err) {
    console.error(`[pre-completion-validation] Hook failed: ${err.message}`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
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
};
