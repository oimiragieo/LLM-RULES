#!/usr/bin/env node
/**
 * Router Mode Reset Hook - Test Suite
 *
 * Tests the UserPromptSubmit logic that resets router state
 * to "router" mode on each new user prompt.
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');

const { checkRouterModeReset } = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
const routerState = require('../../.claude/lib/routing/router-state.cjs');

let originalStateContent = null;

function backupState() {
  if (fs.existsSync(STATE_FILE)) {
    originalStateContent = fs.readFileSync(STATE_FILE, 'utf-8');
  }
}

function restoreState() {
  if (originalStateContent !== null) {
    fs.writeFileSync(STATE_FILE, originalStateContent);
  } else if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

function setState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

describe('router-mode-reset', { concurrency: 1 }, () => {
  before(() => backupState());
  after(() => restoreState());

  it('resets mode to router for normal prompts', () => {
    setState({
      mode: 'agent',
      taskSpawned: true,
      taskSpawnedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      taskDescription: 'Old task',
    });

    const result = checkRouterModeReset({ prompt: 'New user prompt' });
    assert.equal(result.skipped, false);

    const state = routerState.getState();
    assert.equal(state.mode, 'router');
    assert.equal(state.taskSpawned, false);
  });

  it('skips slash commands', () => {
    setState({
      mode: 'agent',
      taskSpawned: true,
      taskSpawnedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      taskDescription: 'Task',
    });

    const result = checkRouterModeReset({ prompt: '/status' });
    assert.equal(result.skipped, true);

    const state = routerState.getState();
    assert.equal(state.mode, 'agent');
    assert.equal(state.taskSpawned, true);
  });

  it('handles empty input by resetting to router', () => {
    setState({
      mode: 'agent',
      taskSpawned: true,
    });

    const result = checkRouterModeReset(null);
    assert.equal(result.skipped, false);

    const state = routerState.getState();
    assert.equal(state.mode, 'router');
  });

  it('sets lastReset timestamp', () => {
    setState({
      mode: 'router',
      taskSpawned: false,
      lastReset: null,
    });

    checkRouterModeReset({ prompt: 'Test prompt' });
    const state = routerState.getState();
    assert.ok(state.lastReset);
    const resetTime = new Date(state.lastReset);
    assert.ok(Date.now() - resetTime.getTime() < 5000);
  });

  it('resets complexity tracking fields', () => {
    setState({
      mode: 'agent',
      taskSpawned: true,
      taskSpawnedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      complexity: 'high',
      requiresPlannerFirst: true,
      plannerSpawned: true,
      requiresSecurityReview: true,
      securitySpawned: true,
    });

    checkRouterModeReset({ prompt: 'New prompt' });
    const state = routerState.getState();
    assert.equal(state.complexity, 'trivial');
    assert.equal(state.requiresPlannerFirst, false);
    assert.equal(state.plannerSpawned, false);
    assert.equal(state.requiresSecurityReview, false);
    assert.equal(state.securitySpawned, false);
  });

  it('resets TaskUpdate tracking fields', () => {
    setState({
      mode: 'agent',
      taskSpawned: true,
      taskSpawnedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      lastTaskUpdateCall: Date.now(),
      lastTaskUpdateTaskId: '123',
      lastTaskUpdateStatus: 'completed',
      taskUpdatesThisSession: 5,
    });

    checkRouterModeReset({ prompt: 'New prompt' });
    const state = routerState.getState();
    assert.equal(state.lastTaskUpdateCall, null);
    assert.equal(state.lastTaskUpdateTaskId, null);
    assert.equal(state.lastTaskUpdateStatus, null);
    assert.equal(state.taskUpdatesThisSession, 0);
  });
});
