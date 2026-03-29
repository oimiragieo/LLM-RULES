'use strict';
/**
 * Post-execute hook for ml-experiment-loop
 */

function postExecute(_context) {
  return { ok: true, skill: 'ml-experiment-loop' };
}

module.exports = { postExecute };
