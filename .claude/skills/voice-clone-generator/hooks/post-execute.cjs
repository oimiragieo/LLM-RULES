'use strict';
/**
 * Post-execute hook for voice-clone-generator
 */

function postExecute(_context) {
  return { ok: true, skill: 'voice-clone-generator' };
}

module.exports = { postExecute };
