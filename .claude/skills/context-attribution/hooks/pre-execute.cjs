'use strict';
/**
 * Pre-execute hook for context-attribution
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'context-attribution: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
