'use strict';
/**
 * Pre-execute hook for seo-optimization
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'seo-optimization: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
