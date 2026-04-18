'use strict';

function preExecute(input = {}) {
  return {
    ...input,
    channel: input.channel || 'telegram',
  };
}

module.exports = { preExecute };
