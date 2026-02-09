#!/usr/bin/env node
/**
 * Tests for drift-detector.cjs
 *
 * Tests the session intent drift detection hook which tracks
 * the original user intent and warns when subsequent prompts drift away.
 *
 * Test Categories:
 * 1. First prompt stores intent
 * 2. Related prompts (>20% overlap) do not trigger warning
 * 3. Unrelated prompts after 6+ edits trigger warning
 * 4. "new task" patterns reset intent
 * 5. Malformed JSON handled gracefully
 * 6. Missing state file creates new one
 * 7. Session ID sanitization
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Test helpers
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message || 'Assertion failed'}: expected truthy value, got ${value}`);
  }
}

function assertIncludes(str, substring, message) {
  if (!str.includes(substring)) {
    throw new Error(
      `${message || 'Assertion failed'}: expected string to include "${substring}", got "${str}"`
    );
  }
}

function assertNotIncludes(str, substring, message) {
  if (str.includes(substring)) {
    throw new Error(
      `${message || 'Assertion failed'}: expected string NOT to include "${substring}", got "${str}"`
    );
  }
}

// Paths
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'drift-detector.cjs');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const STATE_FILE = path.join(RUNTIME_DIR, 'drift-state.json');

// Ensure runtime directory exists
if (!fs.existsSync(RUNTIME_DIR)) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

// Clean up state file before tests
function cleanupState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

// Run hook with input
function runHook(userPrompt, sessionId = 'test-session') {
  const input = {
    tool_name: 'UserPromptSubmit',
    message: userPrompt,
    prompt: userPrompt,
  };

  const oldEnv = process.env.CLAUDE_SESSION_ID;
  try {
    process.env.CLAUDE_SESSION_ID = sessionId;
    // Use spawnSync to avoid command injection
    const spawnResult = require('child_process').spawnSync('node', [HOOK_PATH], {
      input: JSON.stringify(input),
      encoding: 'utf-8',
      env: process.env,
      shell: false,
    });
    const result = spawnResult.stdout + spawnResult.stderr;

    // Check if output contains stderr markers
    const lines = result.split('\n');
    let stdout = '';
    let stderr = '';
    let inStderr = false;

    for (const line of lines) {
      if (line.includes('[drift-detector]')) {
        stderr += line + '\n';
        inStderr = true;
      } else if (inStderr && line.trim() === '') {
        inStderr = false;
      } else if (inStderr) {
        stderr += line + '\n';
      } else {
        stdout += line + '\n';
      }
    }

    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
      exitCode: err.status || 1,
    };
  } finally {
    if (oldEnv !== undefined) {
      process.env.CLAUDE_SESSION_ID = oldEnv;
    } else {
      delete process.env.CLAUDE_SESSION_ID;
    }
  }
}

// Helper to run hook and get state
function runAndGetState(userPrompt, sessionId = 'test-session') {
  const result = runHook(userPrompt, sessionId);
  let state = null;
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return { result, state };
}

console.log('\n=== drift-detector.cjs tests ===\n');

// ============================================================
// Test 1: First prompt stores intent
// ============================================================

console.log('--- First Prompt Storage ---');

test('first prompt creates state file', () => {
  cleanupState();
  const { state } = runAndGetState('Add authentication to the app');
  assertTrue(state !== null, 'State file should be created');
  assertEqual(state.sessionId, 'test-session', 'Session ID should match');
  assertTrue(state.originalIntent, 'Original intent should be stored');
  assertTrue(Array.isArray(state.originalKeywords), 'Keywords should be array');
  assertEqual(state.editCount, 1, 'Edit count should be 1');
});

test('first prompt extracts intent from first sentence', () => {
  cleanupState();
  const { state } = runAndGetState(
    'Add user authentication to the app. Make sure it uses JWT tokens.'
  );
  // Should extract first 200 chars of first sentence
  assertTrue(
    state.originalIntent.includes('Add user authentication'),
    'Intent should include start of prompt'
  );
  assertTrue(state.originalIntent.length <= 200, 'Intent should be truncated to 200 chars');
});

test('first prompt extracts keywords correctly', () => {
  cleanupState();
  const { state } = runAndGetState('Add authentication to the user management system');
  // Should have keywords: "add", "authentication", "user", "management", "system"
  // Stop words filtered: "to", "the"
  assertTrue(state.originalKeywords.includes('authentication'), 'Should include authentication');
  assertTrue(state.originalKeywords.includes('user'), 'Should include user');
  assertTrue(!state.originalKeywords.includes('the'), 'Should filter stop words');
});

// ============================================================
// Test 2: Related prompts do not trigger warning
// ============================================================

console.log('\n--- Related Prompt Detection ---');

test('related prompt with >20% overlap does not warn', () => {
  cleanupState();
  // First prompt
  runHook('Add authentication to the app');
  // Related second prompt (shares keywords: authentication, app, user)
  const { result } = runAndGetState('Update authentication middleware for user login');
  assertEqual(result.exitCode, 0, 'Should exit 0');
  assertNotIncludes(result.stderr, 'drift', 'Should not warn about drift');
});

// ============================================================
// Test 3: Unrelated prompts after 6+ edits trigger warning
// ============================================================

console.log('\n--- Drift Warning After 6+ Edits ---');

test('unrelated prompt after 6+ edits triggers drift warning', () => {
  cleanupState();
  // First prompt (auth-related)
  runHook('Add authentication to the app');
  // 5 related prompts to reach 6 edits
  runHook('Add JWT token generation');
  runHook('Add login endpoint');
  runHook('Add user session management');
  runHook('Add password hashing');
  runHook('Add token refresh');
  // 7th prompt - completely unrelated
  const { result, state } = runAndGetState('Create a fancy animated navbar with CSS');
  assertEqual(state.editCount, 7, 'Edit count should be 7');
  assertEqual(result.exitCode, 0, 'Should always exit 0');
  // Check stderr for drift warning
  assertIncludes(result.stderr, 'drift', 'Should warn about drift');
});

// ============================================================
// Test 4: "New task" patterns reset intent
// ============================================================

console.log('\n--- Intent Reset Patterns ---');

test('"now let\'s" pattern resets intent', () => {
  cleanupState();
  runHook('Add authentication to the app');
  const { state: beforeState } = runAndGetState('Add JWT tokens');
  const beforeIntent = beforeState.originalIntent;
  const beforeCount = beforeState.editCount;

  // Reset with "now let's"
  const { state: afterState } = runAndGetState("Now let's create a dashboard component");
  assertTrue(afterState.originalIntent !== beforeIntent, 'Intent should be reset');
  assertTrue(afterState.editCount < beforeCount, 'Edit count should be reset');
});

test('"switch to" pattern resets intent', () => {
  cleanupState();
  runHook('Add authentication to the app');
  runHook('Add JWT tokens');
  // Reset with "switch to"
  const { state } = runAndGetState('Switch to working on the frontend components');
  assertTrue(
    state.originalIntent.includes('frontend'),
    'Intent should reflect new task'
  );
});

test('"new task" pattern resets intent', () => {
  cleanupState();
  runHook('Add authentication to the app');
  runHook('Add JWT tokens');
  // Reset with "new task"
  const { state } = runAndGetState('New task: implement the payment gateway');
  assertTrue(state.originalIntent.includes('payment'), 'Intent should reflect new task');
});

// ============================================================
// Test 5: Malformed JSON handled gracefully
// ============================================================

console.log('\n--- Error Handling ---');

test('malformed JSON input falls through gracefully', () => {
  cleanupState();
  const malformedInput = '{ invalid json }';
  const { status } = require('child_process').spawnSync('node', [HOOK_PATH], {
    input: malformedInput,
    encoding: 'utf-8',
    env: process.env,
    shell: false,
  });
  const exitCode = status || 0;
  // Should exit 0 (fail-open)
  assertEqual(exitCode, 0, 'Should exit 0 on malformed input');
});

// ============================================================
// Test 6: Missing state file creates new one
// ============================================================

console.log('\n--- State File Creation ---');

test('missing state file creates new one without crashing', () => {
  cleanupState();
  const { state } = runAndGetState('Add authentication to the app');
  assertTrue(state !== null, 'State file should be created');
  assertTrue(fs.existsSync(STATE_FILE), 'State file should exist on disk');
});

// ============================================================
// Test 7: Session ID sanitization
// ============================================================

console.log('\n--- Session ID Sanitization ---');

test('session ID with ../ is sanitized', () => {
  cleanupState();
  const { state } = runAndGetState('Add authentication', '../malicious');
  assertEqual(state.sessionId, '___malicious', 'Should sanitize ../ to ___');
});

test('session ID with ..\\\\ is sanitized', () => {
  cleanupState();
  const { state } = runAndGetState('Add authentication', '..\\malicious');
  assertEqual(state.sessionId, '___malicious', 'Should sanitize ..\\\\ to ___');
});

test('session ID with null bytes is sanitized', () => {
  cleanupState();
  const { state } = runAndGetState('Add authentication', 'test\x00null');
  assertTrue(!state.sessionId.includes('\x00'), 'Should remove null bytes');
});

// ============================================================
// Summary
// ============================================================

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

process.exit(failed > 0 ? 1 : 0);
