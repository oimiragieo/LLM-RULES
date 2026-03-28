'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ROUTER_STATE_MODULE = path.resolve(__dirname, '../../../.claude/lib/routing/router-state.cjs');
const HOOK_MODULE = path.resolve(
  __dirname,
  '../../../.claude/hooks/routing/user-prompt-unified.core.cjs'
);

function loadRouterState() {
  delete require.cache[require.resolve(ROUTER_STATE_MODULE)];
  return require(ROUTER_STATE_MODULE);
}

function loadHook() {
  delete require.cache[require.resolve(HOOK_MODULE)];
  return require(HOOK_MODULE);
}

test('Platform Awareness Rule Injection', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-awareness-'));
  const statePath = path.join(tmpDir, 'router-state.json');
  const previousStateFile = process.env.ROUTER_STATE_FILE;
  const previousSessionId = process.env.CLAUDE_SESSION_ID;

  process.env.ROUTER_STATE_FILE = statePath;
  process.env.CLAUDE_SESSION_ID = 'platform-awareness-session';

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete require.cache[require.resolve(ROUTER_STATE_MODULE)];
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
  });

  await t.test('should save platform awareness rule to state when planning is detected', async () => {
    const prompt = 'Please integrate this github repo: https://github.com/test/repo';
    const routerState = loadRouterState();
    const { checkRouterEnforcement } = loadHook();

    routerState.resetToRouterMode();
    await checkRouterEnforcement({ prompt });

    const state = routerState.getState();
    assert.ok(state.platformAwarenessRule, 'platformAwarenessRule should exist in state');
    assert.ok(state.platformAwarenessRule.includes('YOU ARE ON WINDOWS'), 'Should mention Windows');
    assert.ok(
      state.platformAwarenessRule.includes('USE NATIVE PATHS'),
      'Should mention native paths'
    );
  });
});
