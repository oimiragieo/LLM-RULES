'use strict';
/**
 * Post-execute hook for user-research
 */

function postExecute(_context) {
  return { ok: true, skill: 'user-research' };
}

module.exports = { postExecute };
