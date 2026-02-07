/**
 * Production Agent Entry Point
 * ============================
 *
 * Delegates to the worker runtime for headless operation.
 * This keeps agent:production functional without introducing a second runtime loop.
 */

'use strict';

const { createLogger } = require('../utils/logger.cjs');
const logger = createLogger('production-agent');

process.env.WORKER_ENABLED = process.env.WORKER_ENABLED || '1';
const { start, stop } = require('./worker-agent.cjs');

// Start the worker loop
start().catch(err => {
  logger.error('production_agent_start_failed', { error: err.message });
  process.exit(1);
});

// Graceful shutdown propagation
const shutdown = async signal => {
  logger.info('production_agent_shutdown', { signal });

  await stop();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
