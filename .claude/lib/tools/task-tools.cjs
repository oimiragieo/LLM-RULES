/**
 * Task Tool - Spawns subagents for complex tasks
 * ==============================================
 *
 * Allows agents to delegate work to specialized subagents.
 * This is a core tool for the multi-agent orchestration system.
 */

'use strict';

const path = require('path');
const { PROJECT_ROOT: _PROJECT_ROOT } = require('../utils/project-root.cjs');
const { assembleSpawnPrompt } = require('../spawn/prompt-assembler.cjs');

/**
 * Task Tool Function
 *
 * Spawns a subagent to handle a specific task.
 *
 * @param {Object} params
 * @param {string} params.subagent_type - Type of agent to spawn (e.g., 'developer', 'architect')
 * @param {string} params.description - Brief description of the task
 * @param {string} params.prompt - Detailed prompt for the subagent
 * @param {string[]} params.allowed_tools - Tools the subagent should have access to
 * @param {string} params.model - Model to use for the subagent
 * @param {string} params.task_id - Unique identifier for this task
 * @returns {Promise<Object>} Result of the task execution
 */
async function Task({
  subagent_type,
  description,
  prompt,
  allowed_tools = [],
  _model,
  task_id
}) {
  if (!subagent_type) {
    throw new Error('subagent_type is required');
  }
  if (!description) {
    throw new Error('description is required');
  }
  if (!prompt) {
    throw new Error('prompt is required');
  }

  console.log(`[Task Tool] Spawning ${subagent_type} agent for: ${description}`);

  try {
    // Assemble the complete spawn prompt with tools and skills
    const assembledPrompt = assembleSpawnPrompt({
      agentType: subagent_type,
      allowedTools: allowed_tools,
      basePrompt: prompt,
      includeMemory: true,
    });

    // In a real implementation, this would spawn an actual subagent
    // For now, we'll simulate the spawn and return a success result
    console.log(`[Task Tool] Would spawn ${subagent_type} with prompt length: ${assembledPrompt.length}`);

    // Simulate task execution
    const result = {
      status: 'completed',
      agent: subagent_type,
      task_id: task_id || `task-${Date.now()}`,
      description,
      result: `Task completed by ${subagent_type} agent`,
      tools_used: allowed_tools,
    };

    return result;

  } catch (error) {
    console.error('[Task Tool] Error:', error);
    return {
      status: 'error',
      agent: subagent_type,
      task_id: task_id || `task-${Date.now()}`,
      description,
      error: error.message,
    };
  }
}

/**
 * TaskCreate Tool - Creates trackable tasks
 */
async function TaskCreate({ subject, description, priority = 'medium' }) {
  console.log(`[TaskCreate] Creating task: ${subject}`);

  const task = {
    id: `task-${Date.now()}`,
    subject,
    description,
    priority,
    status: 'created',
    created_at: new Date().toISOString(),
  };

  return task;
}

/**
 * TaskUpdate Tool - Updates task status and metadata
 */
async function TaskUpdate({ taskId, status, metadata = {} }) {
  console.log(`[TaskUpdate] Updating task ${taskId} to status: ${status}`);

  const update = {
    task_id: taskId,
    status,
    metadata,
    updated_at: new Date().toISOString(),
  };

  return update;
}

/**
 * TaskList Tool - Lists available tasks
 */
async function TaskList({ status, limit = 10 } = {}) {
  console.log(`[TaskList] Listing tasks with status: ${status || 'all'}`);

  // Simulate task list
  const tasks = [
    {
      id: 'task-1',
      subject: 'Fix reflection deadlock',
      status: 'completed',
      priority: 'high',
    },
    {
      id: 'task-2',
      subject: 'Implement Task tool',
      status: 'in_progress',
      priority: 'high',
    },
  ];

  return {
    tasks: tasks.filter(task => !status || task.status === status).slice(0, limit),
    total: tasks.length,
  };
}

/**
 * TaskGet Tool - Gets details of a specific task
 */
async function TaskGet({ taskId }) {
  console.log(`[TaskGet] Getting details for task: ${taskId}`);

  // Simulate task retrieval
  return {
    id: taskId,
    subject: 'Sample task',
    description: 'Task description',
    status: 'in_progress',
    priority: 'medium',
    created_at: new Date().toISOString(),
  };
}

module.exports = {
  Task,
  TaskCreate,
  TaskUpdate,
  TaskList,
  TaskGet,
};