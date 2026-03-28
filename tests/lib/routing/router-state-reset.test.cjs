'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const MODULE_PATH = path.resolve(__dirname, '../../../.claude/lib/routing/router-state.cjs');

function loadRouterState() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

function setupTempState(t, sessionId = null) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-state-reset-'));
  const stateFile = path.join(tmpDir, 'router-state.json');
  const previousStateFile = process.env.ROUTER_STATE_FILE;
  const previousSessionId = process.env.CLAUDE_SESSION_ID;

  process.env.ROUTER_STATE_FILE = stateFile;
  if (sessionId === null) {
    delete process.env.CLAUDE_SESSION_ID;
  } else {
    process.env.CLAUDE_SESSION_ID = sessionId;
  }

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete require.cache[require.resolve(MODULE_PATH)];
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

  return stateFile;
}

function writeState(stateFile, state) {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

test('resetToRouterMode preserves session-scoped routing knowledge within the same session', t => {
  const stateFile = setupTempState(t, 'session-a');
  writeState(stateFile, {
    mode: 'agent',
    taskSpawned: true,
    taskSpawnedAt: '2026-03-28T00:00:00.000Z',
    taskDescription: 'existing task',
    sessionId: 'session-a',
    taskListCalledSincePrompt: true,
    complexity: 'high',
    requiresPlannerFirst: true,
    plannerSpawned: true,
    requiresSecurityReview: true,
    securitySpawned: true,
    architectSpawned: true,
    currentSpawnTaskId: 'task-123',
    version: 3,
    customMarker: 'preserve-me',
  });

  const routerState = loadRouterState();
  const resetState = routerState.resetToRouterMode();

  assert.equal(resetState.mode, 'router');
  assert.equal(resetState.taskSpawned, false);
  assert.equal(resetState.taskListCalledSincePrompt, false);
  assert.equal(resetState.currentSpawnTaskId, null);
  assert.equal(resetState.taskDescription, null);
  assert.equal(resetState.taskSpawnedAt, null);
  assert.equal(resetState.complexity, 'high');
  assert.equal(resetState.requiresPlannerFirst, true);
  assert.equal(resetState.plannerSpawned, true);
  assert.equal(resetState.requiresSecurityReview, true);
  assert.equal(resetState.securitySpawned, true);
  assert.equal(resetState.architectSpawned, true);
  assert.equal(resetState.customMarker, 'preserve-me');
  assert.equal(resetState.version, 4);

  const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(persisted.complexity, 'high');
  assert.equal(persisted.plannerSpawned, true);
  assert.equal(persisted.securitySpawned, true);
  assert.equal(persisted.architectSpawned, true);
  assert.equal(persisted.customMarker, 'preserve-me');
});

test('resetToRouterMode resets session-scoped routing fields when the session changes', t => {
  const stateFile = setupTempState(t, 'session-new');
  writeState(stateFile, {
    mode: 'agent',
    taskSpawned: true,
    sessionId: 'session-old',
    complexity: 'epic',
    requiresPlannerFirst: true,
    plannerSpawned: true,
    requiresSecurityReview: true,
    securitySpawned: true,
    architectSpawned: true,
    version: 8,
  });

  const routerState = loadRouterState();
  const resetState = routerState.resetToRouterMode();

  assert.equal(resetState.sessionId, 'session-new');
  assert.equal(resetState.complexity, 'trivial');
  assert.equal(resetState.requiresPlannerFirst, false);
  assert.equal(resetState.plannerSpawned, false);
  assert.equal(resetState.requiresSecurityReview, false);
  assert.equal(resetState.securitySpawned, false);
  assert.equal(resetState.architectSpawned, false);
  assert.equal(resetState.taskSpawned, false);
  assert.equal(resetState.mode, 'router');
});

test('resetToRouterMode creates a valid default state file when none exists', t => {
  const stateFile = setupTempState(t, 'session-first');
  const routerState = loadRouterState();

  assert.equal(fs.existsSync(stateFile), false);

  const resetState = routerState.resetToRouterMode();

  assert.equal(fs.existsSync(stateFile), true);
  assert.equal(resetState.mode, 'router');
  assert.equal(resetState.taskSpawned, false);
  assert.equal(resetState.sessionId, 'session-first');
  assert.equal(resetState.version, 1);

  const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(persisted.mode, 'router');
  assert.equal(persisted.taskSpawned, false);
  assert.equal(persisted.sessionId, 'session-first');
});

test('getState falls back to defaults and saveStateWithRetry repairs corrupt JSON', t => {
  const stateFile = setupTempState(t, 'session-corrupt');
  fs.writeFileSync(stateFile, '{"mode":"router"', 'utf8');

  const routerState = loadRouterState();
  routerState.invalidateStateCache();

  const recoveredState = routerState.getState();
  assert.equal(recoveredState.mode, 'router');
  assert.equal(recoveredState.taskSpawned, false);
  assert.equal(recoveredState.version, 0);

  const savedState = routerState.saveStateWithRetry({ customMarker: 'repaired' });
  assert.equal(savedState.customMarker, 'repaired');

  const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(persisted.customMarker, 'repaired');
  assert.equal(persisted.mode, 'router');
  assert.equal(persisted.version, 1);
});
