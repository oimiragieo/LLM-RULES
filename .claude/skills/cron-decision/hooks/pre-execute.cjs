'use strict';
/**
 * Pre-execute hook for cron-decision
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'cron-decision: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
