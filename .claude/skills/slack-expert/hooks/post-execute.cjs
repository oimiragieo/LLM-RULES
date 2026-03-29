'use strict';
/**
 * Post-execute hook for slack-expert
 */

function postExecute(_context) {
  return { ok: true, skill: 'slack-expert' };
}

module.exports = { postExecute };
