'use strict';
/**
 * Post-execute hook for cloudflare-workers
 */

function postExecute(_context) {
  return { ok: true, skill: 'cloudflare-workers' };
}

module.exports = { postExecute };
