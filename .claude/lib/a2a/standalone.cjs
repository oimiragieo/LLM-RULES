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
      processFn: async row => {
        // row contains: id, chat_id, user_id, text, attachments, timestamp, status, attempt_count
        // text is JSON.stringify(a2aTaskParams) from server.cjs enqueueMessage call.
        // safeParseJSON returns the parsed object directly (or an empty object on
        // parse failure), NOT a {success, data} envelope.
        const parsed = safeParseJSON(row.text, null);
        const taskParams =
          parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0
            ? parsed
            : { raw: row.text };
        process.stderr.write(
          `[A2A] Processing queued message ${row.id} (attempt ${row.attempt_count || 1})\n`
        );
        // TODO: Wire to agent dispatch (e.g., spawn Claude CLI subprocess for the task)
        // For now, log the task params so the queue drains correctly
        process.stderr.write(`[A2A] Task params: ${JSON.stringify(taskParams).slice(0, 200)}\n`);
      },
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

main().catch(err => {
  process.stderr.write(`[A2A] Fatal error: ${err.message}\n`);
  process.exit(1);
});
