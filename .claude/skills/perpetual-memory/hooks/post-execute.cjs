'use strict';
/**
 * Post-execute hook for perpetual-memory
 */

function postExecute(_context) {
  return { ok: true, skill: 'perpetual-memory' };
}

module.exports = { postExecute };
