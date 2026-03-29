'use strict';
/**
 * Pre-execute hook for token-saver-adaptive-ratio
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'token-saver-adaptive-ratio: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
