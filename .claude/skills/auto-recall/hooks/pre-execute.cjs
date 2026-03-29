'use strict';
/**
 * Pre-execute hook for auto-recall
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'auto-recall: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
