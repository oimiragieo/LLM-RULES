'use strict';
/**
 * Post-execute hook for adversarial-review
 */

function postExecute(_context) {
  return { ok: true, skill: 'adversarial-review' };
}

module.exports = { postExecute };
