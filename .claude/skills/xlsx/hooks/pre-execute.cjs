'use strict';
/**
 * Pre-execute hook for xlsx
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'xlsx: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
