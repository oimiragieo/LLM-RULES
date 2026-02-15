#!/usr/bin/env node
/**
 * state-reset-fields.test.cjs
 *
 * Tests for Fix 4a: Verify state-reset.cjs includes all required fields.
 * Ensures taskListCalledSincePrompt and currentSpawnTaskId are explicitly
 * set in the reset state.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'state-reset.cjs');

/**
 * Helper: Read current state from file
 */
function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

/**
 * Helper: Write state to file
 */
function writeState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Helper: Delete state file
 */
function deleteState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

/**
 * Helper: Run hook (simulates UserPromptSubmit trigger)
 */
function runHook() {
  const result = spawnSync('node', [HOOK_PATH], { encoding: 'utf-8', stdio: 'pipe' });
  if (result.status === 0) {
    return { success: true };
  }
  return {
    success: false,
    code: result.status,
    stderr: result.stderr,
  };
}

describe('Fix 4a: state-reset includes required fields', () => {
  beforeEach(() => {
    // Start with a stale state that has these fields set to non-default values
    writeState({
      mode: 'agent',
      taskSpawned: true,
      taskSpawnedAt: new Date().toISOString(),
      taskDescription: 'Previous task',
      sessionId: 'test-session-fields',
      taskListCalledSincePrompt: true,
      complexity: 'high',
      requiresPlannerFirst: true,
      plannerSpawned: true,
      requiresSecurityReview: true,
      securitySpawned: true,
      lastTaskUpdateCall: Date.now(),
      lastTaskUpdateTaskId: 'task-999',
      lastTaskUpdateStatus: 'completed',
      taskUpdatesThisSession: 15,
      currentSpawnTaskId: 'task-42',
      version: 9999,
    });
  });

  afterEach(() => {
    deleteState();
  });

  it('should include taskListCalledSincePrompt set to false after reset', () => {
    const result = runHook();
    assert.strictEqual(result.success, true, 'Hook should succeed');

    const state = readState();
    assert.ok(state !== null, 'State file should exist after reset');
    assert.strictEqual(
      'taskListCalledSincePrompt' in state,
      true,
      'taskListCalledSincePrompt field must be present in reset state'
    );
    assert.strictEqual(
      state.taskListCalledSincePrompt,
      false,
      'taskListCalledSincePrompt must be false after reset'
    );
  });

  it('should include currentSpawnTaskId set to null after reset', () => {
    const result = runHook();
    assert.strictEqual(result.success, true, 'Hook should succeed');

    const state = readState();
    assert.ok(state !== null, 'State file should exist after reset');
    assert.strictEqual(
      'currentSpawnTaskId' in state,
      true,
      'currentSpawnTaskId field must be present in reset state'
    );
    assert.strictEqual(
      state.currentSpawnTaskId,
      null,
      'currentSpawnTaskId must be null after reset'
    );
  });

  it('should set mode to router after reset', () => {
    const result = runHook();
    assert.strictEqual(result.success, true, 'Hook should succeed');

    const state = readState();
    assert.ok(state !== null, 'State file should exist after reset');
    assert.strictEqual(state.mode, 'router', 'mode must be router after reset');
  });

  it('should reset taskListCalledSincePrompt from true to false', () => {
    // Verify stale state has it set to true
    const beforeState = readState();
    assert.strictEqual(
      beforeState.taskListCalledSincePrompt,
      true,
      'Pre-condition: should be true before reset'
    );

    const result = runHook();
    assert.strictEqual(result.success, true, 'Hook should succeed');

    const afterState = readState();
    assert.strictEqual(
      afterState.taskListCalledSincePrompt,
      false,
      'taskListCalledSincePrompt must be reset from true to false'
    );
  });

  it('should reset currentSpawnTaskId from a value to null', () => {
    // Verify stale state has it set
    const beforeState = readState();
    assert.strictEqual(
      beforeState.currentSpawnTaskId,
      'task-42',
      'Pre-condition: should have a task ID before reset'
    );

    const result = runHook();
    assert.strictEqual(result.success, true, 'Hook should succeed');

    const afterState = readState();
    assert.strictEqual(
      afterState.currentSpawnTaskId,
      null,
      'currentSpawnTaskId must be reset from task-42 to null'
    );
  });

  it('should match all fields present in router-state.cjs getDefaultState()', () => {
    const result = runHook();
    assert.strictEqual(result.success, true, 'Hook should succeed');

    const state = readState();
    assert.ok(state !== null, 'State file should exist after reset');

    // These are the fields that router-state.cjs getDefaultState() defines
    // and state-reset.cjs must also include
    const requiredFields = [
      'mode',
      'lastReset',
      'taskSpawned',
      'taskSpawnedAt',
      'taskDescription',
      'sessionId',
      'taskListCalledSincePrompt',
      'complexity',
      'requiresPlannerFirst',
      'plannerSpawned',
      'requiresSecurityReview',
      'securitySpawned',
      'architectSpawned',
      'lastTaskUpdateCall',
      'lastTaskUpdateTaskId',
      'lastTaskUpdateStatus',
      'taskUpdatesThisSession',
      'currentSpawnTaskId',
      'version',
    ];

    for (const field of requiredFields) {
      assert.strictEqual(
        field in state,
        true,
        `Field '${field}' must be present in reset state (required by router-state.cjs)`
      );
    }
  });
});
