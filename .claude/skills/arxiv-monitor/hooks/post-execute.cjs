'use strict';
/**
 * Post-execute hook for arxiv-monitor
 */

function postExecute(_context) {
  return { ok: true, skill: 'arxiv-monitor' };
}

module.exports = { postExecute };
