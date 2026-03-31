#!/usr/bin/env node
'use strict';

/**
 * hook-sentinel-startup.test.cjs
 *
 * Verifies once-per-session sentinel logic for the 5 startup hooks that only
 * need to run once per session:
 *
 *   1. startup-failopen-audit.cjs  — guarded via user-prompt-advisory-bundle
 *   2. worktree-prune-on-start.cjs — guarded via user-prompt-advisory-bundle
 *   3. channel-auto-start.cjs      — self-guarded (individual hook)
 *   4. a2a-server-autostart.cjs    — self-guarded (individual hook)
 *   5. audit-skill-recency.cjs     — self-guarded (pre-existing sentinel)
 *
 * Tests verify:
 *   - hasStartupAlreadyFired() returns false when no sentinel exists
 *   - writeStartupSentinel() creates a sentinel with correct sessionId
 *   - hasStartupAlreadyFired() returns true for same session after write
 *   - hasStartupAlreadyFired() returns false for a different session (new session)
 *   - Sentinel uses timestamp fallback when sessionId is null/unknown
 *   - Bundle sentinel is written after first run, skipped on second run
 *
 * Fulfills: VAL-HO-010
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely delete a file, ignoring errors (e.g., file not found).
 * @param {string} filePath
 */
function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (_err) {
    // File may not exist — ignore
  }
}

/**
 * Run a hook script via spawnSync with optional stdin input.
 *
 * @param {string} scriptPath - Absolute path to the hook script
 * @param {Object} [input] - JSON input to send via stdin (hook input format)
 * @param {Object} [env] - Additional environment variables
 * @returns {import('child_process').SpawnSyncReturns<string>}
 */
function runHook(scriptPath, input, env) {
  const stdinData = input ? JSON.stringify(input) : '{}';
  return spawnSync(process.execPath, [scriptPath], {
    input: stdinData,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...(env || {}) },
    timeout: 15000,
  });
}

// ─── Bundle sentinel tests ────────────────────────────────────────────────────

test('user-prompt-advisory-bundle exports hasStartupAlreadyFired and writeStartupSentinel', () => {
  const bundle = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'user-prompt-advisory-bundle.cjs')
  );
  assert.ok(
    typeof bundle.hasStartupAlreadyFired === 'function',
    'Bundle must export hasStartupAlreadyFired'
  );
  assert.ok(
    typeof bundle.writeStartupSentinel === 'function',
    'Bundle must export writeStartupSentinel'
  );
  assert.ok(
    typeof bundle.STARTUP_SENTINEL_PATH === 'string',
    'Bundle must export STARTUP_SENTINEL_PATH'
  );
});

test('bundle: sentinel functions callable without errors', () => {
  const { hasStartupAlreadyFired, writeStartupSentinel } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'user-prompt-advisory-bundle.cjs')
  );
  // The functions use the module-level STARTUP_SENTINEL_PATH.
  // We verify types and that calling them doesn't throw.
  assert.strictEqual(typeof hasStartupAlreadyFired('nonexistent-session'), 'boolean');
  assert.doesNotThrow(() => writeStartupSentinel('test-noop-' + Date.now()));
});

test('bundle: sentinel write and read roundtrip', () => {
  const { hasStartupAlreadyFired, writeStartupSentinel, STARTUP_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'user-prompt-advisory-bundle.cjs')
  );

  const sessionId = 'test-sentinel-' + Date.now();

  // Clean up sentinel before test
  safeUnlink(STARTUP_SENTINEL_PATH);

  try {
    // Before write: should not be fired for this session
    assert.strictEqual(
      hasStartupAlreadyFired(sessionId),
      false,
      'hasStartupAlreadyFired should return false before sentinel is written'
    );

    // Write sentinel
    writeStartupSentinel(sessionId);

    // After write: should be fired for same session
    assert.strictEqual(
      hasStartupAlreadyFired(sessionId),
      true,
      'hasStartupAlreadyFired should return true after sentinel is written for same session'
    );

    // Different session ID: should NOT be fired (new session)
    assert.strictEqual(
      hasStartupAlreadyFired('different-session-' + Date.now()),
      false,
      'hasStartupAlreadyFired should return false for different session ID'
    );
  } finally {
    safeUnlink(STARTUP_SENTINEL_PATH);
  }
});

test('bundle: hasStartupAlreadyFired uses timestamp fallback for null sessionId', () => {
  const { hasStartupAlreadyFired, writeStartupSentinel, STARTUP_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'user-prompt-advisory-bundle.cjs')
  );

  safeUnlink(STARTUP_SENTINEL_PATH);

  try {
    // Before write: should not be fired
    assert.strictEqual(hasStartupAlreadyFired(null), false);

    // Write with null sessionId (uses 'default')
    writeStartupSentinel(null);

    // After write with null: timestamp-based check returns true (within 1-hour window)
    assert.strictEqual(
      hasStartupAlreadyFired(null),
      true,
      'hasStartupAlreadyFired should return true (timestamp-based) after write with null sessionId'
    );
  } finally {
    safeUnlink(STARTUP_SENTINEL_PATH);
  }
});

test('bundle: first run writes startup sentinel, second run with same sessionId reads it', () => {
  const { STARTUP_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'user-prompt-advisory-bundle.cjs')
  );

  const sessionId = 'bundle-integration-test-' + Date.now();
  const bundlePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'hooks',
    'session',
    'user-prompt-advisory-bundle.cjs'
  );

  safeUnlink(STARTUP_SENTINEL_PATH);

  try {
    // First run
    const result1 = runHook(
      bundlePath,
      { prompt: 'test prompt', session_id: sessionId },
      { CCUSAGE_STATUSLINE: 'off' }
    );
    assert.strictEqual(result1.status, 0, `First run should exit 0. stderr: ${result1.stderr}`);

    // Verify sentinel was written
    assert.ok(
      fs.existsSync(STARTUP_SENTINEL_PATH),
      'Startup sentinel file should be created after first run'
    );
    const sentinel = JSON.parse(fs.readFileSync(STARTUP_SENTINEL_PATH, 'utf8'));
    assert.strictEqual(
      sentinel.sessionId,
      sessionId,
      'Sentinel should contain the correct session ID'
    );

    // Second run with same session ID
    const result2 = runHook(
      bundlePath,
      { prompt: 'test prompt 2', session_id: sessionId },
      { CCUSAGE_STATUSLINE: 'off' }
    );
    assert.strictEqual(
      result2.status,
      0,
      `Second run should also exit 0. stderr: ${result2.stderr}`
    );

    // Sentinel should still exist and have same sessionId (not overwritten by second run)
    const sentinel2 = JSON.parse(fs.readFileSync(STARTUP_SENTINEL_PATH, 'utf8'));
    assert.strictEqual(
      sentinel2.sessionId,
      sessionId,
      'Sentinel sessionId should remain unchanged after second run (startup skipped)'
    );
  } finally {
    safeUnlink(STARTUP_SENTINEL_PATH);
  }
});

test('bundle: new session (different session_id) fires startup hooks again', () => {
  const { STARTUP_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'user-prompt-advisory-bundle.cjs')
  );

  const session1 = 'session-1-' + Date.now();
  const session2 = 'session-2-' + (Date.now() + 1);
  const bundlePath = path.join(
    PROJECT_ROOT,
    '.claude',
    'hooks',
    'session',
    'user-prompt-advisory-bundle.cjs'
  );

  safeUnlink(STARTUP_SENTINEL_PATH);

  try {
    // First session run
    runHook(
      bundlePath,
      { prompt: 'first session', session_id: session1 },
      { CCUSAGE_STATUSLINE: 'off' }
    );

    // Verify sentinel has session1
    const s1 = JSON.parse(fs.readFileSync(STARTUP_SENTINEL_PATH, 'utf8'));
    assert.strictEqual(s1.sessionId, session1);

    // Second session run (different session ID — simulates new session)
    runHook(
      bundlePath,
      { prompt: 'second session', session_id: session2 },
      { CCUSAGE_STATUSLINE: 'off' }
    );

    // Sentinel should be updated to session2
    const s2 = JSON.parse(fs.readFileSync(STARTUP_SENTINEL_PATH, 'utf8'));
    assert.strictEqual(
      s2.sessionId,
      session2,
      'Sentinel should be updated to new session ID (new session fires startup hooks again)'
    );
  } finally {
    safeUnlink(STARTUP_SENTINEL_PATH);
  }
});

// ─── channel-auto-start.cjs sentinel tests ───────────────────────────────────

test('channel-auto-start: exports hasStartupAlreadyFired, writeStartupSentinel, CHANNEL_SENTINEL_PATH', () => {
  const hook = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'channels', 'channel-auto-start.cjs')
  );
  assert.ok(
    typeof hook.hasStartupAlreadyFired === 'function',
    'Must export hasStartupAlreadyFired'
  );
  assert.ok(typeof hook.writeStartupSentinel === 'function', 'Must export writeStartupSentinel');
  assert.ok(typeof hook.CHANNEL_SENTINEL_PATH === 'string', 'Must export CHANNEL_SENTINEL_PATH');
});

test('channel-auto-start: sentinel write/read roundtrip', () => {
  const { hasStartupAlreadyFired, writeStartupSentinel, CHANNEL_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'channels', 'channel-auto-start.cjs')
  );

  const sessionId = 'channel-test-' + Date.now();

  safeUnlink(CHANNEL_SENTINEL_PATH);

  try {
    assert.strictEqual(hasStartupAlreadyFired(sessionId), false, 'Should be false before write');
    writeStartupSentinel(sessionId);
    assert.strictEqual(
      hasStartupAlreadyFired(sessionId),
      true,
      'Should be true after write (same session)'
    );
    assert.strictEqual(
      hasStartupAlreadyFired('other-session-' + Date.now()),
      false,
      'Should be false for different session ID'
    );
  } finally {
    safeUnlink(CHANNEL_SENTINEL_PATH);
  }
});

test('channel-auto-start: first run writes sentinel', () => {
  const { CHANNEL_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'channels', 'channel-auto-start.cjs')
  );

  const sessionId = 'channel-run-test-' + Date.now();
  const hookPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'hooks',
    'channels',
    'channel-auto-start.cjs'
  );

  safeUnlink(CHANNEL_SENTINEL_PATH);

  try {
    // Run with CHANNEL_AUTO_START=false (so it exits early but still writes sentinel)
    const result = runHook(
      hookPath,
      { prompt: 'test', session_id: sessionId },
      { CHANNEL_AUTO_START: 'false', TELEGRAM_BOT_TOKEN: '' }
    );
    assert.strictEqual(result.status, 0, `Hook should exit 0. stderr: ${result.stderr}`);

    // Sentinel should be written after first run
    assert.ok(
      fs.existsSync(CHANNEL_SENTINEL_PATH),
      'Sentinel file should be written after first run'
    );
    const sentinel = JSON.parse(fs.readFileSync(CHANNEL_SENTINEL_PATH, 'utf8'));
    assert.strictEqual(sentinel.sessionId, sessionId, 'Sentinel should contain correct session ID');
  } finally {
    safeUnlink(CHANNEL_SENTINEL_PATH);
  }
});

test('channel-auto-start: second run (same session) sentinel check returns true (skip)', () => {
  const { hasStartupAlreadyFired, writeStartupSentinel, CHANNEL_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'channels', 'channel-auto-start.cjs')
  );

  const sessionId = 'channel-skip-test-' + Date.now();

  safeUnlink(CHANNEL_SENTINEL_PATH);

  try {
    // Write sentinel for this session
    writeStartupSentinel(sessionId);

    // Verify sentinel check returns true (would skip on second run)
    assert.strictEqual(
      hasStartupAlreadyFired(sessionId),
      true,
      'hasStartupAlreadyFired should return true for the session that wrote the sentinel'
    );

    // New session should return false (would fire again)
    assert.strictEqual(
      hasStartupAlreadyFired('new-session-' + Date.now()),
      false,
      'hasStartupAlreadyFired should return false for new session ID'
    );
  } finally {
    safeUnlink(CHANNEL_SENTINEL_PATH);
  }
});

// ─── a2a-server-autostart.cjs sentinel tests ─────────────────────────────────

test('a2a-server-autostart: exports hasStartupAlreadyFired, writeStartupSentinel, A2A_SENTINEL_PATH', () => {
  const hook = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'a2a', 'a2a-server-autostart.cjs')
  );
  assert.ok(
    typeof hook.hasStartupAlreadyFired === 'function',
    'Must export hasStartupAlreadyFired'
  );
  assert.ok(typeof hook.writeStartupSentinel === 'function', 'Must export writeStartupSentinel');
  assert.ok(typeof hook.A2A_SENTINEL_PATH === 'string', 'Must export A2A_SENTINEL_PATH');
});

test('a2a-server-autostart: sentinel write/read roundtrip', () => {
  const { hasStartupAlreadyFired, writeStartupSentinel, A2A_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'a2a', 'a2a-server-autostart.cjs')
  );

  const sessionId = 'a2a-test-' + Date.now();

  safeUnlink(A2A_SENTINEL_PATH);

  try {
    assert.strictEqual(hasStartupAlreadyFired(sessionId), false, 'Should be false before write');
    writeStartupSentinel(sessionId);
    assert.strictEqual(
      hasStartupAlreadyFired(sessionId),
      true,
      'Should be true after write (same session)'
    );
    assert.strictEqual(
      hasStartupAlreadyFired('different-' + Date.now()),
      false,
      'Should be false for different session ID'
    );
  } finally {
    safeUnlink(A2A_SENTINEL_PATH);
  }
});

test('a2a-server-autostart: first run writes sentinel', () => {
  const { A2A_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'a2a', 'a2a-server-autostart.cjs')
  );

  const sessionId = 'a2a-run-test-' + Date.now();
  const hookPath = path.join(PROJECT_ROOT, '.claude', 'hooks', 'a2a', 'a2a-server-autostart.cjs');

  safeUnlink(A2A_SENTINEL_PATH);

  try {
    // Run with A2A_AUTO_START=false (exits early but still writes sentinel)
    const result = runHook(
      hookPath,
      { prompt: 'test', session_id: sessionId },
      { A2A_AUTO_START: 'false' }
    );
    assert.strictEqual(result.status, 0, `Hook should exit 0. stderr: ${result.stderr}`);

    // Sentinel should be written after first run
    assert.ok(fs.existsSync(A2A_SENTINEL_PATH), 'Sentinel file should be written after first run');
    const sentinel = JSON.parse(fs.readFileSync(A2A_SENTINEL_PATH, 'utf8'));
    assert.strictEqual(sentinel.sessionId, sessionId, 'Sentinel should contain correct session ID');
  } finally {
    safeUnlink(A2A_SENTINEL_PATH);
  }
});

test('a2a-server-autostart: second run (same session) sentinel check returns true (skip)', () => {
  const { hasStartupAlreadyFired, writeStartupSentinel, A2A_SENTINEL_PATH } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'a2a', 'a2a-server-autostart.cjs')
  );

  const sessionId = 'a2a-skip-test-' + Date.now();

  safeUnlink(A2A_SENTINEL_PATH);

  try {
    writeStartupSentinel(sessionId);
    assert.strictEqual(
      hasStartupAlreadyFired(sessionId),
      true,
      'hasStartupAlreadyFired should be true after sentinel is written (same session)'
    );
    assert.strictEqual(
      hasStartupAlreadyFired('new-session-' + Date.now()),
      false,
      'hasStartupAlreadyFired should be false for a different session ID (new session fires again)'
    );
  } finally {
    safeUnlink(A2A_SENTINEL_PATH);
  }
});

// ─── audit-skill-recency.cjs sentinel tests ───────────────────────────────────

test('audit-skill-recency: exports hasAlreadyFiredThisSession and writeSentinel', () => {
  const audit = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'audit-skill-recency.cjs')
  );
  assert.ok(
    typeof audit.hasAlreadyFiredThisSession === 'function',
    'audit-skill-recency must export hasAlreadyFiredThisSession'
  );
  assert.ok(
    typeof audit.writeSentinel === 'function',
    'audit-skill-recency must export writeSentinel'
  );
});

test('audit-skill-recency: sentinel write/read roundtrip', () => {
  const { hasAlreadyFiredThisSession, writeSentinel } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'audit-skill-recency.cjs')
  );

  // audit-skill-recency uses its own SENTINEL_PATH (internal constant).
  // Save and restore existing sentinel content to avoid test contamination.
  const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
  const SENTINEL_PATH = path.join(RUNTIME_DIR, 'audit-skill-recency.sentinel');

  let originalContent = null;
  try {
    if (fs.existsSync(SENTINEL_PATH)) {
      originalContent = fs.readFileSync(SENTINEL_PATH, 'utf8');
    }
  } catch (_err) {
    // Ignore read errors
  }

  safeUnlink(SENTINEL_PATH);

  try {
    const sessionId = 'audit-test-' + Date.now();

    // Before write: should not have fired
    assert.strictEqual(
      hasAlreadyFiredThisSession(sessionId),
      false,
      'Should be false before sentinel is written'
    );

    // Write sentinel
    writeSentinel(sessionId);

    // After write: should have fired for same session
    assert.strictEqual(
      hasAlreadyFiredThisSession(sessionId),
      true,
      'Should be true after sentinel is written for same session'
    );

    // Different session: should not have fired
    assert.strictEqual(
      hasAlreadyFiredThisSession('other-session-' + Date.now()),
      false,
      'Should be false for a different session ID'
    );
  } finally {
    // Restore original sentinel content
    safeUnlink(SENTINEL_PATH);
    if (originalContent !== null) {
      try {
        fs.writeFileSync(SENTINEL_PATH, originalContent, 'utf8');
      } catch (_err) {
        // Non-fatal
      }
    }
  }
});

// ─── sentinel does not persist across sessions ────────────────────────────────

test('startup sentinels: different session IDs do not conflict (session isolation)', () => {
  const {
    hasStartupAlreadyFired: bundleHas,
    writeStartupSentinel: bundleWrite,
    STARTUP_SENTINEL_PATH,
  } = require(
    path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'user-prompt-advisory-bundle.cjs')
  );

  const session1 = 'isolation-1-' + Date.now();
  const session2 = 'isolation-2-' + Date.now();

  safeUnlink(STARTUP_SENTINEL_PATH);

  try {
    // Write for session1
    bundleWrite(session1);

    // session1 should be fired
    assert.strictEqual(bundleHas(session1), true, 'session1 should be fired');

    // session2 should NOT be fired (different session = new session)
    assert.strictEqual(bundleHas(session2), false, 'session2 should NOT be fired (new session)');

    // Write for session2 (simulates new session starting)
    bundleWrite(session2);

    // Now session2 should be fired
    assert.strictEqual(bundleHas(session2), true, 'session2 should now be fired');

    // session1 is no longer fired (sentinel was overwritten by session2)
    assert.strictEqual(bundleHas(session1), false, 'session1 should no longer be fired');
  } finally {
    safeUnlink(STARTUP_SENTINEL_PATH);
  }
});
