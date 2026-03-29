'use strict';
/**
 * Post-execute hook for mcp-catalog
 */

function postExecute(_context) {
  return { ok: true, skill: 'mcp-catalog' };
}

module.exports = { postExecute };
