#!/usr/bin/env node
/**
 * worker-pool-start.mjs
 * =====================
 * CLI entry point for the async worker pool.
 *
 * Usage:
 *   node scripts/worker-pool-start.mjs --workers 3
 *
 * Options:
 *   --workers <n>   Maximum concurrent workers (default: 3)
 *   --tpm <n>       Max tokens per minute budget (default: 400000)
 *   --db <path>     Absolute path to SQLite DB file (default: runtime path)
 *   --help          Print this help text
 */

import { createRequire } from 'module';
import { parseArgs } from 'util';

const require = createRequire(import.meta.url);

const { WorkerPool } = require('../.claude/lib/workers/worker-pool.cjs');
const { BudgetEnforcementService } = require('../.claude/lib/workers/budget-enforcement.cjs');
const { getDb, runMigrations, closeAllDbs } = require('../.claude/lib/db/sqlite-manager.cjs');

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    workers: { type: 'string', default: '3' },
    tpm: { type: 'string', default: '400000' },
    db: { type: 'string', default: '' },
    help: { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  process.stdout.write(
    [
      'Usage: node scripts/worker-pool-start.mjs [options]',
      '',
      'Options:',
      '  --workers <n>   Max concurrent workers (default: 3)',
      '  --tpm <n>       Max tokens per minute (default: 400000)',
      '  --db <path>     Path to SQLite DB file',
      '  --help          Show this help',
      '',
    ].join('\n')
  );
  process.exit(0);
}

const maxWorkers = Math.max(1, parseInt(args.workers, 10) || 3);
const maxTokensPerMinute = Math.max(1000, parseInt(args.tpm, 10) || 400000);
const dbPath = args.db || undefined;

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

process.stdout.write(
  `[worker-pool] starting — workers: ${maxWorkers}, tpm: ${maxTokensPerMinute}\n`
);

const db = getDb(dbPath);
runMigrations(db);

const budget = new BudgetEnforcementService({ maxTokensPerMinute, maxConcurrentWorkers: maxWorkers });

/**
 * Default processFn — replace with real processing logic in production.
 * Logs the message and completes immediately.
 *
 * @param {object} row
 */
async function defaultProcessFn(row) {
  process.stdout.write(`[worker-pool] processing message ${row.id} chat=${row.chat_id}\n`);
  // Real implementation: call AI handler, persist results, etc.
}

const pool = new WorkerPool({
  db,
  budget,
  concurrency: maxWorkers,
  processFn: defaultProcessFn,
});

pool.on('worker-done', ({ id }) => {
  process.stdout.write(`[worker-pool] done: ${id}\n`);
});

pool.on('worker-error', ({ id, error }) => {
  process.stderr.write(`[worker-pool] error: ${id} — ${error.message}\n`);
});

pool.start();
process.stdout.write('[worker-pool] running — waiting for messages\n');

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(signal) {
  process.stdout.write(`[worker-pool] received ${signal}, shutting down...\n`);
  pool.stop();
  closeAllDbs();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Log stats every 60 seconds for operational visibility
setInterval(() => {
  const stats = pool.getStats();
  process.stdout.write(
    `[worker-pool] stats — activeWorkers: ${stats.activeWorkers}, ` +
      `tpmUsed: ${stats.budgetStats.currentMinuteUsage}/${stats.budgetStats.maxTokensPerMinute}\n`
  );
}, 60000).unref();
