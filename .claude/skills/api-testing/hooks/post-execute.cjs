'use strict';
/**
 * Post-execute hook for api-testing
 */

function postExecute(_context) {
  return { ok: true, skill: 'api-testing' };
}

module.exports = { postExecute };
