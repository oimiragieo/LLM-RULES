'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const TASK_STATUS_FILE = path.join(PROJECT_ROOT, '.claude/context/runtime/task-status.json');
const VALID_LIFECYCLE_STATUSES = Object.freeze(['pending', 'in_progress', 'completed', 'deleted']);
const VALID_TRANSITIONS = Object.freeze({
  pending: ['in_progress', 'deleted'],
  in_progress: ['completed', 'deleted'],
  completed: [],
  deleted: [],
});

function readTaskStatus(taskId) {
  try {
    if (fs.existsSync(TASK_STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TASK_STATUS_FILE, 'utf8'));
      return data[taskId] || 'pending';
    }
  } catch (_err) {
    // Ignore malformed files and fail-open to pending.
  }
  return 'pending';
}

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

    const dir = path.dirname(TASK_STATUS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(TASK_STATUS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (_err) {
    // Best effort only.
  }
}

function isValidTransition(currentStatus, newStatus) {
  const current = (currentStatus || 'pending').toLowerCase();
  const next = (newStatus || '').toLowerCase();
  if (!VALID_LIFECYCLE_STATUSES.includes(next)) {
    return false;
  }
  const allowedTransitions = VALID_TRANSITIONS[current] || [];
  return allowedTransitions.includes(next);
}

function getTransitionError(taskId, currentStatus, newStatus) {
  const messages = {
    pending: {
      completed:
        'Task cannot go from pending -> completed (must go through in_progress first). Use TaskUpdate({ taskId, status: "in_progress" }) before marking complete.',
    },
    completed: {
      _default: `Task ${taskId} is already completed. Cannot change status from completed -> ${newStatus}.`,
    },
    deleted: {
      _default: `Task ${taskId} is deleted. Cannot change status from deleted -> ${newStatus}.`,
    },
  };

  const statusMessages = messages[currentStatus];
  if (statusMessages) {
    return statusMessages[newStatus] || statusMessages._default || 'Invalid transition';
  }

  return `Invalid task status transition: ${taskId} from ${currentStatus} -> ${newStatus}`;
}

module.exports = {
  TASK_STATUS_FILE,
  VALID_LIFECYCLE_STATUSES,
  VALID_TRANSITIONS,
  readTaskStatus,
  writeTaskStatus,
  isValidTransition,
  getTransitionError,
};
