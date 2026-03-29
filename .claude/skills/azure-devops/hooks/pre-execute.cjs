'use strict';
/**
 * Pre-execute hook for azure-devops
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'azure-devops: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
