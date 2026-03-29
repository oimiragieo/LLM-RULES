'use strict';
/**
 * Post-execute hook for cron-decision
 */

function postExecute(_context) {
  return { ok: true, skill: 'cron-decision' };
}

module.exports = { postExecute };
