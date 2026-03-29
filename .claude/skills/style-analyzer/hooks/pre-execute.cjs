'use strict';
/**
 * Pre-execute hook for style-analyzer
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'style-analyzer: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
