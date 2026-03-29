'use strict';
/**
 * Pre-execute hook for voice-clone-generator
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'voice-clone-generator: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
