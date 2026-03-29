'use strict';
/**
 * Post-execute hook for feedback-analysis
 */

function postExecute(_context) {
  return { ok: true, skill: 'feedback-analysis' };
}

module.exports = { postExecute };
