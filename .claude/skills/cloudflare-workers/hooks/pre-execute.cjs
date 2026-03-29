'use strict';
/**
 * Pre-execute hook for cloudflare-workers
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'cloudflare-workers: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
