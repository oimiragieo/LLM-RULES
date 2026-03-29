'use strict';
/**
 * Post-execute hook for token-saver-context-compression
 */

function postExecute(_context) {
  return { ok: true, skill: 'token-saver-context-compression' };
}

module.exports = { postExecute };
