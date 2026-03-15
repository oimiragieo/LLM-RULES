'use strict';

/**
 * TDD RED Phase: Tests for session-budget-watchdog.cjs
 *
 * This hook fires on UserPromptSubmit and reads budget-tracker.json
 * to inject advisory/warning/critical messages at token thresholds.
 *
 * 3-tier threshold model (per council review):
 *   - 140K tokens: advisory
 *   - 160K tokens: strong warning
 *   - 180K tokens: critical
 *
 * All tests should FAIL until implementation exists.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const HOOK_PATH = path.join(process.cwd(), '.claude/hooks/session/session-budget-watchdog.cjs');

// Helper: create isolated tmp runtime dir with budget-tracker.json
function setupRuntime(budgetData, opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'watchdog-test-'));
  const runtimeDir = path.join(tmpDir, '.claude', 'context', 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  if (budgetData !== null) {
    fs.writeFileSync(
      path.join(runtimeDir, 'budget-tracker.json'),
      typeof budgetData === 'string' ? budgetData : JSON.stringify(budgetData),
      'utf8'
    );
  }

  if (opts.sessionId) {
    fs.writeFileSync(
      path.join(runtimeDir, 'session-id.json'),
      JSON.stringify({ sessionId: opts.sessionId }),
      'utf8'
    );
  }

  if (opts.sentinelTier) {
    // Create per-tier sentinel file to simulate already-fired state
    fs.writeFileSync(
      path.join(runtimeDir, `session-handoff-reminder-${opts.sentinelTier}K.txt`),
      `Fired at ${new Date().toISOString()}`,
      'utf8'
    );
  }

  return { tmpDir, runtimeDir };
}

function cleanupRuntime(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function runHookInDir(inputJson, cwd, env = {}) {
  const result = execFileSync('node', [HOOK_PATH], {
    input: JSON.stringify(inputJson || {}),
    env: { ...process.env, ...env },
    cwd: cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 5000,
  });
  return JSON.parse(result);
}

// --- Test 1: Advisory fires at exactly 140K tokens ---
test('session-budget-watchdog > advisory fires at exactly 140K tokens', () => {
  const { tmpDir } = setupRuntime(
    {
      'test-session': { totalTokens: 140000, budget: 200000 },
    },
    { sessionId: 'test-session' }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true, 'Advisory should not block');
    assert.ok(res.message, 'Should inject advisory message at 140K');
    assert.ok(res.message.toLowerCase().includes('140'), 'Message should reference 140K threshold');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 2: Advisory does NOT fire at 139K tokens ---
test('session-budget-watchdog > does NOT fire at 139K tokens', () => {
  const { tmpDir } = setupRuntime(
    {
      'test-session': { totalTokens: 139000, budget: 200000 },
    },
    { sessionId: 'test-session' }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true);
    assert.ok(!res.message, 'Should NOT inject message below 140K');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 3: Strong warning fires at exactly 160K tokens ---
test('session-budget-watchdog > strong warning fires at exactly 160K tokens', () => {
  const { tmpDir } = setupRuntime(
    {
      'test-session': { totalTokens: 160000, budget: 200000 },
    },
    { sessionId: 'test-session' }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true, 'Strong warning should not block');
    assert.ok(res.message, 'Should inject strong warning at 160K');
    assert.ok(res.message.toLowerCase().includes('160'), 'Message should reference 160K threshold');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 4: Critical fires at exactly 180K tokens ---
test('session-budget-watchdog > critical fires at exactly 180K tokens', () => {
  const { tmpDir } = setupRuntime(
    {
      'test-session': { totalTokens: 180000, budget: 200000 },
    },
    { sessionId: 'test-session' }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true, 'Critical should still allow (advisory hook)');
    assert.ok(res.message, 'Should inject critical message at 180K');
    assert.ok(
      res.message.toLowerCase().includes('180') || res.message.toLowerCase().includes('critical'),
      'Message should reference 180K or critical severity'
    );
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 5: Each tier fires independently (140K does NOT fire 160K behavior) ---
test('session-budget-watchdog > 140K tier does not trigger 160K or 180K behavior', () => {
  const { tmpDir } = setupRuntime(
    {
      'test-session': { totalTokens: 141000, budget: 200000 },
    },
    { sessionId: 'test-session' }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true);
    assert.ok(res.message, 'Should fire advisory');
    // Should NOT contain strong warning or critical language
    assert.ok(
      !res.message.toLowerCase().includes('critical'),
      '140K tier should not use critical language'
    );
    assert.ok(
      !res.message.toLowerCase().includes('stop'),
      '140K tier should not tell user to STOP'
    );
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 6: Reads correct session key from multi-key budget-tracker.json ---
test('session-budget-watchdog > reads correct session key from multi-key budget-tracker.json', () => {
  const { tmpDir } = setupRuntime(
    {
      unknown: { totalTokens: 500000, budget: 200000 },
      'my-session': { totalTokens: 50000, budget: 200000 },
      'other-session': { totalTokens: 180000, budget: 200000 },
    },
    { sessionId: 'my-session' }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true);
    // my-session is at 50K, should NOT trigger any warning
    assert.ok(!res.message, 'Should not fire for my-session at 50K even though unknown is at 500K');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 7: Creates per-tier sentinel files to prevent repeated firing ---
test('session-budget-watchdog > creates per-tier sentinel file on first fire', () => {
  const { tmpDir, runtimeDir } = setupRuntime(
    {
      'test-session': { totalTokens: 160000, budget: 200000 },
    },
    { sessionId: 'test-session' }
  );

  try {
    runHookInDir({}, tmpDir);
    const sentinelPath = path.join(runtimeDir, 'session-handoff-reminder-160K.txt');
    assert.ok(fs.existsSync(sentinelPath), 'Should create sentinel file for 160K tier');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 8: Sentinel prevents re-trigger if already fired for that tier ---
test('session-budget-watchdog > sentinel prevents re-trigger for same tier', () => {
  const { tmpDir } = setupRuntime(
    { 'test-session': { totalTokens: 160000, budget: 200000 } },
    { sessionId: 'test-session', sentinelTier: 160 }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true);
    assert.ok(!res.message, 'Should NOT re-fire 160K warning when sentinel already exists');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 9: Fails gracefully (exit 0) when budget-tracker.json missing ---
test('session-budget-watchdog > fails gracefully when budget-tracker.json missing', () => {
  const { tmpDir } = setupRuntime(null, { sessionId: 'test-session' });

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true, 'Should allow when file missing (fail-open)');
    assert.ok(!res.message, 'Should not inject any message');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 10: Fails gracefully when budget-tracker.json is malformed ---
test('session-budget-watchdog > fails gracefully when budget-tracker.json is malformed', () => {
  const { tmpDir } = setupRuntime('not valid json {{{', { sessionId: 'test-session' });

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true, 'Should allow on malformed JSON (fail-open)');
    assert.ok(!res.message, 'Should not inject any message');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 11: Does NOT block tool execution at advisory tier (exit 0 + message) ---
test('session-budget-watchdog > does not block tool execution at any tier', () => {
  const { tmpDir } = setupRuntime(
    {
      'test-session': { totalTokens: 180000, budget: 200000 },
    },
    { sessionId: 'test-session' }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    // Even at critical tier, advisory hooks should allow (exit 0)
    assert.strictEqual(res.allow, true, 'Must allow at all tiers (advisory hook)');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 12: Surfaces message at critical tier ---
test('session-budget-watchdog > surfaces message at critical tier (180K)', () => {
  const { tmpDir } = setupRuntime(
    {
      'test-session': { totalTokens: 185000, budget: 200000 },
    },
    { sessionId: 'test-session' }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.ok(res.message, 'Must surface a message at critical tier');
    assert.ok(
      res.message.toLowerCase().includes('handoff') ||
        res.message.toLowerCase().includes('session'),
      'Critical message should mention handoff or session'
    );
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 13: Falls back to "unknown" key when session-id.json missing ---
test('session-budget-watchdog > falls back to unknown key when session-id.json missing', () => {
  const { tmpDir } = setupRuntime({
    unknown: { totalTokens: 160000, budget: 200000 },
  });
  // Note: no sessionId option — session-id.json will not exist

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true);
    assert.ok(res.message, 'Should fire warning using "unknown" key fallback');
  } finally {
    cleanupRuntime(tmpDir);
  }
});

// --- Test 14: Higher tier fires even when lower tier sentinel exists ---
test('session-budget-watchdog > 160K fires even when 140K sentinel already exists', () => {
  const { tmpDir } = setupRuntime(
    { 'test-session': { totalTokens: 165000, budget: 200000 } },
    { sessionId: 'test-session', sentinelTier: 140 }
  );

  try {
    const res = runHookInDir({}, tmpDir);
    assert.strictEqual(res.allow, true);
    assert.ok(res.message, 'Should fire 160K warning even though 140K sentinel exists');
  } finally {
    cleanupRuntime(tmpDir);
  }
});
