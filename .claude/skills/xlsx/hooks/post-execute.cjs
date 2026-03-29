'use strict';
/**
 * Post-execute hook for xlsx
 */

function postExecute(_context) {
  return { ok: true, skill: 'xlsx' };
}

module.exports = { postExecute };
