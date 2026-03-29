'use strict';
/**
 * Post-execute hook for claude-api
 */

function postExecute(_context) {
  return { ok: true, skill: 'claude-api' };
}

module.exports = { postExecute };
