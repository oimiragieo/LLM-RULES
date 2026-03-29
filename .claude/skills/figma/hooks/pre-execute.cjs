'use strict';
/**
 * Pre-execute hook for figma
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'figma: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
