#!/usr/bin/env node
/**
 * state-reset.test.cjs
 *
 * Tests for state-reset.cjs hook.
 * Validates that router state resets on every UserPromptSubmit.
 *
 * Part of PROC-007 remediation (Option A).
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Use shared project root
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
  try {
    execSync(`node "${HOOK_PATH}"`, { encoding: 'utf-8', stdio: 'pipe' });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      code: err.status,
      stderr: err.stderr,
    };
  }
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  // Start with clean state
  deleteState();
});

afterEach(() => {
  // Clean up after tests
  deleteState();
});

// Test 1: Reset state when taskSpawned is true
test('resets taskSpawned to false on every call', () => {
  // Arrange: Set up state with taskSpawned: true (stale from previous task)
  writeState({
    mode: 'agent',
    taskSpawned: true,
    taskSpawnedAt: new Date().toISOString(),
    taskDescription: 'Previous task',
    sessionId: 'test-session',
    complexity: 'high',
    plannerSpawned: true,
    securitySpawned: false,
    version: 5,
  });

  // Act: Run hook (simulates UserPromptSubmit)
  const result = runHook();

  // Assert: Hook succeeded
  assert.strictEqual(result.success, true);

  // Assert: State reset to defaults
  const state = readState();
  assert.strictEqual(state.mode, 'router');
  assert.strictEqual(state.taskSpawned, false);
  assert.strictEqual(state.taskSpawnedAt, null);
  assert.strictEqual(state.taskDescription, null);
  assert.strictEqual(state.complexity, 'trivial');
  assert.strictEqual(state.requiresPlannerFirst, false);
  assert.strictEqual(state.plannerSpawned, false);
  assert.strictEqual(state.requiresSecurityReview, false);
  assert.strictEqual(state.securitySpawned, false);
});

// Test 2: Preserve sessionId across resets
test('preserves sessionId when resetting state', () => {
  // Arrange: State with existing sessionId
  const existingSessionId = 'session-abc-123';
  writeState({
    mode: 'agent',
    taskSpawned: true,
    sessionId: existingSessionId,
    version: 3,
  });

  // Act: Run hook
  const result = runHook();

  // Assert: Hook succeeded
  assert.strictEqual(result.success, true);

  // Assert: sessionId preserved
  const state = readState();
  assert.strictEqual(state.sessionId, existingSessionId);
  assert.strictEqual(state.taskSpawned, false);
});

// Test 3: Create state file if missing
test('creates state file with defaults if missing', () => {
  // Arrange: No state file exists
  assert.strictEqual(fs.existsSync(STATE_FILE), false);

  // Act: Run hook
  const result = runHook();

  // Assert: Hook succeeded
  assert.strictEqual(result.success, true);

  // Assert: State file created with defaults
  assert.strictEqual(fs.existsSync(STATE_FILE), true);
  const state = readState();
  assert.strictEqual(state.mode, 'router');
  assert.strictEqual(state.taskSpawned, false);
  assert.strictEqual(state.complexity, 'trivial');
});

// Test 4: Atomic write (uses .tmp file)
test('writes atomically using temp file', () => {
  // Arrange: Existing state
  writeState({ mode: 'agent', taskSpawned: true, version: 2 });

  // Act: Run hook
  const result = runHook();

  // Assert: Hook succeeded
  assert.strictEqual(result.success, true);

  // Assert: No .tmp file left behind (atomic write completed)
  const tmpFile = STATE_FILE + '.tmp';
  assert.strictEqual(fs.existsSync(tmpFile), false);

  // Assert: State file updated
  const state = readState();
  assert.strictEqual(state.taskSpawned, false);
});

// Test 5: Directory created if missing
test('creates runtime directory if missing', () => {
  // Arrange: Delete entire runtime directory
  const runtimeDir = path.dirname(STATE_FILE);
  if (fs.existsSync(runtimeDir)) {
    fs.rmSync(runtimeDir, { recursive: true });
  }
  assert.strictEqual(fs.existsSync(runtimeDir), false);

  // Act: Run hook
  const result = runHook();

  // Assert: Hook succeeded
  assert.strictEqual(result.success, true);

  // Assert: Directory created
  assert.strictEqual(fs.existsSync(runtimeDir), true);
  assert.strictEqual(fs.existsSync(STATE_FILE), true);
});

// Test 6: lastReset timestamp updated
test('updates lastReset timestamp on every reset', () => {
  // Arrange: State with old lastReset
  const oldTimestamp = new Date('2020-01-01').toISOString();
  writeState({
    mode: 'agent',
    taskSpawned: true,
    lastReset: oldTimestamp,
    version: 1,
  });

  // Act: Run hook
  const result = runHook();

  // Assert: Hook succeeded
  assert.strictEqual(result.success, true);

  // Assert: lastReset updated to recent timestamp
  const state = readState();
  assert.notStrictEqual(state.lastReset, oldTimestamp);
  assert.ok(new Date(state.lastReset).getTime() > Date.now() - 5000); // Within last 5 seconds
});

// Test 7: TaskUpdate tracking reset
test('resets TaskUpdate tracking fields', () => {
  // Arrange: State with TaskUpdate tracking
  writeState({
    mode: 'agent',
    taskSpawned: true,
    lastTaskUpdateCall: Date.now(),
    lastTaskUpdateTaskId: 'task-123',
    lastTaskUpdateStatus: 'completed',
    taskUpdatesThisSession: 5,
    version: 4,
  });

  // Act: Run hook
  const result = runHook();

  // Assert: Hook succeeded
  assert.strictEqual(result.success, true);

  // Assert: TaskUpdate tracking reset
  const state = readState();
  assert.strictEqual(state.lastTaskUpdateCall, null);
  assert.strictEqual(state.lastTaskUpdateTaskId, null);
  assert.strictEqual(state.lastTaskUpdateStatus, null);
  assert.strictEqual(state.taskUpdatesThisSession, 0);
});
