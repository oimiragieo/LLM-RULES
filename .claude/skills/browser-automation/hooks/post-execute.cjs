'use strict';
/**
 * Post-execute hook for browser-automation
 */

function postExecute(_context) {
  return { ok: true, skill: 'browser-automation' };
}

module.exports = { postExecute };
