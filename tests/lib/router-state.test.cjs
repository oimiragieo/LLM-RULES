'use strict';

/**
 * Tests for .claude/lib/routing/router-state.cjs
 *
 * Uses ROUTER_STATE_FILE env var to point to a temp file for isolation.
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEMP_STATE_FILE = path.join(
  os.tmpdir(),
  "test-router-state-" + process.pid + "-" + Date.now() + ".json"
);

const STATE_MODULE_PATH = path.resolve(
  __dirname,
  "../../.claude/lib/routing/router-state.cjs"
);

function loadModule() {
  delete require.cache[require.resolve(STATE_MODULE_PATH)];
  for (const key of Object.keys(require.cache)) {
    if (key.includes("state-cache") || key.includes("atomic-write") || key.includes("state-contracts")) {
      delete require.cache[key];
    }
  }
  return require(STATE_MODULE_PATH);
}

before(() => {
  process.env.ROUTER_STATE_FILE = TEMP_STATE_FILE;
  process.env.ROUTER_WRITE_GUARD = "off";
});

beforeEach(() => {
  try { fs.unlinkSync(TEMP_STATE_FILE); } catch (_) { /* may not exist */ }
  try { fs.unlinkSync(TEMP_STATE_FILE + ".lock"); } catch (_) { /* ignore */ }
});

after(() => {
  try { fs.unlinkSync(TEMP_STATE_FILE); } catch (_) { /* may not exist */ }
  try { fs.unlinkSync(TEMP_STATE_FILE + ".lock"); } catch (_) { /* ignore */ }
  delete process.env.ROUTER_STATE_FILE;
  delete process.env.ROUTER_WRITE_GUARD;
});

test('getState() returns default state with mode=router when no file exists', () => {
  const { getState } = loadModule();
  const state = getState();
  assert.equal(state.mode, 'router');
  assert.equal(state.taskSpawned, false);
});

test('enterAgentMode() sets mode to agent', () => {
  const { enterAgentMode, getState } = loadModule();
  enterAgentMode('test task');
  const state = getState();
  assert.equal(state.mode, 'agent');
  assert.equal(state.taskSpawned, true);
  assert.equal(state.taskDescription, 'test task');
});

test('exitAgentMode() sets mode back to router', () => {
  const { enterAgentMode, exitAgentMode, getState } = loadModule();
  enterAgentMode('test task');
  exitAgentMode();
  const state = getState();
  assert.equal(state.mode, 'router');
  assert.equal(state.taskSpawned, false);
});

test('isInAgentContext() returns false when mode is router', () => {
  const { isInAgentContext } = loadModule();
  assert.equal(isInAgentContext(), false);
});

test('isInAgentContext() returns true after enterAgentMode()', () => {
  const { enterAgentMode, isInAgentContext } = loadModule();
  enterAgentMode();
  assert.equal(isInAgentContext(), true);
});

test('isInAgentContext() returns false after exitAgentMode()', () => {
  const { enterAgentMode, exitAgentMode, isInAgentContext } = loadModule();
  enterAgentMode();
  exitAgentMode();
  assert.equal(isInAgentContext(), false);
});

test('checkWriteAllowed() returns object with allowed boolean and reason string', () => {
  const { checkWriteAllowed } = loadModule();
  const result = checkWriteAllowed();
  assert.ok(typeof result === 'object', 'result should be an object');
  assert.ok(typeof result.allowed === 'boolean', 'allowed should be boolean');
  assert.ok(typeof result.reason === 'string', 'reason should be string');
});

test('checkWriteAllowed() returns allowed=false in block mode with router context', () => {
  const mod = loadModule();
  const savedGuard = process.env.ROUTER_WRITE_GUARD;
  process.env.ROUTER_WRITE_GUARD = 'block';
  try {
    const result = mod.checkWriteAllowed();
    assert.equal(result.allowed, false);
    assert.ok(result.reason.length > 0);
  } finally {
    process.env.ROUTER_WRITE_GUARD = savedGuard;
  }
});

test('checkWriteAllowed() returns allowed=true after enterAgentMode()', () => {
  const { enterAgentMode, checkWriteAllowed } = loadModule();
  const savedGuard = process.env.ROUTER_WRITE_GUARD;
  process.env.ROUTER_WRITE_GUARD = 'block';
  try {
    enterAgentMode('test');
    const result = checkWriteAllowed();
    assert.equal(result.allowed, true);
    assert.ok(result.reason.length > 0);
  } finally {
    process.env.ROUTER_WRITE_GUARD = savedGuard;
  }
});

test('resetToRouterMode() resets mode to router', () => {
  const { enterAgentMode, resetToRouterMode, getState } = loadModule();
  enterAgentMode('something');
  resetToRouterMode();
  const state = getState();
  assert.equal(state.mode, 'router');
  assert.equal(state.taskSpawned, false);
});

test('getState() returns object with version field', () => {
  const { getState } = loadModule();
  const state = getState();
  assert.ok(Object.prototype.hasOwnProperty.call(state, 'version'));
  assert.ok(typeof state.version === 'number');
});

test('exitAgentMode() preserves planner/security spawn tracking', () => {
  const { enterAgentMode, exitAgentMode, markPlannerSpawned, markSecuritySpawned, getState } = loadModule();
  enterAgentMode('test task');
  markPlannerSpawned();
  markSecuritySpawned();
  exitAgentMode();
  const state = getState();
  assert.equal(state.mode, 'router');
  assert.equal(state.taskSpawned, false);
  assert.equal(state.plannerSpawned, true);
  assert.equal(state.securitySpawned, true);
});