#!/usr/bin/env node
/**
 * hook-timeout-coverage.test.cjs
 *
 * Verifies that every hook registration in settings.json has timeout_ms set,
 * within valid bounds (2000ms–60000ms), and that existing timeouts are unchanged.
 *
 * Tests VAL-HO-004.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');

// ─── Load settings.json ───────────────────────────────────────────────────────

let settings;
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
} catch (err) {
  throw new Error(`Failed to parse settings.json: ${err.message}`);
}

// ─── Helper: enumerate all hooks ─────────────────────────────────────────────

/**
 * Returns all hook objects from settings.json with their event context.
 * @returns {{ eventName: string, matcher: string, hook: Object }[]}
 */
function getAllHooks(settingsObj) {
  const results = [];
  const hooksMap = settingsObj.hooks || {};
  for (const [eventName, eventHooks] of Object.entries(hooksMap)) {
    if (!Array.isArray(eventHooks)) continue;
    for (const hookGroup of eventHooks) {
      const matcher = hookGroup.matcher || '';
      for (const hook of hookGroup.hooks || []) {
        results.push({ eventName, matcher, hook });
      }
    }
  }
  return results;
}

/**
 * Extracts the .cjs script basename from a hook command string.
 */
function getScriptBasename(command) {
  const match = (command || '').match(/([^/\\]+\.cjs)(?:\s|$)/);
  return match ? match[1] : null;
}

// ─── Test: settings.json validity ────────────────────────────────────────────

test('settings.json is valid JSON with hooks section', () => {
  assert.ok(settings && typeof settings === 'object', 'settings.json must be a valid JSON object');
  assert.ok(
    settings.hooks && typeof settings.hooks === 'object',
    'settings.json must have a hooks section'
  );
});

// ─── Test: 100% timeout_ms coverage ──────────────────────────────────────────

test('every hook registration has timeout_ms', () => {
  const allHooks = getAllHooks(settings);
  assert.ok(allHooks.length > 0, 'Must have at least one hook registration');

  const missing = [];
  for (const { eventName, matcher, hook } of allHooks) {
    if (hook.timeout_ms === undefined || hook.timeout_ms === null) {
      const script = getScriptBasename(hook.command);
      missing.push(`${eventName} [${matcher || '*'}] → ${script || hook.command}`);
    }
  }

  assert.deepStrictEqual(
    missing,
    [],
    `Hooks missing timeout_ms (${missing.length}):\n  ${missing.join('\n  ')}`
  );
});

test('count of hooks without timeout_ms is zero', () => {
  const allHooks = getAllHooks(settings);
  const missingCount = allHooks.filter(
    ({ hook }) => hook.timeout_ms === undefined || hook.timeout_ms === null
  ).length;
  assert.strictEqual(missingCount, 0, `Expected 0 hooks without timeout_ms, got ${missingCount}`);
});

// ─── Test: timeout bounds ─────────────────────────────────────────────────────

test('no timeout below 2000ms', () => {
  const allHooks = getAllHooks(settings);
  const violations = [];
  for (const { eventName, matcher, hook } of allHooks) {
    if (hook.timeout_ms !== undefined && hook.timeout_ms < 2000) {
      const script = getScriptBasename(hook.command);
      violations.push(`${eventName} [${matcher || '*'}] → ${script}: ${hook.timeout_ms}ms`);
    }
  }
  assert.deepStrictEqual(
    violations,
    [],
    `Hooks with timeout below 2000ms:\n  ${violations.join('\n  ')}`
  );
});

test('no timeout above 60000ms', () => {
  const allHooks = getAllHooks(settings);
  const violations = [];
  for (const { eventName, matcher, hook } of allHooks) {
    if (hook.timeout_ms !== undefined && hook.timeout_ms > 60000) {
      const script = getScriptBasename(hook.command);
      violations.push(`${eventName} [${matcher || '*'}] → ${script}: ${hook.timeout_ms}ms`);
    }
  }
  assert.deepStrictEqual(
    violations,
    [],
    `Hooks with timeout above 60000ms:\n  ${violations.join('\n  ')}`
  );
});

// ─── Test: existing timeouts preserved ───────────────────────────────────────

/**
 * These 9 hooks already had timeout_ms before this feature.
 * Verify their values are unchanged.
 */
const PRESERVED_TIMEOUTS = [
  {
    script: 'post-completion-chain.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 10000,
  },
  {
    script: 'reflection-cleanup.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 10000,
  },
  {
    script: 'reflection-data-aggregator.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 10000,
  },
  {
    script: 'artifact-scoring-ledger-hook.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 10000,
  },
  {
    script: 'post-creation-integration.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 5000,
  },
  {
    script: 'workflow-watchdog-hook.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 3000,
  },
  {
    script: 'worktree-auto-cleanup.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 10000,
  },
  {
    script: 'post-pipeline-token-report.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 15000,
  },
  {
    script: 'post-pipeline-self-review.cjs',
    eventName: 'PostToolUse',
    matcher: 'TaskUpdate',
    expected: 10000,
  },
];

test('existing timeout_ms values are preserved', () => {
  const allHooks = getAllHooks(settings);
  const violations = [];

  for (const { script, eventName, matcher, expected } of PRESERVED_TIMEOUTS) {
    const found = allHooks.find(
      ({ eventName: en, matcher: m, hook }) =>
        en === eventName && m === matcher && (hook.command || '').includes(script)
    );
    if (!found) {
      violations.push(`${script}: not found in ${eventName} [${matcher}]`);
    } else if (found.hook.timeout_ms !== expected) {
      violations.push(`${script}: expected ${expected}ms, got ${found.hook.timeout_ms}ms`);
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `Existing timeout values changed:\n  ${violations.join('\n  ')}`
  );
});

// ─── Test: all event categories present ──────────────────────────────────────

const EXPECTED_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SessionEnd',
  'PreCompact',
  'Stop',
];

test('all expected event categories are present', () => {
  for (const eventName of EXPECTED_EVENTS) {
    assert.ok(
      settings.hooks[eventName],
      `Event category "${eventName}" must exist in settings.json`
    );
  }
});

test('each event category has at least one hook with timeout_ms', () => {
  for (const eventName of EXPECTED_EVENTS) {
    const eventHooks = settings.hooks[eventName] || [];
    let hasTimeout = false;
    for (const group of eventHooks) {
      for (const hook of group.hooks || []) {
        if (hook.timeout_ms !== undefined) {
          hasTimeout = true;
          break;
        }
      }
      if (hasTimeout) break;
    }
    assert.ok(
      hasTimeout,
      `Event category "${eventName}" must have at least one hook with timeout_ms`
    );
  }
});

// ─── Test: timeout ranges by hook category ───────────────────────────────────

/**
 * Security/blocking PreToolUse hooks should be in the 5000–10000ms range.
 * (They block tool execution so must complete quickly.)
 */
const SECURITY_HOOKS = [
  'pre-tool-unified.cjs',
  'router-tool-lockdown.cjs',
  'external-content-guard.cjs',
  'dlp-pretool.cjs',
  'bash-pretool-bundle.cjs',
  'hybrid-search-enforcer.cjs',
  'routing-guard.cjs',
  'write-pretool-bundle.cjs',
  'conflict-detector.cjs',
  'validate-skill-invocation.cjs',
  'reflection-step0-guard.cjs',
  'heartbeat-step05-check.cjs',
  'worktree-preflight-check.cjs',
  'spawn-token-guard.cjs',
  'task-pretool-orchestrator.cjs',
  'finish-only-guard.cjs',
  'taskupdate-contract-validator.cjs',
  'pre-completion-validation.cjs',
  'quality-gate-validator.cjs',
  'creator-compliance-validator.cjs',
  'pre-spawn-hook-check.cjs',
  'context-monitor.cjs',
];

test('security/blocking PreToolUse hooks have timeout_ms between 5000ms and 10000ms', () => {
  const allHooks = getAllHooks(settings);
  const violations = [];

  for (const scriptName of SECURITY_HOOKS) {
    const registrations = allHooks.filter(
      ({ eventName, hook }) =>
        eventName === 'PreToolUse' && (hook.command || '').includes(scriptName)
    );
    for (const { matcher, hook } of registrations) {
      if (hook.timeout_ms === undefined || hook.timeout_ms < 5000 || hook.timeout_ms > 10000) {
        violations.push(
          `PreToolUse [${matcher || '*'}] → ${scriptName}: ${hook.timeout_ms}ms (expected 5000–10000)`
        );
      }
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `Security hooks with timeout outside 5000–10000ms range:\n  ${violations.join('\n  ')}`
  );
});

/**
 * SessionEnd/cleanup hooks should be in the 15000–30000ms range.
 */
test('SessionEnd hooks have timeout_ms between 15000ms and 30000ms', () => {
  const allHooks = getAllHooks(settings);
  const violations = [];

  for (const { matcher, hook } of allHooks.filter(({ eventName }) => eventName === 'SessionEnd')) {
    if (hook.timeout_ms === undefined || hook.timeout_ms < 15000 || hook.timeout_ms > 30000) {
      const script = getScriptBasename(hook.command);
      violations.push(
        `SessionEnd [${matcher || '*'}] → ${script}: ${hook.timeout_ms}ms (expected 15000–30000)`
      );
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `SessionEnd hooks with timeout outside 15000–30000ms range:\n  ${violations.join('\n  ')}`
  );
});
