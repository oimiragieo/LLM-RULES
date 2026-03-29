'use strict';
/**
 * Pre-execute hook for model-benchmark
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'model-benchmark: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
