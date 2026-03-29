'use strict';
/**
 * Post-execute hook for auto-recall
 */

function postExecute(_context) {
  return { ok: true, skill: 'auto-recall' };
}

module.exports = { postExecute };
