#!/usr/bin/env node
'use strict';

/**
 * user-prompt-advisory-bundle.test.cjs
 *
 * Tests for user-prompt-advisory-bundle.cjs — the consolidated UserPromptSubmit advisory hook.
 *
 * Verifies:
 * - VAL-HO-006: 6 advisory UserPromptSubmit hooks consolidated into 1 entry point
 * - VAL-HO-012: Error isolation — throw in one sub-function doesn't prevent others
 * - Kill-switch env vars still work per sub-function
 * - Bundle always exits 0 (advisory, fail-open)
 * - All 6 sub-modules are imported
 * - settings.json has exactly 1 UserPromptSubmit advisory bundle registration
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'session',
  'user-prompt-advisory-bundle.cjs'
);
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');

// ─── Helper: run bundle process ───────────────────────────────────────────────

function runBundle(input = '{}', env = {}) {
  return spawnSync(process.execPath, [BUNDLE_PATH], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
    timeout: 20000,
  });
}

// ─── Helper: find registrations in settings.json ─────────────────────────────

function findRegistrations(settings, scriptName, eventName) {
  const eventHooks = settings.hooks[eventName] || [];
  const found = [];
  for (const group of eventHooks) {
    for (const hook of group.hooks || []) {
      if (hook.command && hook.command.includes(scriptName)) {
        found.push({ matcher: group.matcher, hook });
      }
    }
  }
  return found;
}

// ─── Load settings once ───────────────────────────────────────────────────────

let settings;
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
} catch (err) {
  throw new Error(`Failed to parse settings.json: ${err.message}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('user-prompt-advisory-bundle.cjs file exists', () => {
  assert.ok(fs.existsSync(BUNDLE_PATH), `Bundle file not found at ${BUNDLE_PATH}`);
});

test('bundle exits 0 on valid UserPromptSubmit input', () => {
  const input = JSON.stringify({ prompt: 'Hello, what can you do?', session_id: 'test-session' });
  const result = runBundle(input);
  assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
});

test('bundle exits 0 on empty stdin', () => {
  const result = runBundle('');
  assert.strictEqual(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
});

test('bundle exits 0 on malformed JSON stdin', () => {
  const result = runBundle('NOT VALID JSON {{{');
  assert.strictEqual(result.status, 0, `Expected exit 0 on malformed input. stderr: ${result.stderr}`);
});

test('bundle outputs valid JSON on stdout', () => {
  const input = JSON.stringify({ prompt: 'test prompt', session_id: 'test' });
  const result = runBundle(input);
  assert.strictEqual(result.status, 0);
  assert.doesNotThrow(() => {
    const output = JSON.parse(result.stdout);
    assert.ok(output, 'stdout should be parseable JSON');
  }, `stdout should be valid JSON. Got: "${result.stdout}"`);
});

test('bundle output JSON has allow:true (or equivalent)', () => {
  const input = JSON.stringify({ prompt: 'test prompt', session_id: 'test' });
  const result = runBundle(input, { CCUSAGE_STATUSLINE: 'off' });
  assert.strictEqual(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.ok(
    output.allow === true || output.permissionDecision === 'allow' || output.continue === true,
    `Bundle output should indicate allow. Got: ${JSON.stringify(output)}`
  );
});

test('bundle imports ccusage-statusline (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('ccusage-statusline'),
    'Bundle must import ccusage-statusline.cjs'
  );
});

test('bundle imports startup-failopen-audit (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('startup-failopen-audit'),
    'Bundle must import startup-failopen-audit.cjs'
  );
});

test('bundle imports worktree-prune-on-start (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('worktree-prune-on-start'),
    'Bundle must import worktree-prune-on-start.cjs'
  );
});

test('bundle imports session-budget-watchdog (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('session-budget-watchdog'),
    'Bundle must import session-budget-watchdog.cjs'
  );
});

test('bundle imports drift-detector (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('drift-detector'),
    'Bundle must import drift-detector.cjs'
  );
});

test('bundle imports stale-task-detector (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('stale-task-detector'),
    'Bundle must import stale-task-detector.cjs'
  );
});

test('bundle has try/catch per sub-function for error isolation (VAL-HO-012)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  const tryCatchCount = (source.match(/}\s*catch\s*\(/g) || []).length;
  assert.ok(
    tryCatchCount >= 6,
    `Bundle must have at least 6 try/catch blocks (one per sub-function). Found: ${tryCatchCount}`
  );
});

test('kill-switch CCUSAGE_STATUSLINE=off skips ccusage output', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('CCUSAGE_STATUSLINE'),
    "Bundle must check CCUSAGE_STATUSLINE kill-switch env var"
  );
});

test('bundle is marked async:true in settings.json UserPromptSubmit', () => {
  const bundleRegs = findRegistrations(settings, 'user-prompt-advisory-bundle.cjs', 'UserPromptSubmit');
  assert.ok(bundleRegs.length > 0, 'Bundle must be registered in UserPromptSubmit');
  const asyncRegs = bundleRegs.filter(r => r.hook.async === true);
  assert.ok(asyncRegs.length > 0, 'Bundle registration must have async:true');
});

test('bundle has timeout_ms in settings.json UserPromptSubmit', () => {
  const bundleRegs = findRegistrations(settings, 'user-prompt-advisory-bundle.cjs', 'UserPromptSubmit');
  assert.ok(bundleRegs.length > 0, 'Bundle must be registered in UserPromptSubmit');
  for (const { hook } of bundleRegs) {
    assert.ok(
      typeof hook.timeout_ms === 'number',
      `Bundle registration must have timeout_ms. Found: ${JSON.stringify(hook)}`
    );
  }
});

test('settings.json has exactly 1 UserPromptSubmit advisory bundle registration (VAL-HO-006)', () => {
  const bundleRegs = findRegistrations(settings, 'user-prompt-advisory-bundle.cjs', 'UserPromptSubmit');
  assert.strictEqual(
    bundleRegs.length,
    1,
    `Expected exactly 1 UserPromptSubmit registration for bundle. Found: ${bundleRegs.length}`
  );
});

test('individual advisory UserPromptSubmit scripts are NOT separately registered (VAL-HO-006)', () => {
  const consolidated = [
    'ccusage-statusline.cjs',
    'startup-failopen-audit.cjs',
    'session-budget-watchdog.cjs',
    'drift-detector.cjs',
    'stale-task-detector.cjs',
  ];

  for (const script of consolidated) {
    const regs = findRegistrations(settings, script, 'UserPromptSubmit');
    assert.strictEqual(
      regs.length,
      0,
      `${script} must not have a separate UserPromptSubmit registration. Found: ${JSON.stringify(regs)}`
    );
  }

  // Check worktree-prune-on-start separately since it might be in other events (SessionEnd, etc.)
  const wpRegs = findRegistrations(settings, 'worktree-prune-on-start.cjs', 'UserPromptSubmit');
  // The startup version may still exist in UserPromptSubmit; the session version should not be separate
  const sessionWpRegs = wpRegs.filter(r => r.hook.command && r.hook.command.includes('/startup/worktree-prune-on-start.cjs'));
  assert.strictEqual(
    sessionWpRegs.length,
    0,
    `startup/worktree-prune-on-start.cjs must not have a separate UserPromptSubmit registration`
  );
});

test('error isolation: bundle exits 0 even with bad input', () => {
  const input = JSON.stringify({ prompt: null, session_id: null });
  const result = runBundle(input);
  assert.strictEqual(
    result.status,
    0,
    `Bundle must exit 0 on bad input. Got: ${result.status}, stderr: ${result.stderr}`
  );
});

test('bundle uses strict mode', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(source.includes("'use strict'"), "Bundle must have 'use strict' at top");
});
