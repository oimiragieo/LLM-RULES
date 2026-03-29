'use strict';
/**
 * Pre-execute hook for adversarial-review
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'adversarial-review: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
