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
const ROUTER_STATE_MODULE = path.resolve(__dirname, '../../.claude/lib/routing/router-state.cjs');

function loadHook() {
  delete require.cache[require.resolve(HOOK_MODULE)];
  return require(HOOK_MODULE);
}

test('checkRouterEnforcement uses hierarchical routing when enabled and flat routing otherwise', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hierarchical-routing-'));
  const previousStateFile = process.env.ROUTER_STATE_FILE;
  const previousSessionId = process.env.CLAUDE_SESSION_ID;
  const previousFlag = process.env.HIERARCHICAL_ROUTING;
  const previousSemantic = process.env.SEMANTIC_ROUTING;

  process.env.ROUTER_STATE_FILE = path.join(tmpDir, 'router-state.json');
  process.env.CLAUDE_SESSION_ID = 'hierarchical-routing-test';
  process.env.SEMANTIC_ROUTING = 'off';

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete require.cache[require.resolve(HOOK_MODULE)];
    delete require.cache[require.resolve(ROUTER_STATE_MODULE)];

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

  await t.test('routes domain prompts to sub-routers when HIERARCHICAL_ROUTING=on', async () => {
    process.env.HIERARCHICAL_ROUTING = 'on';

    const { checkRouterEnforcement } = loadHook();
    const result = await checkRouterEnforcement({
      prompt: 'Build a React component with responsive Tailwind styles.',
    });

    assert.strictEqual(result.routingType, 'hierarchical');
    assert.strictEqual(result.domain, 'web-frontend');
    assert.strictEqual(result.subRouter, 'domain-router-web-frontend');
    assert.strictEqual(result.candidates[0].agent.name, 'domain-router-web-frontend');
    assert.strictEqual(result.intentSource, 'hierarchical');
  });

  await t.test('preserves flat routing when HIERARCHICAL_ROUTING=off', async () => {
    process.env.HIERARCHICAL_ROUTING = 'off';

    const { checkRouterEnforcement } = loadHook();
    const result = await checkRouterEnforcement({
      prompt: 'Build a React component with responsive Tailwind styles.',
    });

    assert.notStrictEqual(result.routingType, 'hierarchical');
    assert.notStrictEqual(result.candidates[0].agent.name, 'domain-router-web-frontend');
  });

  await t.test('defaults to hierarchical routing when HIERARCHICAL_ROUTING is unset', async () => {
    delete process.env.HIERARCHICAL_ROUTING;

    const { checkRouterEnforcement } = loadHook();
    const result = await checkRouterEnforcement({
      prompt: 'Build a React component with responsive Tailwind styles.',
    });

    // Default is now hierarchical (HIERARCHICAL_ROUTING=on in CLAUDE.md)
    assert.strictEqual(result.routingType, 'hierarchical');
    assert.strictEqual(result.candidates[0].agent.name, 'domain-router-web-frontend');
  });
});
