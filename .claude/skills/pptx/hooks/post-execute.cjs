'use strict';
/**
 * Post-execute hook for pptx
 */

function postExecute(_context) {
  return { ok: true, skill: 'pptx' };
}

module.exports = { postExecute };
