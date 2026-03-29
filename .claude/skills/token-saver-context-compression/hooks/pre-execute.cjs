'use strict';
/**
 * Pre-execute hook for token-saver-context-compression
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'token-saver-context-compression: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
