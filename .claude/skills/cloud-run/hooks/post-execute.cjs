'use strict';
/**
 * Post-execute hook for cloud-run
 */

function postExecute(_context) {
  return { ok: true, skill: 'cloud-run' };
}

module.exports = { postExecute };
