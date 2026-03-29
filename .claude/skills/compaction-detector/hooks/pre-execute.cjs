'use strict';
/**
 * Pre-execute hook for compaction-detector
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'compaction-detector: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
