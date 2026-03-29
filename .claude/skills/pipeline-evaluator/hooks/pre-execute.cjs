'use strict';
/**
 * Pre-execute hook for pipeline-evaluator
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'pipeline-evaluator: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
