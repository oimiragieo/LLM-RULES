'use strict';
/**
 * Post-execute hook for style-analyzer
 */

function postExecute(_context) {
  return { ok: true, skill: 'style-analyzer' };
}

module.exports = { postExecute };
