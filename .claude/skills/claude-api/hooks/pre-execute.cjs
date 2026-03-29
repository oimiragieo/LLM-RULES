'use strict';
/**
 * Pre-execute hook for claude-api
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'claude-api: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
