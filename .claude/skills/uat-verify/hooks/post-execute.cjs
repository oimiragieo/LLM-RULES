'use strict';
/**
 * Post-execute hook for uat-verify
 */

function postExecute(_context) {
  return { ok: true, skill: 'uat-verify' };
}

module.exports = { postExecute };
