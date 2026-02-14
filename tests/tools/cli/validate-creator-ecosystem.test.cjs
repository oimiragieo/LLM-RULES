'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const validator = require('../../../.claude/tools/cli/validate-creator-ecosystem.cjs');

test('creator ecosystem validator passes for current creator skill set', () => {
  const result = validator.runValidation();
  assert.equal(result.pass, true, result.issues.join('\n'));
  assert.equal(result.checked, 9);
});

test('validateSkillContent fails when mandatory markers are missing', () => {
  const result = validator.validateSkillContent('skill-creator', '# title only');
  assert.equal(result.pass, false);
  assert.ok(result.issues.length >= 1);
  assert.match(result.issues[0], /missing marker/);
});
