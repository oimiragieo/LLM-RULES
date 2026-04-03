'use strict';
/**
 * Post-execute hook for telegram-polling
 */

function postExecute(_context) {
  return { ok: true, skill: 'telegram-polling' };
}

module.exports = { postExecute };
