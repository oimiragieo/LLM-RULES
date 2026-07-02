#!/usr/bin/env node
'use strict';

/**
 * A2A Standalone Server Entry Point
 * =================================
 *
 * Runs the A2A Express server as a standalone process.
 * Used by the auto-start hook to spawn a detached background server.
 *
 * Usage:
 *   node .claude/lib/a2a/standalone.cjs [--port PORT]
 *
 * Environment:
 *   A2A_PORT - Port to listen on (default: 3100)
 */

const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { createA2aServer } = require('./server.cjs');
const { getDb, runMigrations } = require('../db/sqlite-manager.cjs');
const { WorkerPool } = require('../workers/worker-pool.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// Parse port from args or env
function getPort() {
  // Check command line args first
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const port = parseInt(args[i + 1], 10);
      if (!isNaN(port) && port > 0 && port < 65536) {
        return port;
      }
    }
  }
  // Fall back to env var
  const envPort = parseInt(process.env.A2A_PORT || '3100', 10);
  return isNaN(envPort) ? 3100 : envPort;
}

// Load .env file (optional)
function loadEnv() {
  const fs = require('fs');
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function parseA2aTaskParams(row) {
  const parsed = safeParseJSON(row.text, null);
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
    return parsed;
  }
  return { raw: row.text };
}

function parseDispatchArgs(env = process.env) {
  const raw = env.A2A_TASK_DISPATCH_ARGS_JSON;
  if (!raw || !raw.trim()) return [];

  const parsed = safeParseJSON(raw, null);
  if (!Array.isArray(parsed) || !parsed.every(arg => typeof arg === 'string')) {
    throw new Error('A2A_TASK_DISPATCH_ARGS_JSON must be a JSON array of strings');
  }
  return parsed;
}

function getDispatchConfig(env = process.env) {
  const bin = String(env.A2A_TASK_DISPATCH_BIN || '').trim();
  if (!bin) return null;

  const timeoutMs = parseInt(env.A2A_TASK_DISPATCH_TIMEOUT_MS || '300000', 10);
  return {
    bin,
    args: parseDispatchArgs(env),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000,
  };
}

function appendBounded(current, chunk, maxChars = 65536) {
  const next = current + chunk;
  return next.length > maxChars ? next.slice(next.length - maxChars) : next;
}

function runConfiguredDispatcher(taskParams, row, { env = process.env, spawnImpl = spawn } = {}) {
  const config = getDispatchConfig(env);
  if (!config) {
    return Promise.resolve({ skipped: true });
  }

  return new Promise((resolve, reject) => {
    const childEnv = {
      ...env,
      A2A_TASK_ROW_ID: String(row.id || ''),
    };
    const child = spawnImpl(config.bin, config.args, {
      env: childEnv,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve(value);
      }
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`A2A task dispatcher timed out after ${config.timeoutMs}ms`));
    }, config.timeoutMs);
    if (timer.unref) timer.unref();

    child.stdout.on('data', chunk => {
      stdout = appendBounded(stdout, chunk.toString('utf8'));
    });
    child.stderr.on('data', chunk => {
      stderr = appendBounded(stderr, chunk.toString('utf8'));
    });
    child.on('error', err => finish(err));
    child.on('close', code => {
      if (code === 0) {
        finish(null, { skipped: false, code, stdout, stderr });
        return;
      }
      const message = stderr.trim() || stdout.trim() || `exit code ${code}`;
      finish(new Error(`A2A task dispatcher failed: ${message}`));
    });

    child.stdin.on('error', err => finish(err));
    child.stdin.end(
      JSON.stringify({
        rowId: row.id,
        taskParams,
      }) + '\n'
    );
  });
}

function buildA2aTaskProcessor({ env = process.env, spawnImpl = spawn } = {}) {
  return async row => {
    const taskParams = parseA2aTaskParams(row);
    process.stderr.write(
      `[A2A] Processing queued message ${row.id} (attempt ${row.attempt_count || 1})\n`
    );

    const dispatchResult = await runConfiguredDispatcher(taskParams, row, { env, spawnImpl });
    if (dispatchResult.skipped) {
      process.stderr.write(
        '[A2A] No task dispatcher configured; queue entry drained without agent execution\n'
      );
      process.stderr.write(`[A2A] Task params: ${JSON.stringify(taskParams).slice(0, 200)}\n`);
      return dispatchResult;
    }

    process.stderr.write(`[A2A] Task ${row.id} dispatched via configured runner\n`);
    if (dispatchResult.stderr && dispatchResult.stderr.trim()) {
      process.stderr.write(`[A2A] Dispatcher stderr: ${dispatchResult.stderr.trim()}\n`);
    }
    return dispatchResult;
  };
}

async function main() {
  loadEnv();

  const port = getPort();
  const dbPath = path.join(ROOT, '.claude', 'context', 'runtime', 'agent-studio.db');

  // Initialize database and run migrations
  const db = getDb(dbPath);
  runMigrations(db);

  // Create worker pool (enables task queue processing)
  let pool = null;
  try {
    pool = new WorkerPool({
      db,
      concurrency: 2,
      processFn: buildA2aTaskProcessor(),
    });
  } catch (e) {
    process.stderr.write(`[A2A] WorkerPool initialization failed: ${e.message}\n`);
  }

  // Create and start server
  const { start, stop } = createA2aServer({ port, db, pool });

  // Graceful shutdown handling
  const shutdown = async signal => {
    process.stderr.write(`[A2A] Received ${signal}, shutting down...\n`);
    try {
      await stop();
      if (pool) {
        pool.stop();
      }
    } catch (e) {
      process.stderr.write(`[A2A] Shutdown error: ${e.message}\n`);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Check if port is already in use before attempting to start
  const portInUse = await new Promise(resolve => {
    const tester = net
      .createServer()
      .once('error', err => {
        resolve(err.code === 'EADDRINUSE');
      })
      .once('listening', () => {
        tester.close(() => resolve(false));
      })
      .listen(port);
  });
  if (portInUse) {
    process.stderr.write(`[A2A] Port ${port} already in use, exiting cleanly\n`);
    if (pool) pool.stop();
    process.exit(0);
  }

  // Start the server
  try {
    await start();
    process.stderr.write(`[A2A] Server listening on port ${port}\n`);
  } catch (e) {
    process.stderr.write(`[A2A] Failed to start server: ${e.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`[A2A] Fatal error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  appendBounded,
  buildA2aTaskProcessor,
  getDispatchConfig,
  parseA2aTaskParams,
  parseDispatchArgs,
  runConfiguredDispatcher,
};
