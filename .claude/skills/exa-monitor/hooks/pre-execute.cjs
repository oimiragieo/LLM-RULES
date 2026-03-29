'use strict';
/**
 * Pre-execute hook for exa-monitor
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'exa-monitor: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
