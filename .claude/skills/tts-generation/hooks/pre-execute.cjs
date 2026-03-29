'use strict';
/**
 * Pre-execute hook for tts-generation
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'tts-generation: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
