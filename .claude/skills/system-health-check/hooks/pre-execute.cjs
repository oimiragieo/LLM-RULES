'use strict';
/**
 * Pre-execute hook for system-health-check
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'system-health-check: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
