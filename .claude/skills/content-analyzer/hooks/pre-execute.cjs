'use strict';
/**
 * Pre-execute hook for content-analyzer
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'content-analyzer: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
