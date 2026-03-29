'use strict';
/**
 * Pre-execute hook for electron-pro
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'electron-pro: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
