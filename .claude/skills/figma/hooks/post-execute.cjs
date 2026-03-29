'use strict';
/**
 * Post-execute hook for figma
 */

function postExecute(_context) {
  return { ok: true, skill: 'figma' };
}

module.exports = { postExecute };
