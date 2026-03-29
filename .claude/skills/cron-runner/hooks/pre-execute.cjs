'use strict';
/**
 * Pre-execute hook for cron-runner
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'cron-runner: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
