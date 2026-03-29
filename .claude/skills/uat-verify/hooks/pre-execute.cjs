'use strict';
/**
 * Pre-execute hook for uat-verify
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'uat-verify: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
