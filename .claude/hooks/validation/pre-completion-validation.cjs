#!/usr/bin/env node
/**
 * pre-completion-validation.cjs
 *
 * PreToolUse hook that validates artifact integration and task status transitions
 * before allowing TaskUpdate.
 *
 * WHEN IT RUNS:
 * - Before TaskUpdate tool execution
 *
 * WHAT IT DOES:
 * - Validates task status transitions (pending → in_progress → completed)
 * - Detects if task involves artifact creation (when status: "completed")
 * - Runs integration validation (when status: "completed")
 * - Blocks invalid transitions or incomplete integration
 * - Provides clear remediation steps
 *
 * Part of the Post-Creation Validation Workflow.
 * @see .claude/workflows/core/post-creation-validation.md
 *
 * MERGED FROM:
 * - task-status-enforcement.cjs (2026-02-09)
 *
 * ENVIRONMENT VARIABLES:
 * - TASK_STATUS_ENFORCEMENT: 'block' (default) | 'warn' | 'off'
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Use shared utility for project root
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  getEnforcementMode,
  auditLog,
  auditSecurityOverride,
} = require('../../lib/utils/hook-input.cjs');

// Paths
const VALIDATION_SCRIPT = path.join(
  PROJECT_ROOT,
  '.claude',
  'tools',
  'cli',
  'validate-integration.cjs'
);
const TASK_STATUS_FILE = path.join(PROJECT_ROOT, '.claude/context/runtime/task-status.json');
const ACTIVE_CREATORS_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude/context/runtime/active-creators.json'
);
const CREATOR_ECOSYSTEM_VALIDATOR =
  process.env.CREATOR_ECOSYSTEM_VALIDATOR_PATH ||
  path.join(PROJECT_ROOT, '.claude', 'tools', 'cli', 'validate-creator-ecosystem.cjs');
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

// Valid status values
const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'deleted'];

// Valid transitions from current status to new status
const VALID_TRANSITIONS = {
  pending: ['in_progress', 'deleted'],
  in_progress: ['completed', 'deleted'],
  completed: [], // Cannot transition from completed (terminal state)
  deleted: [], // Cannot transition from deleted (terminal state)
};

/**
 * Read current task status from file
 * @param {string} taskId - Task ID to look up
 * @returns {string} Current status ('pending' if not found)
 */
function readTaskStatus(taskId) {
  try {
    if (fs.existsSync(TASK_STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TASK_STATUS_FILE, 'utf8'));
      return data[taskId] || 'pending';
    }
  } catch (_err) {
    // File doesn't exist or invalid JSON - treat as pending
  }
  return 'pending';
}

/**
 * Write task status to file
 * @param {string} taskId - Task ID to update
 * @param {string} status - New status
 */
function writeTaskStatus(taskId, status) {
  try {
    let data = {};
    if (fs.existsSync(TASK_STATUS_FILE)) {
      const content = fs.readFileSync(TASK_STATUS_FILE, 'utf8');
      if (content.trim()) {
        data = JSON.parse(content);
      }
    }

    data[taskId] = status;

    // Ensure directory exists
    const dir = path.dirname(TASK_STATUS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(TASK_STATUS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    // Best effort - don't fail hook if file write fails
    auditLog('pre-completion-validation', 'error', {
      error: 'Failed to write task status',
      message: err.message,
    });
  }
}

/**
 * Check if transition is valid
 * @param {string} currentStatus - Current task status
 * @param {string} newStatus - New status being set
 * @returns {boolean} True if valid, false otherwise
 */
function isValidTransition(currentStatus, newStatus) {
  // Normalize to lowercase
  const current = (currentStatus || 'pending').toLowerCase();
  const newStat = (newStatus || '').toLowerCase();

  // Invalid if new status is not recognized
  if (!VALID_STATUSES.includes(newStat)) {
    return false;
  }

  // Check transition table
  const allowedTransitions = VALID_TRANSITIONS[current] || [];
  return allowedTransitions.includes(newStat);
}

/**
 * Get transition error message
 * @param {string} taskId - Task ID
 * @param {string} currentStatus - Current task status
 * @param {string} newStatus - New status being set
 * @returns {string} Error message
 */
function getTransitionError(taskId, currentStatus, newStatus) {
  const messages = {
    pending: {
      completed:
        'Task cannot go from pending → completed (must go through in_progress first). Use TaskUpdate({ taskId, status: "in_progress" }) before marking complete.',
    },
    completed: {
      _default: `Task ${taskId} is already completed. Cannot change status from completed → ${newStatus}.`,
    },
    deleted: {
      _default: `Task ${taskId} is deleted. Cannot change status from deleted → ${newStatus}.`,
    },
  };

  const statusMessages = messages[currentStatus];
  if (statusMessages) {
    return statusMessages[newStatus] || statusMessages._default || 'Invalid transition';
  }

  return `Invalid task status transition: ${taskId} from ${currentStatus} → ${newStatus}`;
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
      taskId: params.taskId,
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

  for (const filePath of filesModified) {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check if it's an artifact path
    if (
      normalizedPath.includes('/.claude/agents/') ||
      normalizedPath.includes('/.claude/skills/') ||
      normalizedPath.includes('/.claude/workflows/') ||
      normalizedPath.includes('/.claude/hooks/')
    ) {
      // Extract artifact info
      const type = normalizedPath.includes('/agents/')
        ? 'agent'
        : normalizedPath.includes('/skills/')
          ? 'skill'
          : normalizedPath.includes('/workflows/')
            ? 'workflow'
            : 'hook';

      artifacts.push({
        path: filePath,
        type,
      });
    }
  }

  return artifacts;
}

/**
 * Run validation script on artifact.
 */
function validateArtifact(artifactPath) {
  try {
    // Run validation script
    // SEC-FIX: Use spawnSync with array args instead of string interpolation (prevents command injection)
    const result = spawnSync(process.execPath, [VALIDATION_SCRIPT, artifactPath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
      windowsHide: true,
    });

    // Check exit code
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || 'Validation failed');
    }

    return { passed: true, issues: [] };
  } catch (err) {
    // Validation failed - parse output for issues
    const output = err.stdout || err.stderr || '';
    const issues = [];

    // Extract failed checks from output
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
    if (!fs.existsSync(ACTIVE_CREATORS_STATE_FILE)) {
      return [];
    }
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

function validateCreatorEcosystem() {
  try {
    const result = spawnSync(process.execPath, [CREATOR_ECOSYSTEM_VALIDATOR], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
      windowsHide: true,
    });

    if (result.status === 0) {
      return { passed: true, issues: [] };
    }

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const issues = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('- '))
      .map(line => line.slice(2));

    return {
      passed: false,
      issues: issues.length > 0 ? issues : ['Creator ecosystem validation failed'],
    };
  } catch (err) {
    return {
      passed: false,
      issues: [`Creator ecosystem validation error: ${err.message}`],
    };
  }
}
/**
 * Main hook execution.
 */
function main(hookInput) {
  try {
    // Parse hook input
    const input = typeof hookInput === 'string' ? JSON.parse(hookInput) : hookInput;
    const { tool, params } = input;

    // Only intercept TaskUpdate calls
    if (tool !== 'TaskUpdate') {
      // Not a TaskUpdate call - allow
      console.log(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // ============================================================
    // CHECK 1: TASK STATUS TRANSITION VALIDATION
    // ============================================================
    const taskStatusMode = getEnforcementMode('TASK_STATUS_ENFORCEMENT', 'block');

    // If task status enforcement is not disabled, validate status transition
    if (taskStatusMode !== 'off') {
      // Extract taskId and status (support both taskId and task_id)
      const taskId = params.taskId || params.task_id;
      const newStatus = params.status;

      // Only validate if we have taskId and status
      if (taskId && newStatus) {
        // Normalize status
        const normalizedStatus = newStatus.toLowerCase();

        // Check if status is valid
        if (!VALID_STATUSES.includes(normalizedStatus)) {
          const message = `Invalid status value: "${newStatus}". Valid statuses: ${VALID_STATUSES.join(', ')}`;

          auditLog('pre-completion-validation', taskStatusMode === 'block' ? 'block' : 'warn', {
            check: 'task-status-enforcement',
            taskId,
            newStatus,
            reason: 'Invalid status value',
          });

          if (taskStatusMode === 'block') {
            console.log(JSON.stringify({ allow: false, message }));
            process.exit(0);
          } else {
            console.warn(`[WARN] ${message}`);
          }
        } else {
          // Get current status
          const currentStatus = readTaskStatus(taskId);

          // Check if transition is valid
          const isValid = isValidTransition(currentStatus, normalizedStatus);

          // Special case: in_progress → in_progress (idempotent but warn)
          if (currentStatus === 'in_progress' && normalizedStatus === 'in_progress') {
            auditLog('pre-completion-validation', 'warn', {
              check: 'task-status-enforcement',
              taskId,
              currentStatus,
              newStatus: normalizedStatus,
              reason: 'Idempotent transition (already in_progress)',
            });
            console.warn(
              `[WARN] Task ${taskId} is already in_progress. Redundant TaskUpdate call detected.`
            );
            // Allow through - idempotent
          } else if (!isValid) {
            const message = getTransitionError(taskId, currentStatus, normalizedStatus);

            auditLog('pre-completion-validation', taskStatusMode === 'block' ? 'block' : 'warn', {
              check: 'task-status-enforcement',
              taskId,
              currentStatus,
              newStatus: normalizedStatus,
              reason: 'Invalid transition',
            });

            if (taskStatusMode === 'block') {
              console.log(JSON.stringify({ allow: false, message }));
              process.exit(0);
            } else {
              console.warn(`[WARN] ${message}`);
            }
          } else {
            // Valid transition - update status file
            writeTaskStatus(taskId, normalizedStatus);

            auditLog('pre-completion-validation', 'allow', {
              check: 'task-status-enforcement',
              taskId,
              currentStatus,
              newStatus: normalizedStatus,
            });
          }
        }
      }
    } else {
      auditSecurityOverride(
        'pre-completion-validation',
        'TASK_STATUS_ENFORCEMENT',
        'off',
        'Task status transitions not validated'
      );
    }

    // ============================================================
    // CHECK 2: ARTIFACT INTEGRATION VALIDATION (only for "completed")
    // ============================================================
    // Only intercept when status is being set to "completed"
    if (params.status !== 'completed') {
      // Not completing a task - allow (status validation passed above)
      console.log(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Enforce creator ecosystem alignment when any creator skill is actioned
    if (isEcosystemCreatorAction(params)) {
      const ecosystemValidation = validateCreatorEcosystem();
      if (!ecosystemValidation.passed) {
        const ecosystemMessage = [
          '',
          '+----------------------------------------------------------+',
          '| CREATOR ECOSYSTEM ALIGNMENT FAILED                       |',
          '+----------------------------------------------------------+',
          '| A creator skill action was detected, but ecosystem       |',
          '| alignment checks failed.                                  |',
          '|                                                          |',
          '| Required action:                                          |',
          '|  1. Align all creator skill folders and contracts        |',
          '|  2. Run: node .claude/tools/cli/validate-creator-ecosystem.cjs |',
          '|  3. Re-run TaskUpdate to complete                        |',
          '|                                                          |',
        ];

        for (const issue of ecosystemValidation.issues.slice(0, 8)) {
          ecosystemMessage.push(`|  - ${issue.substring(0, 54).padEnd(54)}|`);
        }

        ecosystemMessage.push('+----------------------------------------------------------+');
        ecosystemMessage.push('');

        console.log(
          JSON.stringify({
            allow: false,
            message: ecosystemMessage.join('\n'),
          })
        );
        process.exit(0);
      }
    }

    // Extract task metadata
    const metadata = extractTaskMetadata(params);

    // Detect artifacts in modified files
    const artifacts = detectArtifacts(metadata.filesModified);

    // If no artifacts, allow completion
    if (artifacts.length === 0) {
      console.log(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Validate each artifact
    const failedArtifacts = [];

    for (const artifact of artifacts) {
      const validation = validateArtifact(artifact.path);
      if (!validation.passed) {
        failedArtifacts.push({
          ...artifact,
          issues: validation.issues,
        });
      }
    }

    // If all artifacts passed, allow completion
    if (failedArtifacts.length === 0) {
      console.log(JSON.stringify({ allow: true }));
      process.exit(0);
    }

    // Block completion - validation failed
    const blockMessage = [
      '',
      '+----------------------------------------------------------+',
      '| PRE-COMPLETION VALIDATION FAILED                         |',
      '+----------------------------------------------------------+',
      '| Cannot complete task - artifact integration incomplete.  |',
      '|                                                          |',
      `| Task ID: ${metadata.taskId || 'unknown'}`,
      `| Artifacts with issues: ${failedArtifacts.length}`,
      '|                                                          |',
    ];

    for (const artifact of failedArtifacts) {
      blockMessage.push(`|  [${artifact.type}] ${path.basename(artifact.path)}`);
      for (const issue of artifact.issues.slice(0, 3)) {
        // Max 3 issues shown
        blockMessage.push(`|    - ${issue.substring(0, 50)}`);
      }
    }

    blockMessage.push('|                                                          |');
    blockMessage.push('| Required action:                                         |');
    blockMessage.push('|  1. Run: node .claude/tools/cli/validate-integration.cjs \\|');
    blockMessage.push('|           <artifact-path>                                |');
    blockMessage.push('|  2. Fix reported issues                                 |');
    blockMessage.push('|  3. Re-run TaskUpdate to complete                       |');
    blockMessage.push('|                                                          |');
    blockMessage.push('| See: .claude/workflows/core/post-creation-validation.md  |');
    blockMessage.push('+----------------------------------------------------------+');
    blockMessage.push('');

    // Block with message
    console.log(
      JSON.stringify({
        allow: false,
        message: blockMessage.join('\n'),
      })
    );
    process.exit(0);
  } catch (err) {
    // Error in hook - allow completion (fail open)
    console.log(
      JSON.stringify({
        allow: true,
        message: `Pre-completion validation error: ${err.message}`,
      })
    );
    process.exit(0);
  }
}

if (require.main === module) {
  // Read hook input from stdin
  let hookInput = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', chunk => {
    hookInput += chunk;
  });
  process.stdin.on('end', () => {
    main(hookInput);
  });
}

module.exports = {
  main,
  extractTaskMetadata,
  detectArtifacts,
  readTaskStatus,
  writeTaskStatus,
  isValidTransition,
  getTransitionError,
  validateArtifact,
  isEcosystemCreatorAction,
  validateCreatorEcosystem,
  readActiveCreatorSkills,
};
