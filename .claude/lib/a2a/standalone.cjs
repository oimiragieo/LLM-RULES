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
const { createA2aServer } = require('./server.cjs');
const { getDb, runMigrations } = require('../db/sqlite-manager.cjs');
const { WorkerPool } = require('../workers/worker-pool.cjs');

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

  // Create worker pool (optional - enables task queue processing)
  let pool = null;
  try {
    pool = new WorkerPool(db, { numWorkers: 2, workerIdleTtlMs: 60000 });
  } catch (e) {
    process.stderr.write(`[A2A] WorkerPool initialization skipped: ${e.message}\n`);
  }

  // Create and start server
  const { start, stop } = createA2aServer({ port, db, pool });

  // Graceful shutdown handling
  const shutdown = async signal => {
    process.stderr.write(`[A2A] Received ${signal}, shutting down...\n`);
    try {
      await stop();
      if (pool) {
        pool.shutdown();
      }
    } catch (e) {
      process.stderr.write(`[A2A] Shutdown error: ${e.message}\n`);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

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
