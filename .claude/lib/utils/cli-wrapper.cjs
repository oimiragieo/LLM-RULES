'use strict';

/**
 * Standard wrapper for CLI tools to ensure consistent error handling and exit codes.
 * SEC-CLI-001: Provides safe execution with automated error reporting.
 */

const { auditLog } = require('./hook-input.cjs');

/**
 * Wraps an async CLI function with standard error handling.
 * @param {Function} fn - The async function to wrap
 * @param {string} toolName - Name of the tool for logging
 * @returns {Function} Wrapped function
 */
function wrapCLITool(fn, toolName = 'cli-tool') {
  return async function(...args) {
    try {
      const result = await fn(...args);
      if (result && typeof result === 'object' && result.ok === false) {
        throw new Error(result.error || result.message || 'Unknown tool error');
      }
      return result;
    } catch (err) {
      console.error(`
❌ Error [${toolName}]: ${err.message}`);
      
      if (process.env.DEBUG_HOOKS === 'true' && err.stack) {
        console.error(err.stack);
      }

      auditLog(toolName, 'error', {
        message: err.message,
        stack: process.env.DEBUG_HOOKS === 'true' ? err.stack : undefined
      });

      process.exit(err.exitCode || 1);
    }
  };
}

module.exports = {
  wrapCLITool
};
