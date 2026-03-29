'use strict';
/**
 * Pre-execute hook for session-log-analyzer
 *
 * Validates inputs before skill execution.
 */

function preExecute(context) {
  // Validate skill invocation context
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'session-log-analyzer: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
