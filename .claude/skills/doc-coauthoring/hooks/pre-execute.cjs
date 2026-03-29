'use strict';
/**
 * Pre-execute hook for doc-coauthoring
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'doc-coauthoring: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
