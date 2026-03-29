'use strict';
/**
 * Post-execute hook for code-graph-context
 */

function postExecute(_context) {
  return { ok: true, skill: 'code-graph-context' };
}

module.exports = { postExecute };
