'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROUTER_STATE_MODULE = path.resolve(__dirname, '../../.claude/lib/routing/router-state.cjs');
const HOOK_MODULE = path.resolve(__dirname, '../../.claude/hooks/routing/user-prompt-unified.cjs');

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('user-prompt-unified batches router state writes to one reset and one classification write', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-prompt-state-writes-'));
  const stateFile = path.join(tmpDir, 'router-state.json');
  const previousStateFile = process.env.ROUTER_STATE_FILE;
  const previousSessionId = process.env.CLAUDE_SESSION_ID;
  const previousSemanticRouting = process.env.SEMANTIC_ROUTING;
  const previousPreset = process.env.AGENT_PRESET;

  process.env.ROUTER_STATE_FILE = stateFile;
  process.env.CLAUDE_SESSION_ID = 'batched-session';
  process.env.SEMANTIC_ROUTING = 'off';
  process.env.AGENT_PRESET = 'strict-router';

  const routerState = freshRequire(ROUTER_STATE_MODULE);
  const unified = freshRequire(HOOK_MODULE);

  const originalResetToRouterMode = routerState.resetToRouterMode;
  const originalSaveStateWithRetry = routerState.saveStateWithRetry;
  let resetCalls = 0;
  let classificationSaves = 0;

  routerState.resetToRouterMode = function wrappedReset(...args) {
    resetCalls += 1;
    return originalResetToRouterMode.apply(this, args);
  };
  routerState.saveStateWithRetry = function wrappedSave(...args) {
    classificationSaves += 1;
    return originalSaveStateWithRetry.apply(this, args);
  };

  t.after(() => {
    routerState.resetToRouterMode = originalResetToRouterMode;
    routerState.saveStateWithRetry = originalSaveStateWithRetry;
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
    if (previousSemanticRouting === undefined) {
      delete process.env.SEMANTIC_ROUTING;
    } else {
      process.env.SEMANTIC_ROUTING = previousSemanticRouting;
    }
    if (previousPreset === undefined) {
      delete process.env.AGENT_PRESET;
    } else {
      process.env.AGENT_PRESET = previousPreset;
    }
  });

  const prompt = 'Create new skill to batch-process OAuth tokens safely';

  const resetResult = unified.checkRouterModeReset({ prompt });
  const enforcementResult = await unified.checkRouterEnforcement({ prompt });

  assert.equal(resetResult.stateReset, true);
  assert.equal(resetCalls, 1);
  assert.equal(classificationSaves, 1);
  assert.ok(resetCalls + classificationSaves <= 2);

  const state = routerState.getState();
  assert.equal(state.sessionId, 'batched-session');
  assert.equal(state.preset, 'strict-router');
  assert.equal(state.creatorIntentDetected, true);
  assert.equal(state.detectedCreatorType, 'skill-creator');
  assert.equal(state.requiredCreatorSkill, 'skill-creator');
  assert.ok(enforcementResult.planningReq);
  assert.ok(state.platformAwarenessRule.includes('YOU ARE ON WINDOWS'));
});
