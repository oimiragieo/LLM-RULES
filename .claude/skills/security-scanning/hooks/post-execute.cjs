'use strict';
/**
 * Post-execute hook for security-scanning
 */

function postExecute(_context) {
  return { ok: true, skill: 'security-scanning' };
}

module.exports = { postExecute };
