'use strict';
/**
 * Pre-execute hook for scientific-skills
 */

function preExecute(context) {
  if (!context || typeof context !== 'object') {
    return { allow: true, message: 'scientific-skills: no context to validate' };
  }
  return { allow: true };
}

module.exports = { preExecute };
