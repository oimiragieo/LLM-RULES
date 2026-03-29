'use strict';
/**
 * Post-execute hook for design-systems
 */

function postExecute(_context) {
  return { ok: true, skill: 'design-systems' };
}

module.exports = { postExecute };
