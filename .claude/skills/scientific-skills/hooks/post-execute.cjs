'use strict';
/**
 * Post-execute hook for scientific-skills
 */

function postExecute(_context) {
  return { ok: true, skill: 'scientific-skills' };
}

module.exports = { postExecute };
