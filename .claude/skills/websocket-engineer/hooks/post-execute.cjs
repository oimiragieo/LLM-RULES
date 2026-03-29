'use strict';
/**
 * Post-execute hook for websocket-engineer
 */

function postExecute(_context) {
  return { ok: true, skill: 'websocket-engineer' };
}

module.exports = { postExecute };
