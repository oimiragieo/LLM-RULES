'use strict';
/**
 * Post-execute hook for content-analyzer
 */

function postExecute(_context) {
  return { ok: true, skill: 'content-analyzer' };
}

module.exports = { postExecute };
