'use strict';
/**
 * Post-execute hook for tts-generation
 */

function postExecute(_context) {
  return { ok: true, skill: 'tts-generation' };
}

module.exports = { postExecute };
