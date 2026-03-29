'use strict';
/**
 * Post-execute hook for system-health-check
 */

function postExecute(_context) {
  return { ok: true, skill: 'system-health-check' };
}

module.exports = { postExecute };
