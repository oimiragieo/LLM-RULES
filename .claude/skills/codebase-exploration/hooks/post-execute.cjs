'use strict';
/**
 * Post-execute hook for codebase-exploration
 */

function postExecute(_context) {
  return { ok: true, skill: 'codebase-exploration' };
}

module.exports = { postExecute };
