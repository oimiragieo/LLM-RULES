'use strict';
/**
 * Pre-execute hook for code-graph-context
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'code-graph-context: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
