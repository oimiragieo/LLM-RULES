/**
 * @file Pre-Spawn Task Validator Hook
 * @hook-type PreToolUse
 * @description Blocks agent spawns without corresponding TaskCreate entries
 * @phase Task #72 - CRITICAL Mandatory Task Tracking Protocol Enforcement
 */

const fs = require('fs');
const path = require('path');

/**
 * Task ID extraction patterns
 */
const TASK_ID_PATTERNS = [
  /Task\s+#(\d+)/i, // "Task #72"
  /Your\s+Task\s+ID:\s*(\d+)/i, // "Your Task ID: 72"
  /task\s+#(\d+)/i, // "task #72"
  /taskId[:\s]+["']?(\d+)/i, // "taskId: 72"
];

/**
 * Extract task ID from spawn prompt
 * @param {string} prompt - Spawn prompt text
 * @returns {string|null} - Task ID or null if not found
 */
function extractTaskId(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;

  for (const pattern of TASK_ID_PATTERNS) {
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
    console.error('[PRE-SPAWN-VALIDATOR] Failed to load tasks.json:', error.message);
    return [];
  }
}

/**
 * Find task by ID
 * @param {Array} tasks - Tasks array
 * @param {string} taskId - Task ID to find
 * @returns {Object|null} - Task object or null
 */
function findTaskById(tasks, taskId) {
  return tasks.find(t => String(t.id) === String(taskId)) || null;
}

/**
 * Match task by description keywords
 * @param {Array} tasks - Tasks array
 * @param {string} description - Work description from spawn
 * @returns {Object|null} - Matching task or null
 */
function matchTaskByDescription(tasks, description) {
  if (!description || typeof description !== 'string') return null;

  const descLower = description.toLowerCase();
  const keywords = descLower.split(/\s+/).filter(w => w.length > 3);

  // Score each pending task by keyword matches
  let bestMatch = null;
  let bestScore = 0;

  for (const task of tasks) {
    if (task.status !== 'pending') continue;

    const taskText = `${task.subject || ''} ${task.description || ''}`.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      if (taskText.includes(keyword)) {
        score++;
      }
    }

    if (score > bestScore && score >= 2) {
      // Require at least 2 keyword matches
      bestScore = score;
      bestMatch = task;
    }
  }

  return bestMatch;
}

/**
 * Log spawn attempt to audit trail
 * @param {string} projectRoot - Project root
 * @param {Object} entry - Audit log entry
 */
function logSpawnAttempt(projectRoot, entry) {
  const auditLog = path.join(projectRoot, '.claude/context/metrics/spawn-audit.jsonl');
  const dir = path.dirname(auditLog);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });

  fs.appendFileSync(auditLog, line + '\n', 'utf8');
}

/**
 * PreToolUse hook - validates task tracking before spawn
 * @param {Object} input - Hook input
 * @param {string} input.tool - Tool name
 * @param {Object} input.parameters - Tool parameters
 * @param {Object} input.context - Execution context
 * @returns {Object} - { allowed: boolean, reason?: string }
 */
async function PreToolUse(input) {
  const { tool, parameters = {}, context = {} } = input;

  // Only validate Task tool
  if (tool !== 'Task') {
    return { allowed: true };
  }

  // Check for override flag
  if (process.env.NO_TRACK_ENFORCEMENT === 'true') {
    return { allowed: true, reason: 'NO_TRACK_ENFORCEMENT override' };
  }

  const projectRoot = context.PROJECT_ROOT || process.cwd();
  const { prompt = '', description = '', subagent_type = 'unknown' } = parameters;

  // Extract task ID from prompt
  const taskId = extractTaskId(prompt);

  // Load existing tasks
  const tasks = loadTasks(projectRoot);

  if (tasks.length === 0) {
    const reason = 'No tasks file found. Cannot spawn agent without TaskCreate first.';
    logSpawnAttempt(projectRoot, {
      tool,
      taskId: taskId || 'none',
      allowed: false,
      reason,
      agentType: subagent_type,
    });
    return { allowed: false, reason };
  }

  // Try to find task by ID
  let matchedTask = null;
  if (taskId) {
    matchedTask = findTaskById(tasks, taskId);
  }

  // Fallback: Try keyword matching
  if (!matchedTask) {
    matchedTask = matchTaskByDescription(tasks, description || prompt);
  }

  if (!matchedTask) {
    const reason = taskId
      ? `Task #${taskId} not found in tasks.json. Create task with TaskCreate before spawning.`
      : 'Cannot spawn agent without TaskCreate first. Expected task ID in prompt (e.g., "Task #72").';

    logSpawnAttempt(projectRoot, {
      tool,
      taskId: taskId || 'none',
      allowed: false,
      reason,
      agentType: subagent_type,
      attemptedMatch: description.substring(0, 100),
    });

    return { allowed: false, reason };
  }

  // Task found - allow spawn
  logSpawnAttempt(projectRoot, {
    tool,
    taskId: matchedTask.id,
    allowed: true,
    reason: `Matched task #${matchedTask.id}: ${matchedTask.subject}`,
    agentType: subagent_type,
  });

  return { allowed: true };
}

module.exports = { PreToolUse };
