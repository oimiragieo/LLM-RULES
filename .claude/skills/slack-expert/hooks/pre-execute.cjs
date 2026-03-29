'use strict';
/**
 * Pre-execute hook for slack-expert
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'slack-expert: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
