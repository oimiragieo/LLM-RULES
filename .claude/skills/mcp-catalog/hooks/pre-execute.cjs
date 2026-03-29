'use strict';
/**
 * Pre-execute hook for mcp-catalog
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'mcp-catalog: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
