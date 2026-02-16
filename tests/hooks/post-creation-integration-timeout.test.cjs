'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const hook = require('../../.claude/hooks/workflow/post-creation-integration.cjs');

test('runEcosystemImpactAnalysisWithTimeout logs skip on timeout', async () => {
  const logs = [];
  const result = await hook.runEcosystemImpactAnalysisWithTimeout(
    'skill',
    'skill:test',
    {
      analyzer: async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
        return { mustHave: [] };
      },
      timeoutMs: 5,
      log: msg => logs.push(msg),
    }
  );

  assert.equal(result.timedOut, true);
  assert.equal(result.report, null);
  assert.ok(logs.some(msg => /Skipped due to timeout/i.test(msg)));
});
