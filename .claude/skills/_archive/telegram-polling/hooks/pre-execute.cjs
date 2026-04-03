'use strict';
/**
 * Pre-execute hook for telegram-polling
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'telegram-polling: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
