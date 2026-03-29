'use strict';
/**
 * Pre-execute hook for ml-experiment-loop
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'ml-experiment-loop: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
