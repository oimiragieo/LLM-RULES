'use strict';
/**
 * Pre-execute hook for security-scanning
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'security-scanning: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
