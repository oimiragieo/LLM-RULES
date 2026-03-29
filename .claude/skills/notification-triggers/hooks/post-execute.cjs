'use strict';
/**
 * Post-execute hook for notification-triggers
 *
 * Records metrics after skill execution.
 */

function postExecute(_context) {
  // Record execution metrics
  return { ok: true, skill: 'notification-triggers' };
}

module.exports = { postExecute };
