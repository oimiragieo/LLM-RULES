'use strict';
/**
 * Post-execute hook for task-delegation
 */

function postExecute(_context) {
  return { ok: true, skill: 'task-delegation' };
}

module.exports = { postExecute };
