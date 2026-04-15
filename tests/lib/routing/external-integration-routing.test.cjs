'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { classifyIntent } = require('../../../.claude/lib/routing/intent-classifier.cjs');

test('External Integration Routing', async t => {
  await t.test('should trigger artifact-integrator for a github URL', () => {
    const prompt =
      'integrate this github repo https://github.com/example-org/example-lib into our framework';
    const classification = classifyIntent(prompt);

    assert.strictEqual(classification.intent, 'artifact-integrator');
  });

  await t.test('should trigger artifact-integrator for "repo" keyword', () => {
    const prompt = 'integrate this repo: my-org/my-repo';
    const classification = classifyIntent(prompt);

    assert.strictEqual(classification.intent, 'artifact-integrator');
  });

  await t.test('should trigger researcher for pure research prompts', () => {
    const prompt = 'Research best practices for TypeScript decoraters and metadata reflection.';
    const classification = classifyIntent(prompt);

    assert.strictEqual(classification.intent, 'researcher');
  });

  await t.test(
    'should prefer artifact-integrator for research on a github repo (disambiguation)',
    () => {
      const prompt =
        'Please integrate this github repo: example-org/example-lib and onboard it as a skill.';
      const classification = classifyIntent(prompt);

      assert.strictEqual(classification.intent, 'artifact-integrator');
    }
  );
});
