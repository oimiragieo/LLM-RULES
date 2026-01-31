#!/usr/bin/env node
/**
 * Router Mode Reset Hook - Test Suite
 *
 * Tests the UserPromptSubmit hook that resets router state
 * to "router" mode on each new user prompt.
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.join(__dirname, 'router-mode-reset.cjs');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');

// Test utilities
let testsFailed = 0;
let testsPass = 0;
let originalStateContent = '';

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    testsFailed++;
    return false;
  }
  console.log(`PASS: ${message}`);
  testsPass++;
  return true;
}

/**
 * Backup state file before tests
 */
function backupState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      originalStateContent = fs.readFileSync(STATE_FILE, 'utf-8');
    }
  } catch (_e) {
    originalStateContent = '';
  }
}

/**
 * Restore state file after tests
 */
function restoreState() {
  try {
    if (originalStateContent) {
      fs.writeFileSync(STATE_FILE, originalStateContent);
    } else if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
    }
  } catch (_e) {
    console.error('Warning: Could not restore state file');
  }
}

/**
 * Run the hook with given context via command line argument
 */
async function runHook(context, env = {}) {
  return new Promise((resolve, reject) => {
    const args = context ? [HOOK_PATH, JSON.stringify(context)] : [HOOK_PATH];
    const proc = spawn('node', args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', c => {
      stdout += c;
    });
    proc.stderr.on('data', c => {
      stderr += c;
    });
    proc.on('error', e => reject(e));
    proc.on('close', code => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    setTimeout(() => proc.kill('SIGTERM'), 5000);
  });
}

/**
 * Get current state from file
 */
function getState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (_e) {
    // Ignore
  }
  return null;
}

/**
 * Set state manually
 */
function setState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Test that hook resets mode to router
 */
async function testResetsToRouterMode() {
  console.log('\nTest 1: Resets mode to router');

  // Set up agent mode
  setState({
    mode: 'agent',
    taskSpawned: true,
    taskSpawnedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago (old task)
    taskDescription: 'Old task',
  });

  const context = { prompt: 'New user prompt' };
  const { code } = await runHook(context);

  assert(code === 0, `Hook should exit with code 0, got ${code}`);

  const state = getState();
  assert(state !== null, 'State file should exist');
  assert(state.mode === 'router', 'Mode should be reset to router');
  assert(state.taskSpawned === false, 'taskSpawned should be false');
}

/**
 * Test that hook skips reset for active agent context
 */
async function testSkipsResetForActiveAgentContext() {
  console.log('\nTest 2: Skips reset for active agent context');

  // Set up recent agent mode
  setState({
    mode: 'agent',
    taskSpawned: true,
    taskSpawnedAt: new Date().toISOString(), // Just now
    taskDescription: 'Active task',
  });

  const context = { prompt: 'User prompt during active task' };
  const { code, _stdout } = await runHook(context, { ROUTER_DEBUG: 'true' });

  assert(code === 0, `Hook should exit with code 0, got ${code}`);

  const state = getState();
  assert(state.mode === 'agent', 'Mode should remain agent for active context');
  assert(state.taskSpawned === true, 'taskSpawned should remain true');
}

/**
 * Test that hook skips slash commands
 */
async function testSkipsSlashCommands() {
  console.log('\nTest 3: Skips slash commands');

  // Set up agent mode
  setState({
    mode: 'agent',
    taskSpawned: true,
    taskSpawnedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    taskDescription: 'Task',
  });

  const context = { prompt: '/status' };
  const { code } = await runHook(context);

  assert(code === 0, `Hook should exit with code 0, got ${code}`);

  // Should skip reset for slash commands
  const state = getState();
  assert(state.mode === 'agent', 'Mode should remain unchanged for slash commands');
}

/**
 * Test that hook handles empty input
 */
async function testHandlesEmptyInput() {
  console.log('\nTest 4: Handles empty input');

  setState({
    mode: 'agent',
    taskSpawned: true,
    taskSpawnedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    taskDescription: 'Task',
  });

  const { code } = await runHook(null);

  assert(code === 0, `Hook should exit with code 0, got ${code}`);

  const state = getState();
  assert(state.mode === 'router', 'Mode should be reset for empty input');
}

/**
 * Test debug output
 */
async function testDebugOutput() {
  console.log('\nTest 5: Debug output');

  setState({
    mode: 'router',
    taskSpawned: false,
  });

  const context = { prompt: 'Test prompt' };
  const { stdout } = await runHook(context, { ROUTER_DEBUG: 'true' });

  assert(stdout.includes('router-mode-reset'), 'Should include hook name in debug output');
  assert(stdout.includes('router mode'), 'Should indicate reset to router mode');
}

/**
 * Test that state includes lastReset timestamp
 */
async function testLastResetTimestamp() {
  console.log('\nTest 6: lastReset timestamp');

  setState({
    mode: 'router',
    taskSpawned: false,
    lastReset: null,
  });

  const context = { prompt: 'Test prompt' };
  await runHook(context);

  const state = getState();
  assert(state.lastReset !== null, 'lastReset should be set');
  const resetTime = new Date(state.lastReset);
  const now = new Date();
  assert(now - resetTime < 5000, 'lastReset should be recent');
}

/**
 * Test that complexity tracking fields are reset
 */
async function testResetsComplexityTracking() {
  console.log('\nTest 7: Resets complexity tracking');

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

  const context = { prompt: 'New prompt' };
  await runHook(context);

  const state = getState();
  assert(state.complexity === 'trivial', 'Complexity should be reset to trivial');
  assert(state.requiresPlannerFirst === false, 'requiresPlannerFirst should be reset');
  assert(state.plannerSpawned === false, 'plannerSpawned should be reset');
  assert(state.requiresSecurityReview === false, 'requiresSecurityReview should be reset');
  assert(state.securitySpawned === false, 'securitySpawned should be reset');
}

/**
 * Test that TaskUpdate tracking fields are reset
 */
async function testResetsTaskUpdateTracking() {
  console.log('\nTest 8: Resets TaskUpdate tracking');

  setState({
    mode: 'agent',
    taskSpawned: true,
    taskSpawnedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lastTaskUpdateCall: Date.now(),
    lastTaskUpdateTaskId: '123',
    lastTaskUpdateStatus: 'completed',
    taskUpdatesThisSession: 5,
  });

  const context = { prompt: 'New prompt' };
  await runHook(context);

  const state = getState();
  assert(state.lastTaskUpdateCall === null, 'lastTaskUpdateCall should be reset');
  assert(state.lastTaskUpdateTaskId === null, 'lastTaskUpdateTaskId should be reset');
  assert(state.lastTaskUpdateStatus === null, 'lastTaskUpdateStatus should be reset');
  assert(state.taskUpdatesThisSession === 0, 'taskUpdatesThisSession should be reset');
}

/**
 * Main test runner
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Router Mode Reset Hook Test Suite');
  console.log('='.repeat(60));

  backupState();

  try {
    await testResetsToRouterMode();
    await testSkipsResetForActiveAgentContext();
    await testSkipsSlashCommands();
    await testHandlesEmptyInput();
    await testDebugOutput();
    await testLastResetTimestamp();
    await testResetsComplexityTracking();
    await testResetsTaskUpdateTracking();
  } finally {
    restoreState();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Tests passed: ${testsPass}`);
  console.log(`Tests failed: ${testsFailed}`);
  console.log('='.repeat(60));

  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test runner error:', e);
  restoreState();
  process.exit(1);
});
