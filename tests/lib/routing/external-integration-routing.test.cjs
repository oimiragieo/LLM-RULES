'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { classifyIntent } = require('../../../.claude/lib/routing/intent-classifier.cjs');

test('External Integration Routing', async t => {
  await t.test('should trigger artifact-integrator for a github URL', () => {
    const prompt = 'create a skill from https://github.com/hmohamed01/powershell-expert';
    const classification = classifyIntent(prompt);

    assert.strictEqual(classification.intent, 'artifact-integrator');
    assert.strictEqual(classification.source, 'intent_keywords_broad');
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
        'Please research this github repo: hmohamed01/powershell-expert and turn it into a skill.';
      const classification = classifyIntent(prompt);

      assert.strictEqual(classification.intent, 'artifact-integrator');
    }
  );
});
