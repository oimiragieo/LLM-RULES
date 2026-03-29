'use strict';
/**
 * Pre-execute hook for atlassian-integration
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'atlassian-integration: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
