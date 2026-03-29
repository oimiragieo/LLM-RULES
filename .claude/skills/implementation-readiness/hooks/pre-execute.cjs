'use strict';
function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'implementation-readiness: no context to validate' };
  }
  return { allow: true };
}
module.exports = { preExecute };
