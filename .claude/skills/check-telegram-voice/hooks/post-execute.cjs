'use strict';
/**
 * Post-execute hook for telegram-voice-pipeline
 *
 * Records metrics after skill execution.
 */

function postExecute(_context) {
  // Record execution metrics
  return { ok: true, skill: 'telegram-voice-pipeline' };
}

module.exports = { postExecute };
