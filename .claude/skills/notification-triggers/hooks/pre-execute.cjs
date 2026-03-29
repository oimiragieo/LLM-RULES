'use strict';
/**
 * Pre-execute hook for notification-triggers
 *
 * Validates inputs before skill execution.
 */

function preExecute(context) {
  // Validate skill invocation context
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'notification-triggers: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
