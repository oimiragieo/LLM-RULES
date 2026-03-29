'use strict';
/**
 * Pre-execute hook for token-saver-memory-dedup
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'token-saver-memory-dedup: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
