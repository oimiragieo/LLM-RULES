'use strict';
/**
 * Pre-execute hook for browser-automation
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'browser-automation: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
