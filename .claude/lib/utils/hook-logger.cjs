'use strict';

const { createLogger } = require('./logger.cjs');

/**
 * Create a structured hook logger that writes JSON to stderr via logger.
 * @param {string} hookName
 */
function createHookLogger(hookName) {
  const logger = createLogger(`hook:${hookName}`);
  return {
    logStart(toolName, meta = {}) {
      logger.info('hook_start', { tool: toolName, ...meta });
    },
    logEnd(toolName, meta = {}) {
      logger.debug('hook_end', { tool: toolName, ...meta });
    },
    logBlock(toolName, reason, meta = {}) {
      logger.warn('hook_blocked', { tool: toolName, reason, ...meta });
    },
    logFail(toolName, err, meta = {}) {
      logger.error('hook_failed', { tool: toolName, error: err?.message, ...meta });
    },
  };
}

module.exports = { createHookLogger };
