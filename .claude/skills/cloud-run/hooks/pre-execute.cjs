'use strict';
/**
 * Pre-execute hook for cloud-run
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'cloud-run: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
