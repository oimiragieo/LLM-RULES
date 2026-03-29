'use strict';
/**
 * Post-execute hook for exa-monitor
 */

function postExecute(_context) {
  return { ok: true, skill: 'exa-monitor' };
}

module.exports = { postExecute };
