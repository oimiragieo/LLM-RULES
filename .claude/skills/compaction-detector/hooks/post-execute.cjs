'use strict';
/**
 * Post-execute hook for compaction-detector
 */

function postExecute(_context) {
  return { ok: true, skill: 'compaction-detector' };
}

module.exports = { postExecute };
