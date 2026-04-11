#!/usr/bin/env node
/**
 * hook-async-classification.test.cjs
 *
 * Verifies that advisory/monitoring hooks have async:true in settings.json,
 * and that security/blocking hooks do NOT have async:true.
 *
 * After the hooks-consolidation feature, 10 advisory hooks are no longer
 * individually registered — they are bundled into consolidated entry points:
 *
 *   UserPromptSubmit advisory bundle (user-prompt-advisory-bundle.cjs):
 *     ccusage-statusline, startup-failopen-audit, worktree-prune-on-start,
 *     session-budget-watchdog, drift-detector, stale-task-detector
 *
 *   PostToolUse advisory bundle (post-tool-advisory-bundle.cjs):
 *     post-tool-metrics-unified, context-window-monitor,
 *     hook-error-detector, recurring-issue-detector
 *
 * For consolidated hooks, this test verifies:
 *   1. The bundle is registered in settings.json with async:true
 *   2. The bundle source code references each consolidated hook script
 *
 * Tests VAL-HO-002 and VAL-HO-003.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SETTINGS_PATH = path.join(PROJECT_ROOT, '.claude', 'settings.json');

// ─── Bundle file paths ────────────────────────────────────────────────────────

const USER_PROMPT_BUNDLE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'session',
  'user-prompt-advisory-bundle.cjs'
);

const POST_TOOL_BUNDLE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'monitoring',
  'post-tool-advisory-bundle.cjs'
);

const USER_PROMPT_BUNDLE_SCRIPT = 'user-prompt-advisory-bundle.cjs';
const POST_TOOL_BUNDLE_SCRIPT = 'post-tool-advisory-bundle.cjs';

// ─── Load settings.json ───────────────────────────────────────────────────────

let settings;
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
} catch (err) {
  throw new Error(`Failed to parse settings.json: ${err.message}`);
}

// ─── Helper: find hook registrations by script name ──────────────────────────

/**
 * Find all hook objects in the given event categories that reference scriptName.
 * Returns an array of { eventName, matcher, hook } objects.
 *
 * @param {Object} settings - Parsed settings.json
 * @param {string} scriptName - Basename of the hook script (e.g. "ccusage-statusline.cjs")
 * @param {string[]} [eventFilter] - Only check these event categories (optional)
 * @returns {{ eventName: string, matcher: string, hook: Object }[]}
 */
function findHookRegistrations(settings, scriptName, eventFilter) {
  const results = [];
  const hooksMap = settings.hooks || {};

  for (const [eventName, eventHooks] of Object.entries(hooksMap)) {
    if (eventFilter && !eventFilter.includes(eventName)) continue;
    if (!Array.isArray(eventHooks)) continue;

    for (const hookGroup of eventHooks) {
      const matcher = hookGroup.matcher || '';
      for (const hook of hookGroup.hooks || []) {
        if (!hook.command) continue;
        if (hook.command.includes(scriptName)) {
          results.push({ eventName, matcher, hook });
        }
      }
    }
  }

  return results;
}

// ─── Advisory events ──────────────────────────────────────────────────────────

/**
 * Event categories where async:true makes sense (tools are being blocked or
 * the next prompt is being held up).  SessionEnd / Stop / PreCompact are
 * cleanup phases where we intentionally keep hooks synchronous.
 */
const ADVISORY_EVENTS = ['UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure'];

// ─── Consolidated hooks (now inside bundles) ──────────────────────────────────

/**
 * Hooks consolidated into user-prompt-advisory-bundle.cjs.
 * These are no longer individually registered in settings.json.
 * Verified by: bundle registration + bundle source referencing each script.
 */
const USER_PROMPT_BUNDLE_HOOKS = {
  'ccusage-statusline': 'ccusage-statusline.cjs',
  'startup-failopen-audit': 'startup-failopen-audit.cjs',
  'worktree-prune-on-start': 'worktree-prune-on-start.cjs',
  'session-budget-watchdog': 'session-budget-watchdog.cjs',
  'drift-detector': 'drift-detector.cjs',
  'stale-task-detector': 'stale-task-detector.cjs',
};

/**
 * Hooks consolidated into post-tool-advisory-bundle.cjs.
 * These are no longer individually registered in settings.json (PostToolUse).
 */
const POST_TOOL_BUNDLE_HOOKS = {
  'post-tool-metrics-unified': 'post-tool-metrics-unified.cjs',
  'context-window-monitor': 'context-window-monitor.cjs',
  'hook-error-detector': 'hook-error-detector.cjs',
  'recurring-issue-detector': 'recurring-issue-detector.cjs',
};

// ─── Individual advisory hooks (still registered directly) ───────────────────

/**
 * Advisory/monitoring hooks that are STILL individually registered in settings.json
 * (not consolidated into bundles). Each must have async:true in advisory events.
 */
const ADVISORY_HOOKS_INDIVIDUAL = {
  'a2a-server-autostart': 'a2a-server-autostart.cjs',
  'audit-skill-recency': 'audit-skill-recency.cjs',
  'handover-detector': 'handover-detector.cjs',
  'sync-memory-index': 'sync-memory-index.cjs',
  'agent-registry-auto-refresh': 'agent-registry-auto-refresh.cjs',
  'code-index-updater': 'code-index-updater.cjs',
  'post-edit-scanner': 'post-edit-scanner.cjs',
  'analysis-paralysis-guard': 'analysis-paralysis-guard.cjs',
  'reflection-cleanup': 'reflection-cleanup.cjs',
  'reflection-data-aggregator': 'reflection-data-aggregator.cjs',
  'unified-reflection-handler': 'unified-reflection-handler.cjs',
};

/**
 * Security/blocking hooks that must NOT have async:true (they exit 2 to block).
 */
const SECURITY_HOOKS = {
  'dlp-pretool': 'dlp-pretool.cjs',
  'external-content-guard': 'external-content-guard.cjs',
  'bash-pretool-bundle': 'bash-pretool-bundle.cjs',
  'write-pretool-bundle': 'write-pretool-bundle.cjs',
  'routing-guard': 'routing-guard.cjs',
  'router-tool-lockdown': 'router-tool-lockdown.cjs',
  'spawn-token-guard': 'spawn-token-guard.cjs',
  'pre-tool-unified': 'pre-tool-unified.cjs',
  'conflict-detector': 'conflict-detector.cjs',
  'reflection-step0-guard': 'reflection-step0-guard.cjs',
  'heartbeat-step05-check': 'heartbeat-step05-check.cjs',
  'task-pretool-orchestrator': 'task-pretool-orchestrator.cjs',
  'taskupdate-contract-validator': 'taskupdate-contract-validator.cjs',
  'pre-completion-validation': 'pre-completion-validation.cjs',
  'quality-gate-validator': 'quality-gate-validator.cjs',
  'creator-compliance-validator': 'creator-compliance-validator.cjs',
  'pre-spawn-hook-check': 'pre-spawn-hook-check.cjs',
  'finish-only-guard': 'finish-only-guard.cjs',
};

// ─── settings.json validity ───────────────────────────────────────────────────

test('settings.json is valid JSON', () => {
  assert.ok(settings && typeof settings === 'object', 'settings.json must be a valid JSON object');
  assert.ok(settings.hooks && typeof settings.hooks === 'object', 'settings.json must have hooks');
});

// ─── Bundle registrations ─────────────────────────────────────────────────────

test('user-prompt-advisory-bundle.cjs is registered in UserPromptSubmit with async:true', () => {
  const regs = findHookRegistrations(settings, USER_PROMPT_BUNDLE_SCRIPT, ['UserPromptSubmit']);
  assert.ok(
    regs.length > 0,
    'user-prompt-advisory-bundle.cjs must be registered in UserPromptSubmit'
  );
  for (const { hook } of regs) {
    assert.strictEqual(
      hook.async,
      true,
      `user-prompt-advisory-bundle.cjs must have async:true (found: ${JSON.stringify(hook)})`
    );
  }
});

test('post-tool-advisory-bundle.cjs is registered in PostToolUse with async:true', () => {
  const regs = findHookRegistrations(settings, POST_TOOL_BUNDLE_SCRIPT, ['PostToolUse']);
  assert.ok(regs.length > 0, 'post-tool-advisory-bundle.cjs must be registered in PostToolUse');
  for (const { hook } of regs) {
    assert.strictEqual(
      hook.async,
      true,
      `post-tool-advisory-bundle.cjs must have async:true (found: ${JSON.stringify(hook)})`
    );
  }
});

// ─── Consolidated hooks: verified via bundle source + bundle registration ─────

test('user-prompt advisory bundle source references all 6 consolidated hooks', () => {
  assert.ok(
    fs.existsSync(USER_PROMPT_BUNDLE_PATH),
    `Bundle file not found at ${USER_PROMPT_BUNDLE_PATH}`
  );
  const source = fs.readFileSync(USER_PROMPT_BUNDLE_PATH, 'utf8');

  const missing = [];
  for (const [name, scriptFile] of Object.entries(USER_PROMPT_BUNDLE_HOOKS)) {
    if (!source.includes(scriptFile)) {
      missing.push(name);
    }
  }
  assert.deepStrictEqual(
    missing,
    [],
    `user-prompt-advisory-bundle must reference these scripts: ${missing.join(', ')}`
  );
});

test('post-tool advisory bundle source references all 4 consolidated hooks', () => {
  assert.ok(
    fs.existsSync(POST_TOOL_BUNDLE_PATH),
    `Bundle file not found at ${POST_TOOL_BUNDLE_PATH}`
  );
  const source = fs.readFileSync(POST_TOOL_BUNDLE_PATH, 'utf8');

  const missing = [];
  for (const [name, scriptFile] of Object.entries(POST_TOOL_BUNDLE_HOOKS)) {
    if (!source.includes(scriptFile)) {
      missing.push(name);
    }
  }
  assert.deepStrictEqual(
    missing,
    [],
    `post-tool-advisory-bundle must reference these scripts: ${missing.join(', ')}`
  );
});

// Individual tests for each consolidated hook in user-prompt-advisory-bundle
for (const [name, scriptFile] of Object.entries(USER_PROMPT_BUNDLE_HOOKS)) {
  test(`consolidated hook "${name}" is handled via user-prompt-advisory-bundle.cjs`, () => {
    // Verify: no individual registration in UserPromptSubmit
    const individualRegs = findHookRegistrations(settings, scriptFile, ['UserPromptSubmit']);
    assert.strictEqual(
      individualRegs.length,
      0,
      `${name} must not have a separate UserPromptSubmit registration (it is bundled)`
    );

    // Verify: the bundle IS registered with async:true
    const bundleRegs = findHookRegistrations(settings, USER_PROMPT_BUNDLE_SCRIPT, [
      'UserPromptSubmit',
    ]);
    assert.ok(bundleRegs.length > 0, 'user-prompt-advisory-bundle must be registered');
    const hasAsync = bundleRegs.some(r => r.hook.async === true);
    assert.ok(hasAsync, 'user-prompt-advisory-bundle must have async:true');

    // Verify: bundle source code references this script
    const source = fs.readFileSync(USER_PROMPT_BUNDLE_PATH, 'utf8');
    assert.ok(
      source.includes(scriptFile),
      `user-prompt-advisory-bundle must import/reference ${scriptFile}`
    );
  });
}

// Individual tests for each consolidated hook in post-tool-advisory-bundle
for (const [name, scriptFile] of Object.entries(POST_TOOL_BUNDLE_HOOKS)) {
  test(`consolidated hook "${name}" is handled via post-tool-advisory-bundle.cjs`, () => {
    // Verify: the bundle IS registered with async:true in PostToolUse
    const bundleRegs = findHookRegistrations(settings, POST_TOOL_BUNDLE_SCRIPT, ['PostToolUse']);
    assert.ok(bundleRegs.length > 0, 'post-tool-advisory-bundle must be registered in PostToolUse');
    const hasAsync = bundleRegs.some(r => r.hook.async === true);
    assert.ok(hasAsync, 'post-tool-advisory-bundle must have async:true');

    // Verify: bundle source code references this script
    const source = fs.readFileSync(POST_TOOL_BUNDLE_PATH, 'utf8');
    assert.ok(
      source.includes(scriptFile),
      `post-tool-advisory-bundle must import/reference ${scriptFile}`
    );
  });
}

// ─── Individual advisory hooks have async:true ────────────────────────────────

test('individual advisory hooks are registered in settings.json', () => {
  const missing = [];

  for (const [name, scriptFile] of Object.entries(ADVISORY_HOOKS_INDIVIDUAL)) {
    const registrations = findHookRegistrations(settings, scriptFile, ADVISORY_EVENTS);
    if (registrations.length === 0) {
      missing.push(name);
    }
  }

  assert.deepStrictEqual(
    missing,
    [],
    `Individual advisory hooks not found in settings.json advisory events: ${missing.join(', ')}`
  );
});

test('all individual advisory hook registrations in advisory events have async:true', () => {
  const missing = [];

  for (const [name, scriptFile] of Object.entries(ADVISORY_HOOKS_INDIVIDUAL)) {
    const registrations = findHookRegistrations(settings, scriptFile, ADVISORY_EVENTS);

    for (const { eventName, matcher, hook } of registrations) {
      if (hook.async !== true) {
        missing.push(`${name} (${eventName}, matcher="${matcher}")`);
      }
    }
  }

  assert.deepStrictEqual(
    missing,
    [],
    `Individual advisory hooks missing async:true:\n  ${missing.join('\n  ')}`
  );
});

// Individual tests for each non-consolidated advisory hook
for (const [name, scriptFile] of Object.entries(ADVISORY_HOOKS_INDIVIDUAL)) {
  test(`advisory hook "${name}" has async:true in all advisory event registrations`, () => {
    const registrations = findHookRegistrations(settings, scriptFile, ADVISORY_EVENTS);
    assert.ok(
      registrations.length > 0,
      `${name} (${scriptFile}) has no registrations in advisory events`
    );

    for (const { eventName, matcher, hook } of registrations) {
      assert.strictEqual(
        hook.async,
        true,
        `${name} in ${eventName} (matcher="${matcher}") should have async:true`
      );
    }
  });
}

// ─── Security hooks do NOT have async:true ────────────────────────────────────

test('security/blocking hooks do NOT have async:true anywhere', () => {
  const violations = [];

  for (const [name, scriptFile] of Object.entries(SECURITY_HOOKS)) {
    // Check ALL event categories (not just advisory ones)
    const registrations = findHookRegistrations(settings, scriptFile);

    for (const { eventName, matcher, hook } of registrations) {
      if (hook.async === true) {
        violations.push(`${name} (${eventName}, matcher="${matcher}") has async:true — MUST NOT`);
      }
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `Security hooks must not have async:true:\n  ${violations.join('\n  ')}`
  );
});

// Individual security hook tests

for (const [name, scriptFile] of Object.entries(SECURITY_HOOKS)) {
  test(`security hook "${name}" does NOT have async:true`, () => {
    const registrations = findHookRegistrations(settings, scriptFile);

    for (const { eventName, matcher, hook } of registrations) {
      assert.notStrictEqual(
        hook.async,
        true,
        `Security hook ${name} in ${eventName} (matcher="${matcher}") must NOT have async:true`
      );
    }
  });
}

// ─── All event categories preserved ──────────────────────────────────────────

test('settings.json preserves all original event categories', () => {
  const expectedCategories = [
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'SessionEnd',
    'PreCompact',
    'Stop',
  ];

  for (const category of expectedCategories) {
    assert.ok(settings.hooks[category], `Event category "${category}" must exist in settings.json`);
  }
});
