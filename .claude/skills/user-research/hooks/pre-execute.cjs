'use strict';
/**
 * Pre-execute hook for user-research
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'user-research: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
