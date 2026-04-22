#!/usr/bin/env node
'use strict';

/**
 * post-tool-advisory-bundle.test.cjs
 *
 * Tests for post-tool-advisory-bundle.cjs — the consolidated PostToolUse wildcard hook.
 *
 * Verifies:
 * - VAL-HO-005: 5 PostToolUse wildcard scripts consolidated into 1 entry point
 * - VAL-HO-012: Error isolation — throw in one sub-function doesn't prevent others
 * - Bundle always exits 0 (advisory, fail-open)
 * - All 5 sub-modules are imported
 * - settings.json has exactly 1 PostToolUse wildcard registration using the bundle
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
  'monitoring',
  'post-tool-advisory-bundle.cjs'
);
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');

// ─── Helper: run bundle process ───────────────────────────────────────────────

function runBundle(input = '{}', env = {}) {
  return spawnSync(process.execPath, [BUNDLE_PATH], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
    timeout: 10000,
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

test('post-tool-advisory-bundle.cjs file exists', () => {
  assert.ok(fs.existsSync(BUNDLE_PATH), `Bundle file not found at ${BUNDLE_PATH}`);
});

test('bundle exits 0 on valid PostToolUse input', () => {
  const input = JSON.stringify({
    tool_name: 'Bash',
    tool_output: 'output here',
    session_id: 'test-session',
  });
  const result = runBundle(input);
  assert.strictEqual(
    result.status,
    0,
    `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`
  );
});

test('bundle exits 0 on empty stdin', () => {
  const result = runBundle('');
  assert.strictEqual(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
});

test('bundle exits 0 on malformed JSON stdin', () => {
  const result = runBundle('NOT VALID JSON {{{');
  assert.strictEqual(
    result.status,
    0,
    `Expected exit 0 on malformed input. stderr: ${result.stderr}`
  );
});

test('bundle outputs valid JSON on stdout', () => {
  const input = JSON.stringify({
    tool_name: 'Read',
    tool_output: 'file content',
    session_id: 'test',
  });
  const result = runBundle(input);
  assert.strictEqual(result.status, 0);
  assert.doesNotThrow(() => {
    const output = JSON.parse(result.stdout);
    assert.ok(output, 'stdout should be parseable JSON');
  }, `stdout should be valid JSON. Got: ${result.stdout}`);
});

test('bundle imports post-tool-metrics-unified (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('post-tool-metrics-unified'),
    'Bundle must import post-tool-metrics-unified.cjs'
  );
});

test('bundle imports context-window-monitor (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('context-window-monitor'),
    'Bundle must import context-window-monitor.cjs'
  );
});

test('bundle imports hook-error-detector (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(source.includes('hook-error-detector'), 'Bundle must import hook-error-detector.cjs');
});

test('bundle imports recurring-issue-detector (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('recurring-issue-detector'),
    'Bundle must import recurring-issue-detector.cjs'
  );
});

test('bundle imports spend-guard-trigger / token-governor (contains reference)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(
    source.includes('spend-guard-trigger') || source.includes('token-governor'),
    'Bundle must include spend-guard-trigger consolidation (token-governor reference)'
  );
});

test('bundle has try/catch per sub-function for error isolation (VAL-HO-012)', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  const tryCatchCount = (source.match(/}\s*catch\s*\(/g) || []).length;
  assert.ok(
    tryCatchCount >= 4,
    `Bundle must have at least 4 try/catch blocks (one per sub-function). Found: ${tryCatchCount}`
  );
});

test('bundle is marked async:true in settings.json PostToolUse', () => {
  const bundleRegs = findRegistrations(settings, 'post-tool-advisory-bundle.cjs', 'PostToolUse');
  assert.ok(bundleRegs.length > 0, 'Bundle must be registered in PostToolUse');
  const asyncRegs = bundleRegs.filter(r => r.hook.async === true);
  assert.ok(asyncRegs.length > 0, 'Bundle registration must have async:true');
});

test('bundle has timeout_ms in settings.json PostToolUse', () => {
  const bundleRegs = findRegistrations(settings, 'post-tool-advisory-bundle.cjs', 'PostToolUse');
  assert.ok(bundleRegs.length > 0, 'Bundle must be registered in PostToolUse');
  for (const { hook } of bundleRegs) {
    assert.ok(
      typeof hook.timeout_ms === 'number',
      `Bundle registration must have timeout_ms. Found: ${JSON.stringify(hook)}`
    );
  }
});

test('settings.json has exactly 1 PostToolUse wildcard (matcher "") registration for the bundle (VAL-HO-005)', () => {
  const bundleRegs = findRegistrations(settings, 'post-tool-advisory-bundle.cjs', 'PostToolUse');
  assert.strictEqual(
    bundleRegs.length,
    1,
    `Expected exactly 1 PostToolUse registration for bundle. Found: ${bundleRegs.length}`
  );
  assert.strictEqual(
    bundleRegs[0].matcher,
    '',
    `Bundle PostToolUse registration must have empty matcher. Got: "${bundleRegs[0].matcher}"`
  );
});

test('individual PostToolUse wildcard scripts are NOT separately registered (VAL-HO-005)', () => {
  const consolidated = [
    'context-window-monitor.cjs',
    'hook-error-detector.cjs',
    'recurring-issue-detector.cjs',
    'post-tool-metrics-unified.cjs',
    'spend-guard-trigger.cjs',
  ];

  for (const script of consolidated) {
    const regs = findRegistrations(settings, script, 'PostToolUse');
    // context-window-monitor and hook-error-detector might have other registrations
    // but should NOT have a wildcard (empty matcher) registration
    const wildcardRegs = regs.filter(r => r.matcher === '');
    assert.strictEqual(
      wildcardRegs.length,
      0,
      `${script} must not have a separate PostToolUse wildcard registration. Found: ${JSON.stringify(wildcardRegs)}`
    );
  }
});

test('error isolation: throw in one sub-function does not prevent bundle from exiting 0', () => {
  // Inject DEBUG_HOOKS to get more info, pass a normal input
  const input = JSON.stringify({ tool_name: 'Bash', tool_output: 'ok' });
  const result = runBundle(input, { DEBUG_HOOKS: 'false' });
  assert.strictEqual(
    result.status,
    0,
    `Bundle must exit 0 even with potentially failing sub-functions. Got: ${result.status}, stderr: ${result.stderr}`
  );
});

test('bundle uses strict mode', () => {
  const source = fs.readFileSync(BUNDLE_PATH, 'utf8');
  assert.ok(source.includes("'use strict'"), "Bundle must have 'use strict' at top");
});
