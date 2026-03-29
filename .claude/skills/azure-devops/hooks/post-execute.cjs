'use strict';
/**
 * Post-execute hook for azure-devops
 */

function postExecute(_context) {
  return { ok: true, skill: 'azure-devops' };
}

module.exports = { postExecute };
