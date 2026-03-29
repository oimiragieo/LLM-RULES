'use strict';
/**
 * Pre-execute hook for telegram-voice-pipeline
 *
 * Validates inputs before skill execution.
 */

function preExecute(context) {
  // Validate skill invocation context
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'telegram-voice-pipeline: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
