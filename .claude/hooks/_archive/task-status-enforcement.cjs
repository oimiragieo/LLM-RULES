#!/usr/bin/env node
/**
 * Task Status Enforcement Hook
 * PreToolUse(TaskUpdate) - Validates TaskUpdate status transitions
 *
 * CRITICAL GAP ADDRESSED:
 * - Agents can exit without calling TaskUpdate(completed)
 * - Tasks get stuck in `in_progress` forever
 * - No validation of status sequence (pending → in_progress → completed)
 *
 * ENFORCEMENT:
 * - Valid transitions: pending → in_progress/deleted, in_progress → completed/deleted
 * - Invalid: pending → completed (must go through in_progress first)
 * - Invalid: completed → * (task already done)
 * - Warn: in_progress → in_progress (idempotent but suspicious)
 *
 * ENVIRONMENT VARIABLES:
 * - TASK_STATUS_ENFORCEMENT: 'block' (default) | 'warn' | 'off'
 *
 * @usage
 * Triggered on: PreToolUse(TaskUpdate)
 * Input: { tool_name: "TaskUpdate", tool_input: { taskId, status, ... } }
 * Output: { result: "block", message: "..." } OR exit 0 (allow)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputAsync,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
  auditSecurityOverride,
} = require('../../lib/utils/hook-input.cjs');

/**
 * Path to task status tracking file
 */
const TASK_STATUS_FILE = path.join(PROJECT_ROOT, '.claude/context/runtime/task-status.json');

/**
 * Valid status values
 */
const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'deleted'];

/**
 * Valid transitions from current status to new status
 * @type {Object.<string, string[]>}
 */
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
    auditLog('task-status-enforcement', 'error', {
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
 * Main hook execution
 */
async function main() {
  const mode = getEnforcementMode('TASK_STATUS_ENFORCEMENT', 'block');

  // If disabled, exit immediately
  if (mode === 'off') {
    auditSecurityOverride(
      'task-status-enforcement',
      'TASK_STATUS_ENFORCEMENT',
      'off',
      'Task status transitions not validated'
    );
    process.exit(0);
  }

  try {
    const hookInput = await parseHookInputAsync();
    const toolInput = getToolInput(hookInput);

    // Skip if no tool input
    if (!toolInput || typeof toolInput !== 'object') {
      process.exit(0);
    }

    // Extract taskId and status (support both taskId and task_id)
    const taskId = toolInput.taskId || toolInput.task_id;
    const newStatus = toolInput.status;

    // Skip if missing required fields
    if (!taskId || !newStatus) {
      process.exit(0);
    }

    // Normalize status
    const normalizedStatus = newStatus.toLowerCase();

    // Check if status is valid
    if (!VALID_STATUSES.includes(normalizedStatus)) {
      const message = `Invalid status value: "${newStatus}". Valid statuses: ${VALID_STATUSES.join(', ')}`;

      auditLog('task-status-enforcement', mode === 'block' ? 'block' : 'warn', {
        taskId,
        newStatus,
        reason: 'Invalid status value',
      });

      if (mode === 'block') {
        console.log(formatResult('block', message));
        process.exit(2);
      } else {
        console.warn(`[WARN] ${message}`);
        process.exit(0);
      }
    }

    // Get current status
    const currentStatus = readTaskStatus(taskId);

    // Check if transition is valid
    const isValid = isValidTransition(currentStatus, normalizedStatus);

    // Special case: in_progress → in_progress (idempotent but warn)
    if (currentStatus === 'in_progress' && normalizedStatus === 'in_progress') {
      auditLog('task-status-enforcement', 'warn', {
        taskId,
        currentStatus,
        newStatus: normalizedStatus,
        reason: 'Idempotent transition (already in_progress)',
      });
      console.warn(
        `[WARN] Task ${taskId} is already in_progress. Redundant TaskUpdate call detected.`
      );
      // Allow through - idempotent
      process.exit(0);
    }

    if (!isValid) {
      const message = getTransitionError(taskId, currentStatus, normalizedStatus);

      auditLog('task-status-enforcement', mode === 'block' ? 'block' : 'warn', {
        taskId,
        currentStatus,
        newStatus: normalizedStatus,
        reason: 'Invalid transition',
      });

      if (mode === 'block') {
        console.log(formatResult('block', message));
        process.exit(2);
      } else {
        console.warn(`[WARN] ${message}`);
      }
    }

    // Valid transition - update status file
    writeTaskStatus(taskId, normalizedStatus);

    auditLog('task-status-enforcement', 'allow', {
      taskId,
      currentStatus,
      newStatus: normalizedStatus,
    });

    process.exit(0);
  } catch (err) {
    auditLog('task-status-enforcement', 'error', {
      error: 'Task status enforcement error',
      message: err.message,
    });
    // Fail open - don't block TaskUpdate on hook errors
    process.exit(0);
  }
}

main();
