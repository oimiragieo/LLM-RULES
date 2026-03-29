'use strict';
function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'goal-backward-verification: no context to validate' };
  }
  return { allow: true };
}
module.exports = { preExecute };
