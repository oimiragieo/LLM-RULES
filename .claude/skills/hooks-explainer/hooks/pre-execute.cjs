'use strict';

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'hooks-explainer: no invocation context provided' };
  }

  return { allow: true };
}

module.exports = { preExecute };
