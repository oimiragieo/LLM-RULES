'use strict';
/**
 * Pre-execute hook for arxiv-monitor
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'arxiv-monitor: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
