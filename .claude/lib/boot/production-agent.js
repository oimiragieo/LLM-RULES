/**
 * Production Agent Entry Point
 * ============================
 *
 * Delegates to the worker runtime for headless operation.
 * This keeps agent:production functional without introducing a second runtime loop.
 */

'use strict';

process.env.WORKER_ENABLED = process.env.WORKER_ENABLED || '1';
const { start, stop } = require('./worker-agent.cjs');

// Start the worker loop
start().catch(err => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'fatal',
      message: 'Failed to start production agent',
      error: err.message,
    })
  );
  process.exit(1);
});

// Graceful shutdown propagation
const shutdown = async signal => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Received ${signal}, shutting down production agent...`,
    })
  );

  await stop();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
