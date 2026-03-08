/**
 * Task Tool - Spawns subagents for complex tasks
 * ==============================================
 *
 * Allows agents to delegate work to specialized subagents.
 * This is a core tool for the multi-agent orchestration system.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const lockfile = require('proper-lockfile');
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

    const resolvedTaskId = task_id || `task-${crypto.randomUUID()}`;
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
      task_id: task_id || `task-${crypto.randomUUID()}`,
      description,
      error: error.message,
    };
  } finally {
    cleanupSharedStores();
  }
}

// ---------------------------------------------------------------------------
// Persistent task storage (file-based, for lib/tools usage)
// Host-provided Task* tools are separate; this lib provides file-backed
// persistence for scenarios where the host tools are unavailable.
// ---------------------------------------------------------------------------

const TASK_STORE_PATH =
  require.resolve !== undefined
    ? path.join(__dirname, '..', '..', 'context', 'runtime', 'tasks.json')
    : null;

function loadTaskStore() {
  const storePath = TASK_STORE_PATH;
  if (!storePath) return { tasks: [] };
  try {
    if (fs.existsSync(storePath)) {
      const raw = fs.readFileSync(storePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (_e) {
    /* ignore */
  }
  return { tasks: [] };
}

function saveTaskStore(store) {
  const storePath = TASK_STORE_PATH;
  if (!storePath) return;
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

/**
 * Perform an async read-modify-write on the task store under a file lock.
 * The callback receives the current store and must return the modified store.
 * This prevents TOCTOU races under concurrent TaskCreate / TaskUpdate calls.
 *
 * @param {function(Object): Promise<Object>|Object} fn - Receives store, returns/mutates store
 * @returns {Promise<*>} Return value of fn (the mutated store or derived value)
 */
async function withTaskStoreLock(fn) {
  const storePath = TASK_STORE_PATH;
  if (!storePath) return await fn({ tasks: [] });

  let release = null;
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });

    // Ensure file exists before locking (lockfile requires the file to exist)
    if (!fs.existsSync(storePath)) {
      fs.writeFileSync(storePath, JSON.stringify({ tasks: [] }), 'utf8');
    }

    try {
      release = await lockfile.lock(storePath, {
        retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 },
      });
    } catch (lockErr) {
      console.error(
        `[TaskStore] CRITICAL: Failed to acquire lock after retries: ${lockErr.message}`
      );
      throw new Error(`Could not acquire lock for tasks.json: ${lockErr.message}`);
    }

    // Read inside the lock so we get the authoritative current state
    let store = { tasks: [] };
    try {
      const raw = fs.readFileSync(storePath, 'utf8');
      store = JSON.parse(raw);
    } catch (parseErr) {
      console.warn(
        `[TaskStore] Failed to read or parse tasks.json: ${parseErr.message}, starting fresh`
      );
      /* start fresh if unreadable */
    }

    const result = await fn(store);
    saveTaskStore(store);
    return result;
  } finally {
    if (release) {
      try {
        await release();
      } catch (_e) {
        /* ignore */
      }
    }
  }
}

/**
 * TaskCreate Tool - Creates trackable tasks with persistent storage
 */
async function TaskCreate({ subject, description, priority = 'medium' }) {
  process.stderr.write(`[TaskCreate] Creating task: ${subject}\n`);

  const task = {
    id: `task-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    subject,
    description,
    priority,
    status: 'created',
    created_at: new Date().toISOString(),
  };

  await withTaskStoreLock(async store => {
    store.tasks.push(task);
  });

  return task;
}

/**
 * TaskUpdate Tool - Updates task status and metadata with persistence
 */
async function TaskUpdate({ taskId, status, metadata = {} }) {
  process.stderr.write(`[TaskUpdate] Updating task ${taskId} to status: ${status}\n`);

  await withTaskStoreLock(async store => {
    const task = store.tasks.find(t => t.id === taskId);
    if (task) {
      if (status !== undefined) task.status = status;
      if (metadata && Object.keys(metadata).length > 0) {
        task.metadata = { ...(task.metadata || {}), ...metadata };
      }
      task.updated_at = new Date().toISOString();
    }
  });

  return { task_id: taskId, status, metadata, updated_at: new Date().toISOString() };
}

/**
 * TaskList Tool - Lists tasks from persistent storage
 */
async function TaskList({ status, limit = 100 } = {}) {
  process.stderr.write(`[TaskList] Listing tasks with status: ${status || 'all'}\n`);

  const store = loadTaskStore();
  const filtered = store.tasks.filter(task => !status || task.status === status).slice(0, limit);

  return { tasks: filtered, total: filtered.length };
}

/**
 * TaskGet Tool - Gets details of a specific task from persistent storage
 */
async function TaskGet({ taskId }) {
  process.stderr.write(`[TaskGet] Getting details for task: ${taskId}\n`);

  const store = loadTaskStore();
  const task = store.tasks.find(t => t.id === taskId);
  if (task) return task;

  return {
    id: taskId,
    subject: 'Unknown task',
    description: '',
    status: 'unknown',
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
