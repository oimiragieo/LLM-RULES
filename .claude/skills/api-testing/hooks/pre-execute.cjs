'use strict';
/**
 * Pre-execute hook for api-testing
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'api-testing: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
