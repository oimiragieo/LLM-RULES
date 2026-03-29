'use strict';
/**
 * Post-execute hook for context-attribution
 */

function postExecute(_context) {
  return { ok: true, skill: 'context-attribution' };
}

module.exports = { postExecute };
