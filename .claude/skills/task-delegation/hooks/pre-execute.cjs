'use strict';
/**
 * Pre-execute hook for task-delegation
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'task-delegation: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
