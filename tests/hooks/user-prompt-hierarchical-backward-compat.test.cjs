#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK_MODULE = path.resolve(
  __dirname,
  '../../.claude/hooks/routing/user-prompt-unified.core.cjs'
);

const DIRECT_ROUTE_CASES = [
  ['developer', 'Fix the auth bug in the login flow.'],
  ['planner', 'Plan a new feature rollout for billing.'],
  ['architect', 'Do an architecture review for this service mesh.'],
  ['qa', 'Run tests for the payment flow.'],
  ['general-assistant', 'Provide an overview of the deployment process.'],
  ['code-reviewer', 'Review this pull request for regressions.'],
  ['code-simplifier', 'Refactor this module for clarity.'],
  ['technical-writer', 'Update the API docs for the billing service.'],
  ['researcher', 'Research best practices for cache invalidation.'],
  ['context-compressor', 'Compress this context before we continue.'],
];

const SLASH_COMMANDS = [
  '/plan auth rollout',
  '/research cache invalidation',
  '/docs billing api',
  '/compress recent context',
  '/test payment flow',
];

function loadHook() {
  delete require.cache[require.resolve(HOOK_MODULE)];
  return require(HOOK_MODULE);
}

test('hierarchical routing preserves direct-route behavior and slash command handling', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hierarchical-backcompat-'));
  const previousStateFile = process.env.ROUTER_STATE_FILE;
  const previousSessionId = process.env.CLAUDE_SESSION_ID;
  const previousFlag = process.env.HIERARCHICAL_ROUTING;
  const previousSemantic = process.env.SEMANTIC_ROUTING;

  process.env.ROUTER_STATE_FILE = path.join(tmpDir, 'router-state.json');
  process.env.CLAUDE_SESSION_ID = 'hierarchical-backcompat-test';
  process.env.SEMANTIC_ROUTING = 'off';

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete require.cache[require.resolve(HOOK_MODULE)];

    if (previousStateFile === undefined) {
      delete process.env.ROUTER_STATE_FILE;
    } else {
      process.env.ROUTER_STATE_FILE = previousStateFile;
    }

    if (previousSessionId === undefined) {
      delete process.env.CLAUDE_SESSION_ID;
    } else {
      process.env.CLAUDE_SESSION_ID = previousSessionId;
    }

    if (previousFlag === undefined) {
      delete process.env.HIERARCHICAL_ROUTING;
    } else {
      process.env.HIERARCHICAL_ROUTING = previousFlag;
    }

    if (previousSemantic === undefined) {
      delete process.env.SEMANTIC_ROUTING;
    } else {
      process.env.SEMANTIC_ROUTING = previousSemantic;
    }
  });

  await t.test(
    'canonical direct-route prompts dispatch identically with the feature flag on and off',
    async () => {
      for (const [expectedAgent, prompt] of DIRECT_ROUTE_CASES) {
        process.env.HIERARCHICAL_ROUTING = 'off';
        const flatResult = await loadHook().checkRouterEnforcement({ prompt });
        const flatAgent = flatResult.candidates[0]?.agent?.name;

        process.env.HIERARCHICAL_ROUTING = 'on';
        const hierarchicalResult = await loadHook().checkRouterEnforcement({ prompt });
        const hierarchicalAgent = hierarchicalResult.candidates[0]?.agent?.name;

        assert.strictEqual(flatAgent, expectedAgent, `flat routing mismatch for "${prompt}"`);
        assert.strictEqual(
          hierarchicalAgent,
          flatAgent,
          `hierarchical routing changed direct-route dispatch for "${prompt}"`
        );
      }
    }
  );

  await t.test('slash commands remain skipped when hierarchical routing is enabled', async () => {
    process.env.HIERARCHICAL_ROUTING = 'on';

    for (const prompt of SLASH_COMMANDS) {
      const result = await loadHook().checkRouterEnforcement({ prompt });
      assert.strictEqual(result.skipped, true, `expected slash command skip for ${prompt}`);
      assert.strictEqual(result.reason, 'slash_command', `unexpected skip reason for ${prompt}`);
    }
  });
});
