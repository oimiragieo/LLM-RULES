'use strict';

module.exports = function postExecute(input, output) {
  if (!output.ok && output.error && output.error.includes('Not Found')) {
    return {
      ok: false,
      message: '[github-ops] Resource not found. Verify the owner, repo, and path placeholders.',
    };
  }

  return { ok: true };
};
