'use strict';
/**
 * Pre-execute hook for codebase-exploration
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'codebase-exploration: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
