'use strict';

function postExecute(result) {
  if (!result || typeof result !== 'object') {
    return { allow: true, message: 'hooks-explainer: no result payload provided' };
  }

  return { allow: true };
}

module.exports = { postExecute };
