'use strict';
/**
 * Pre-execute hook for scheduled-tasks
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'scheduled-tasks: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
