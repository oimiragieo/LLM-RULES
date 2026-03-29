'use strict';
/**
 * Post-execute hook for scheduled-tasks
 */

function postExecute(_context) {
  return { ok: true, skill: 'scheduled-tasks' };
}

module.exports = { postExecute };
