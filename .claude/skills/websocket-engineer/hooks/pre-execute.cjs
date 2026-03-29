'use strict';
/**
 * Pre-execute hook for websocket-engineer
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'websocket-engineer: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
