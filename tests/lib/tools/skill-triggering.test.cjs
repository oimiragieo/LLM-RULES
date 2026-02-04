'use strict';

const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { runSkillTriggeringSmoke } = require(path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'tests',
  'skill-triggering',
  'run-skill-triggering-test.cjs'
));

test('skill-triggering manifest and prompts are present', () => {
  const promptsDir = path.join(__dirname, '..', '..', '..', '.claude', 'tests', 'skill-triggering', 'prompts');
  const manifestPath = path.join(promptsDir, 'manifest.json');
  const result = runSkillTriggeringSmoke({ promptsDir, manifestPath });
  assert.strictEqual(result.ok, true, result.errors.join('\n'));
});
