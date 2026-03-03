/**
 * Task Tool - Spawns subagents for complex tasks
 * ==============================================
 *
 * Allows agents to delegate work to specialized subagents.
 * This is a core tool for the multi-agent orchestration system.
 */

'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { PROJECT_ROOT: _PROJECT_ROOT } = require('../utils/project-root.cjs');
const { assembleSpawnPrompt, assembleSpawnPromptAsync } = require('../spawn/prompt-assembler.cjs');

function cleanupSharedStores() {
  try {
    const { MemoryVectorStore } = require('../memory/lancedb-client-impl.cjs');
    if (MemoryVectorStore && typeof MemoryVectorStore.clearSharedStores === 'function') {
      MemoryVectorStore.clearSharedStores();
    }
  } catch (_err) {
    // Best effort cleanup.
  }
}

function spawnSubagentProcess({
  subagentType,
  taskId,
  description,
  promptLength,
  timeoutMs = 10000,
}) {
  return new Promise((resolve, reject) => {
    const runnerPath = path.join(__dirname, 'task-subagent-telemetry.cjs');
    const childInput = JSON.stringify({
      subagentType,
      taskId,
      description,
      promptLength,
    });

    const child = spawn(process.execPath, [runnerPath, childInput], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch (_e) {
        // Best effort.
      }
      reject(new Error(`Task tool spawn timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += String(chunk || '');
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk || '');
    });

    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Task tool subagent exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      let parsed = null;
      try {
        parsed = stdout ? JSON.parse(stdout) : null;
      } catch (parseErr) {
        reject(new Error(`Task tool failed to parse subagent output: ${parseErr.message}`));
        return;
      }

      resolve({
        pid: child.pid || null,
        exitCode: code,
        output: parsed,
        script: runnerPath,
      });
    });
  });
}

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
async function Task({ subagent_type, description, prompt, allowed_tools = [], _model, task_id }) {
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
    const ragEnabled =
      String(process.env.RAG_AT_SPAWN || 'on')
        .trim()
        .toLowerCase() !== 'off';
    const memoryQuery = ragEnabled
      ? String(description || '').trim() ||
        String(prompt || '')
          .trim()
          .slice(0, 240)
      : '';
    const assembledPrompt =
      typeof assembleSpawnPromptAsync === 'function'
        ? await assembleSpawnPromptAsync({
            agentType: subagent_type,
            allowedTools: allowed_tools,
            basePrompt: prompt,
            includeMemory: true,
            memoryQuery,
          })
        : assembleSpawnPrompt({
            agentType: subagent_type,
            allowedTools: allowed_tools,
            basePrompt: prompt,
            includeMemory: true,
          });

    const resolvedTaskId = task_id || `task-${Date.now()}`;
    const useRealSpawn =
      String(process.env.TASK_TOOL_REAL_SPAWN || 'on')
        .trim()
        .toLowerCase() !== 'off';

    if (useRealSpawn) {
      const timeoutMs = Number(process.env.TASK_TOOL_SPAWN_TIMEOUT_MS || 10000);
      const spawned = await spawnSubagentProcess({
        subagentType: subagent_type,
        taskId: resolvedTaskId,
        description,
        promptLength: assembledPrompt.length,
        timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000,
      });

      return {
        status: 'completed',
        agent: subagent_type,
        task_id: resolvedTaskId,
        description,
        result: `Task completed by ${subagent_type} agent`,
        tools_used: allowed_tools,
        spawn: {
          mode: 'process',
          pid: spawned.pid,
          exitCode: spawned.exitCode,
          script: spawned.script,
          output: spawned.output,
        },
      };
    }

    console.log(
      `[Task Tool] Simulating spawn for ${subagent_type} (prompt length: ${assembledPrompt.length})`
    );
    return {
      status: 'completed',
      agent: subagent_type,
      task_id: resolvedTaskId,
      description,
      result: `Task completed by ${subagent_type} agent`,
      tools_used: allowed_tools,
      spawn: {
        mode: 'simulated',
      },
    };
  } catch (error) {
    console.error('[Task Tool] Error:', error);
    return {
      status: 'error',
      agent: subagent_type,
      task_id: task_id || `task-${Date.now()}`,
      description,
      error: error.message,
    };
  } finally {
    cleanupSharedStores();
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
