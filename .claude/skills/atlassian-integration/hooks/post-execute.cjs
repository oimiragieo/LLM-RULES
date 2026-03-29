'use strict';
/**
 * Post-execute hook for atlassian-integration
 */

function postExecute(_context) {
  return { ok: true, skill: 'atlassian-integration' };
}

module.exports = { postExecute };
