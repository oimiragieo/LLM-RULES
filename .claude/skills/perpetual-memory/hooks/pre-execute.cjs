'use strict';
/**
 * Pre-execute hook for perpetual-memory
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'perpetual-memory: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
