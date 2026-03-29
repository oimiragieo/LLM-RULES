'use strict';
/**
 * Post-execute hook for model-benchmark
 */

function postExecute(_context) {
  return { ok: true, skill: 'model-benchmark' };
}

module.exports = { postExecute };
