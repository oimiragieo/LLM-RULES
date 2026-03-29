#!/usr/bin/env node
'use strict';

/**
 * A2A Dispatch Module
 * ==================
 *
 * Provides A2A-based task dispatch for router-to-channel-session communication.
 *
 * When A2A_AUTO_START=true and the target is a channel session, this module
 * uses A2AClient to send tasks to the channel session's A2A server.
 *
 * Falls back to file-based IPC when A2A is not available.
 *
 * Usage:
 *   const { dispatchToChannelSession, isA2AAvailable } = require('./a2a-dispatch.cjs');
 *
 *   // Dispatch a task to channel session
 *   const result = await dispatchToChannelSession({
 *     target: 'channel-responder',
 *     input: 'What is the current git status?',
 *     context: { sessionId: 'session-123' }
 *   });
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// Lazy-loaded A2A client (initialized only when needed)
let _a2aClient = null;
let _a2aClientError = null;

// Configuration
const A2A_DEFAULT_PORT = 3100;
const A2A_DEFAULT_TIMEOUT = 30000;

const ROOT = path.resolve(__dirname, '..', '..', '..');
const _RUNTIME_DIR = path.join(ROOT, '.claude', 'context', 'runtime');
const TELEGRAM_CMD_QUEUE = path.join(
  ROOT,
  '.claude',
  'context',
  'tmp',
  'telegram-command-queue.json'
);

/**
 * Get the A2A port from environment or default.
 * @returns {number}
 */
function getA2APort() {
  const port = parseInt(process.env.A2A_PORT || String(A2A_DEFAULT_PORT), 10);
  return isNaN(port) ? A2A_DEFAULT_PORT : port;
}

/**
 * Check if A2A auto-start is enabled.
 * @returns {boolean}
 */
function isA2AEnabled() {
  return (process.env.A2A_AUTO_START || 'false').trim().toLowerCase() === 'true';
}

/**
 * Check if A2A server is reachable.
 * Makes a lightweight HTTP request to the agent card endpoint.
 *
 * @param {number} [timeoutMs=2000] - Timeout for the check
 * @returns {Promise<boolean>}
 */
async function isA2AReachable(timeoutMs = 2000) {
  const port = getA2APort();

  return new Promise(resolve => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path: '/.well-known/agent.json',
        method: 'GET',
        timeout: timeoutMs,
      },
      res => {
        resolve(res.statusCode === 200);
      }
    );

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Get or create the A2A client instance.
 * Lazy initialization - only creates client when first needed.
 *
 * @returns {object|null} A2AClient instance or null if initialization failed
 */
function getA2AClient() {
  if (_a2aClient) return _a2aClient;
  if (_a2aClientError) return null;

  try {
    // Dynamic import to avoid loading A2A client unless needed
    const { A2AClient } = require('../a2a/client.cjs');
    const port = getA2APort();
    const timeout = parseInt(process.env.A2A_TIMEOUT_MS || String(A2A_DEFAULT_TIMEOUT), 10);

    _a2aClient = new A2AClient({
      baseUrl: `http://localhost:${port}`,
      timeout: isNaN(timeout) ? A2A_DEFAULT_TIMEOUT : timeout,
    });

    return _a2aClient;
  } catch (err) {
    _a2aClientError = err;
    process.stderr.write(`[a2a-dispatch] Failed to initialize A2A client: ${err.message}\n`);
    return null;
  }
}

/**
 * Check if the target agent is a channel session type.
 *
 * @param {string} target - Agent type to check
 * @returns {boolean}
 */
function isChannelSessionTarget(target) {
  if (!target || typeof target !== 'string') return false;
  const normalized = target.trim().toLowerCase();
  return normalized === 'channel-responder' || normalized === 'channel_session';
}

/**
 * Dispatch a task to the channel session via A2A.
 *
 * @param {object} options
 * @param {string} options.target - Target agent type (e.g., 'channel-responder')
 * @param {string} options.input - Task input/prompt
 * @param {object} [options.context] - Additional context (sessionId, source, etc.)
 * @param {string} [options.taskId] - Optional task ID
 * @returns {Promise<{success: boolean, taskId?: string, error?: string, method: string}>}
 */
async function dispatchViaA2A({ target, input, context = {}, taskId }) {
  const client = getA2AClient();
  if (!client) {
    return {
      success: false,
      error: 'A2A client not initialized',
      method: 'a2a',
    };
  }

  try {
    const task = await client.sendTask({
      input,
      context: {
        source: 'router',
        target,
        ...context,
      },
      id: taskId,
    });

    return {
      success: true,
      taskId: task.id,
      status: task.status,
      method: 'a2a',
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      method: 'a2a',
    };
  }
}

/**
 * Dispatch a task to the channel session via file-based IPC.
 * Writes to the telegram command queue file.
 *
 * @param {object} options
 * @param {string} options.target - Target agent type
 * @param {string} options.input - Task input/prompt
 * @param {object} [options.context] - Additional context
 * @param {string} [options.taskId] - Optional task ID
 * @returns {Promise<{success: boolean, taskId?: string, error?: string, method: string}>}
 */
async function dispatchViaFileIPC({ target, input, context = {}, taskId }) {
  try {
    const id = taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id,
      target,
      input,
      context: {
        source: 'router',
        ...context,
      },
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    // Read existing queue
    let queue = [];
    if (fs.existsSync(TELEGRAM_CMD_QUEUE)) {
      try {
        const raw = fs.readFileSync(TELEGRAM_CMD_QUEUE, 'utf8');
        queue = safeParseJSON(raw);
        if (!Array.isArray(queue)) queue = [];
      } catch (_) {
        queue = [];
      }
    }

    // Append entry
    queue.push(entry);

    // Ensure directory exists
    const dir = path.dirname(TELEGRAM_CMD_QUEUE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write atomically
    const tempPath = TELEGRAM_CMD_QUEUE + '.tmp.' + process.pid;
    fs.writeFileSync(tempPath, JSON.stringify(queue, null, 2), 'utf8');
    fs.renameSync(tempPath, TELEGRAM_CMD_QUEUE);

    return {
      success: true,
      taskId: id,
      method: 'file-ipc',
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      method: 'file-ipc',
    };
  }
}

/**
 * Dispatch a task to the channel session.
 *
 * Tries A2A first if enabled and reachable, falls back to file-based IPC.
 *
 * @param {object} options
 * @param {string} options.target - Target agent type (e.g., 'channel-responder')
 * @param {string} options.input - Task input/prompt
 * @param {object} [options.context] - Additional context (sessionId, source, etc.)
 * @param {string} [options.taskId] - Optional task ID
 * @param {boolean} [options.forceA2A=false] - Force A2A dispatch (skip fallback)
 * @param {boolean} [options.forceFileIPC=false] - Force file IPC dispatch
 * @returns {Promise<{success: boolean, taskId?: string, error?: string, method: string, fallback?: boolean}>}
 */
async function dispatchToChannelSession(options) {
  const { target, input, context = {}, taskId, forceA2A = false, forceFileIPC = false } = options;

  // Validate target
  if (!isChannelSessionTarget(target)) {
    return {
      success: false,
      error: `Invalid target for channel dispatch: ${target}`,
      method: 'none',
    };
  }

  // Force file IPC if requested
  if (forceFileIPC) {
    return dispatchViaFileIPC({ target, input, context, taskId });
  }

  // Check if A2A is available
  const a2aEnabled = isA2AEnabled();
  const a2aReachable = a2aEnabled && (await isA2AReachable());

  // Try A2A first if available
  if (a2aReachable || forceA2A) {
    const result = await dispatchViaA2A({ target, input, context, taskId });

    if (result.success || forceA2A) {
      return result;
    }

    // A2A failed but not forced - fall back to file IPC
    if (!forceA2A) {
      process.stderr.write(
        `[a2a-dispatch] A2A dispatch failed (${result.error}), falling back to file IPC\n`
      );
      const fallbackResult = await dispatchViaFileIPC({ target, input, context, taskId });
      return { ...fallbackResult, fallback: true };
    }
  }

  // A2A not available - use file IPC
  if (a2aEnabled && !a2aReachable) {
    process.stderr.write('[a2a-dispatch] A2A not reachable, falling back to file IPC\n');
    const fallbackResult = await dispatchViaFileIPC({ target, input, context, taskId });
    return { ...fallbackResult, fallback: true };
  }

  return dispatchViaFileIPC({ target, input, context, taskId });
}

/**
 * Poll for the result of a dispatched task.
 *
 * @param {string} taskId - Task ID to poll
 * @param {object} [options]
 * @param {number} [options.timeout=30000] - Max time to wait
 * @param {number} [options.interval=1000] - Polling interval
 * @returns {Promise<{success: boolean, status?: string, result?: any, error?: string}>}
 */
async function pollTaskResult(taskId, options = {}) {
  const { timeout = 30000, interval = 1000 } = options;
  const startTime = Date.now();

  // Try A2A first
  const client = getA2AClient();
  if (client) {
    while (Date.now() - startTime < timeout) {
      try {
        const task = await client.getTask(taskId);
        if (!task) {
          return { success: false, error: 'Task not found' };
        }

        if (task.status === 'completed') {
          return {
            success: true,
            status: 'completed',
            result: task.result,
          };
        }

        if (task.status === 'failed') {
          return {
            success: false,
            status: 'failed',
            error: task.error || 'Task failed',
          };
        }

        if (task.status === 'canceled') {
          return {
            success: false,
            status: 'canceled',
            error: 'Task was canceled',
          };
        }

        // Still working - wait and retry
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (_) {
        // A2A polling failed - fall through to file IPC check
        break;
      }
    }
  }

  // Fall back to checking file IPC queue
  while (Date.now() - startTime < timeout) {
    if (fs.existsSync(TELEGRAM_CMD_QUEUE)) {
      try {
        const raw = fs.readFileSync(TELEGRAM_CMD_QUEUE, 'utf8');
        const queue = safeParseJSON(raw);
        if (Array.isArray(queue)) {
          const entry = queue.find(e => e.id === taskId);
          if (entry) {
            if (entry.status === 'completed') {
              return {
                success: true,
                status: 'completed',
                result: entry.result,
              };
            }
            if (entry.status === 'failed') {
              return {
                success: false,
                status: 'failed',
                error: entry.error || 'Task failed',
              };
            }
          }
        }
      } catch (_) {
        // Ignore read errors
      }
    }

    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return {
    success: false,
    error: 'Polling timeout',
  };
}

/**
 * Cancel a dispatched task.
 *
 * @param {string} taskId - Task ID to cancel
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function cancelTask(taskId) {
  // Try A2A first
  const client = getA2AClient();
  if (client) {
    try {
      const task = await client.cancelTask(taskId);
      return { success: true, status: task.status };
    } catch (_) {
      // Fall through to file IPC
    }
  }

  // Update file IPC queue
  if (fs.existsSync(TELEGRAM_CMD_QUEUE)) {
    try {
      const raw = fs.readFileSync(TELEGRAM_CMD_QUEUE, 'utf8');
      const queue = safeParseJSON(raw);
      if (Array.isArray(queue)) {
        const updated = queue.map(e => (e.id === taskId ? { ...e, status: 'canceled' } : e));
        const tempPath = TELEGRAM_CMD_QUEUE + '.tmp.' + process.pid;
        fs.writeFileSync(tempPath, JSON.stringify(updated, null, 2), 'utf8');
        fs.renameSync(tempPath, TELEGRAM_CMD_QUEUE);
        return { success: true };
      }
    } catch (_) {
      // Ignore errors
    }
  }

  return { success: false, error: 'Task not found or cannot cancel' };
}

/**
 * Get the current A2A availability status.
 * Use this for health checks and routing decisions.
 *
 * @returns {Promise<{enabled: boolean, reachable: boolean, port: number}>}
 */
async function getA2AStatus() {
  const enabled = isA2AEnabled();
  const port = getA2APort();
  const reachable = enabled && (await isA2AReachable());

  return {
    enabled,
    reachable,
    port,
  };
}

/**
 * Reset the A2A client (for testing or after errors).
 */
function resetA2AClient() {
  _a2aClient = null;
  _a2aClientError = null;
}

module.exports = {
  // Primary API
  dispatchToChannelSession,
  pollTaskResult,
  cancelTask,

  // Status checks
  isA2AEnabled,
  isA2AReachable,
  isChannelSessionTarget,
  getA2AStatus,

  // Low-level dispatch methods
  dispatchViaA2A,
  dispatchViaFileIPC,

  // Client management
  getA2AClient,
  resetA2AClient,

  // Configuration
  getA2APort,
};
