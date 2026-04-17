'use strict';

function postExecute(result = {}) {
  return {
    ...result,
    finalized: true,
  };
}

module.exports = { postExecute };
