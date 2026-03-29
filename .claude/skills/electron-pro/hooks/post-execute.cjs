'use strict';
/**
 * Post-execute hook for electron-pro
 */

function postExecute(_context) {
  return { ok: true, skill: 'electron-pro' };
}

module.exports = { postExecute };
