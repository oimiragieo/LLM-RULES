'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { withLock } = require('../utils/file-locker.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const TASK_STATUS_FILE =
  process.env.TASK_STATUS_FILE_PATH ||
  path.join(PROJECT_ROOT, '.claude/context/runtime/task-status.json');
const TASK_STATUS_LOCK =
  process.env.TASK_STATUS_LOCK_PATH ||
  path.join(PROJECT_ROOT, '.claude/context/runtime/task-status.lock');
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
      const content = fs.readFileSync(TASK_STATUS_FILE, 'utf8');
      if (!content.trim()) return 'pending';
      const data = safeParseJSON(content);
      return data[taskId] || 'pending';
    }
  } catch (_err) {
    // Ignore malformed files and fail-open to pending.
  }
  return 'pending';
}

async function writeTaskStatus(taskId, status) {
  const dir = path.dirname(TASK_STATUS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(TASK_STATUS_LOCK)) fs.writeFileSync(TASK_STATUS_LOCK, '', 'utf8');

  try {
    await withLock(TASK_STATUS_LOCK, async () => {
      let data = {};
      if (fs.existsSync(TASK_STATUS_FILE)) {
        const content = fs.readFileSync(TASK_STATUS_FILE, 'utf8');
        if (content.trim()) {
          data = safeParseJSON(content);
        }
      }

      // Idempotency: if status already matches, skip write to save I/O
      if (data[taskId] === status) return;

      data[taskId] = status;
      atomicWriteJSONSync(TASK_STATUS_FILE, data);
    });
  } catch (err) {
    process.stderr.write(`[task-lifecycle] writeTaskStatus error: ${err.message}\n`);
  }
}

function isValidTransition(currentStatus, newStatus) {
  const current = (currentStatus || 'pending').toLowerCase();
  const next = (newStatus || '').toLowerCase();

  if (!VALID_LIFECYCLE_STATUSES.includes(next)) {
    return false;
  }

  // Idempotent self-transitions are always valid
  if (current === next) {
    return true;
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
