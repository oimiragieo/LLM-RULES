'use strict';
/**
 * Post-execute hook for cron-runner
 */

function postExecute(_context) {
  return { ok: true, skill: 'cron-runner' };
}

module.exports = { postExecute };
