#!/usr/bin/env node
/**
 * A2A Server CLI Entry Point
 * ==========================
 * Usage: node scripts/a2a-server-start.mjs [--port 3100]
 *
 * Starts the A2A-compatible HTTP server with JSON-RPC 2.0 and SSE support.
 */

import { createRequire } from 'module';
import { parseArgs } from 'util';

const require = createRequire(import.meta.url);

const { createA2aServer } = require('./.claude/lib/a2a/server.cjs');
const { getDb, runMigrations } = require('./.claude/lib/db/sqlite-manager.cjs');

// ── Parse CLI args ────────────────────────────────────────────────────────────
const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '3100' },
  },
  strict: false,
});

const port = parseInt(values.port, 10) || 3100;

// ── Initialize database ───────────────────────────────────────────────────────
let db;
try {
  db = getDb();
  runMigrations(db);
  console.log('[a2a] SQLite database initialized');
} catch (err) {
  console.warn('[a2a] SQLite initialization failed (continuing without db):', err.message);
  db = null;
}

// ── Start server ──────────────────────────────────────────────────────────────
const { start, stop } = createA2aServer({ port, db });

start()
  .then(() => {
    console.log(`[a2a] Server listening on http://localhost:${port}`);
    console.log(`[a2a] Agent Card: http://localhost:${port}/.well-known/agent.json`);
    console.log(`[a2a] JSON-RPC:   http://localhost:${port}/a2a`);
    console.log(`[a2a] SSE:        http://localhost:${port}/a2a/subscribe`);
  })
  .catch(err => {
    console.error('[a2a] Failed to start server:', err.message);
    process.exit(1);
  });

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[a2a] Received ${signal}, shutting down gracefully…`);
  try {
    await stop();
    console.log('[a2a] Server closed');
  } catch (err) {
    console.error('[a2a] Error during shutdown:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
