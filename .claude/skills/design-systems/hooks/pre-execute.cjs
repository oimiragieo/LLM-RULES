'use strict';
/**
 * Pre-execute hook for design-systems
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'design-systems: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
