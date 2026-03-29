'use strict';
/**
 * Pre-execute hook for memory-audit
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'memory-audit: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
