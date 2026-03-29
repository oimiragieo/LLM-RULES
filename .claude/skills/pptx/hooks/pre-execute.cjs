'use strict';
/**
 * Pre-execute hook for pptx
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'pptx: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
