'use strict';
/**
 * Post-execute hook for web-artifacts-builder
 */

function postExecute(_context) {
  return { ok: true, skill: 'web-artifacts-builder' };
}

module.exports = { postExecute };
