/**
 * @file Post-Spawn Task Updater Hook
 * @hook-type PostToolUse
 * @description Enforces task completion updates after agent spawns finish
 * @phase Task #72 - CRITICAL Mandatory Task Tracking Protocol Enforcement
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract task ID from spawn prompt
 * @param {string} prompt - Spawn prompt text
 * @returns {string|null} - Task ID or null
 */
function extractTaskId(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;

  const patterns = [
    /Task\s+#(\d+)/i,
    /Your\s+Task\s+ID:\s*(\d+)/i,
    /task\s+#(\d+)/i,
    /taskId[:\s]+["']?(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Load tasks from tasks.json
 * @param {string} projectRoot - Project root directory
 * @returns {Array} - Array of task objects
 */
function loadTasks(projectRoot) {
  const tasksFile = path.join(projectRoot, '.claude/context/tasks.json');

  if (!fs.existsSync(tasksFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(tasksFile, 'utf8');
    const data = JSON.parse(content);
    return data.tasks || [];
  } catch (error) {
    console.error('[POST-SPAWN-UPDATER] Failed to load tasks.json:', error.message);
    return [];
  }
}

/**
 * Log post-spawn check to audit trail
 * @param {string} projectRoot - Project root
 * @param {Object} entry - Audit log entry
 */
function logPostSpawnCheck(projectRoot, entry) {
  const auditLog = path.join(projectRoot, '.claude/context/metrics/spawn-audit.jsonl');
  const dir = path.dirname(auditLog);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    hook: 'post-spawn-task-updater',
    ...entry
  });

  fs.appendFileSync(auditLog, line + '\n', 'utf8');
}

/**
 * Log escalation to metrics
 * @param {string} projectRoot - Project root
 * @param {Object} escalation - Escalation entry
 */
function logEscalation(projectRoot, escalation) {
  const escalationLog = path.join(projectRoot, '.claude/context/metrics/task-escalations.jsonl');
  const dir = path.dirname(escalationLog);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...escalation
  });

  fs.appendFileSync(escalationLog, line + '\n', 'utf8');
}

/**
 * PostToolUse hook - checks task status after spawn completes
 * @param {Object} input - Hook input
 * @param {string} input.tool - Tool name
 * @param {Object} input.parameters - Tool parameters
 * @param {Object} input.result - Tool result
 * @param {Object} input.context - Execution context
 * @returns {Object} - { allowed: boolean, warnings?: Array }
 */
async function PostToolUse(input) {
  const { tool, parameters = {}, context = {} } = input;

  // Only check Task tool
  if (tool !== 'Task') {
    return { allowed: true };
  }

  // Check for override flag
  if (process.env.NO_TRACK_ENFORCEMENT === 'true') {
    return { allowed: true };
  }

  const projectRoot = context.PROJECT_ROOT || process.cwd();
  const { prompt = '' } = parameters;

  // Extract task ID from prompt
  const taskId = extractTaskId(prompt);
  if (!taskId) {
    // No task ID in prompt - can't verify
    logPostSpawnCheck(projectRoot, {
      event: 'no-task-id',
      prompt: prompt.substring(0, 100),
      warning: 'Spawn completed without task ID in prompt'
    });
    return { allowed: true, warnings: ['Spawn without task ID'] };
  }

  // Load tasks
  const tasks = loadTasks(projectRoot);
  if (tasks.length === 0) {
    // No tasks file - can't verify
    return { allowed: true };
  }

  // Find the task
  const task = tasks.find(t => String(t.id) === String(taskId));
  if (!task) {
    logPostSpawnCheck(projectRoot, {
      event: 'task-not-found',
      taskId,
      warning: `Task #${taskId} not found after spawn`
    });
    return { allowed: true, warnings: [`Task #${taskId} not found`] };
  }

  // Check if task is still in_progress
  if (task.status === 'in_progress') {
    const warnings = [];

    // Calculate how long task has been in progress
    const startedAt = task.startedAt ? new Date(task.startedAt) : null;
    const duration = startedAt ? Date.now() - startedAt.getTime() : 0;
    const durationMinutes = Math.floor(duration / 60000);

    const warning = `Task #${taskId} still in_progress after spawn completed (${durationMinutes}m)`;
    warnings.push(warning);

    // Escalate if >1 hour
    if (duration > 60 * 60 * 1000) {
      logEscalation(projectRoot, {
        taskId: task.id,
        subject: task.subject,
        status: task.status,
        durationMs: duration,
        durationMinutes,
        reason: 'Task in_progress for >1 hour without completion'
      });
      warnings.push(`ESCALATED: Task #${taskId} >1 hour without completion`);
    }

    logPostSpawnCheck(projectRoot, {
      event: 'incomplete-task',
      taskId: task.id,
      subject: task.subject,
      status: task.status,
      durationMinutes,
      warning
    });

    return { allowed: true, warnings };
  }

  // Task is completed or failed - good!
  logPostSpawnCheck(projectRoot, {
    event: 'task-completed',
    taskId: task.id,
    status: task.status,
    result: 'Task properly updated'
  });

  return { allowed: true };
}

module.exports = { PostToolUse };
