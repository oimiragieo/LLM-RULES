'use strict';
/**
 * Post-execute hook for pipeline-evaluator
 */

function postExecute(_context) {
  return { ok: true, skill: 'pipeline-evaluator' };
}

module.exports = { postExecute };
