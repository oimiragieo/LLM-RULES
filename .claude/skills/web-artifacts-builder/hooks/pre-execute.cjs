'use strict';
/**
 * Pre-execute hook for web-artifacts-builder
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'web-artifacts-builder: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
