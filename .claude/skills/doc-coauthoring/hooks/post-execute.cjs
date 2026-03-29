'use strict';
/**
 * Post-execute hook for doc-coauthoring
 */

function postExecute(_context) {
  return { ok: true, skill: 'doc-coauthoring' };
}

module.exports = { postExecute };
