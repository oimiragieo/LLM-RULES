'use strict';

/**
 * Regression test: pre-completion-validation.cjs block path MUST exit(2)
 *
 * P0 fix (2026-03-12): The artifact validation block path at lines 687-692 had a
 * dead `process.exit(2)` — a `process.exit(0)` immediately before it made the
 * block unreachable, causing failed artifact validations to silently allow (exit 0).
 *
 * This test verifies that:
 *   1. validateArtifact() returns { passed: false } when validation script fails
 *   2. The subprocess exits with code 2 (not 0) when artifact validation fails
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK_PATH = path.resolve(__dirname, '../../.claude/hooks/validation/pre-completion-validation.cjs');
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// ---------------------------------------------------------------------------
// Helper: run the hook as a subprocess with controlled stdin and env vars
// ---------------------------------------------------------------------------

function runHook(hookInput, envOverrides = {}) {
  const stdinData = JSON.stringify(hookInput);
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: stdinData,
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      // Disable all enforcement modes that could block before artifact validation
      TASK_STATUS_ENFORCEMENT: 'off',
      SUMMARY_REQUIRED_ENFORCEMENT: 'off',
      PRE_COMPLETION_SUMMARY_ENFORCEMENT: 'off',
      GIT_COMMIT_VERIFICATION: 'off',
      REFLECTION_SCORE_ENFORCEMENT: 'off',
      TASK_OUTPUT_ENFORCEMENT: 'off',
      ...envOverrides,
    },
    timeout: 15000,
    shell: false,
    windowsHide: true,
  });
}

// ---------------------------------------------------------------------------
// Unit test: validateArtifact returns { passed: false } for non-existent path
// ---------------------------------------------------------------------------

test('validateArtifact returns { passed: false } when validate-integration script fails on nonexistent agent', () => {
  // Re-require fresh to pick up current env state
  delete require.cache[require.resolve(HOOK_PATH)];
  const hook = require(HOOK_PATH);

  // A path that contains /.claude/agents/ but does not exist on disk
  const fakePath = path.join(PROJECT_ROOT, '.claude', 'agents', 'nonexistent-fake-xyz-regression.md');
  assert.ok(!fs.existsSync(fakePath), 'Precondition: test artifact path must NOT exist');

  const result = hook.validateArtifact(fakePath);
  assert.equal(result.passed, false, 'validateArtifact should return { passed: false } for nonexistent path');
});

// ---------------------------------------------------------------------------
// Unit test: detectArtifacts recognizes /.claude/agents/ paths
// ---------------------------------------------------------------------------

test('detectArtifacts identifies agent files in filesModified', () => {
  delete require.cache[require.resolve(HOOK_PATH)];
  const hook = require(HOOK_PATH);

  const artifacts = hook.detectArtifacts([
    '/project/.claude/agents/specialized/some-agent.md',
    '/project/src/index.js',
    '/project/.claude/hooks/safety/some-hook.cjs',
  ]);

  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0].type, 'agent');
  assert.equal(artifacts[1].type, 'hook');
});

// ---------------------------------------------------------------------------
// Subprocess regression test: block path exits 2, not 0 (P0 fix verification)
// ---------------------------------------------------------------------------

test('hook subprocess exits with code 2 when artifact validation fails (regression: dead exit(2) P0 fix)', () => {
  // Use a temp dir path that we can assert doesn't exist as a real agent
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-completion-regression-'));
  fs.rmdirSync(tmpDir); // remove it so the path is guaranteed nonexistent

  // Craft a hook input where filesModified contains a fake agent path
  // detectArtifacts will pick it up because it contains /.claude/agents/
  const fakeAgentPath = path.join(tmpDir, '.claude', 'agents', 'fake-regression-agent.md').replace(/\\/g, '/');

  const hookInput = {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'regression-block-exit-test',
      status: 'completed',
      metadata: {
        // Path must contain /.claude/agents/ to be detected as an artifact
        filesModified: [fakeAgentPath],
        summary: 'Regression test for P0 fix: verify artifact validation block exits with code 2 not 0',
      },
    },
  };

  const result = runHook(hookInput);

  // The critical assertion: must exit 2, not 0
  // Before fix: process.exit(0) appeared before process.exit(2), making exit(2) unreachable
  // After fix: process.exit(0) was removed, process.exit(2) is now reachable
  assert.equal(
    result.status,
    2,
    `Hook must exit with code 2 when artifact validation fails (got ${result.status}). ` +
    'This is a regression guard for the P0 fix that removed a dead process.exit(0) ' +
    'that was shadowing the block exit(2) at line 692.'
  );

  // Also verify the block message is present in stdout
  assert.ok(
    result.stdout.includes('PRE-COMPLETION VALIDATION FAILED'),
    'Block message must appear in hook stdout'
  );
});

// ---------------------------------------------------------------------------
// Subprocess test: hook exits 0 when no artifacts to validate
// ---------------------------------------------------------------------------

test('hook subprocess exits with code 0 when no artifact paths are in filesModified', () => {
  const hookInput = {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'no-artifact-test',
      status: 'completed',
      metadata: {
        filesModified: ['src/index.js', 'tests/index.test.cjs'], // not agent/hook/skill paths
        summary: 'Non-artifact task: exits 0 because no artifacts to validate in filesModified',
      },
    },
  };

  const result = runHook(hookInput);
  assert.equal(result.status, 0, 'Hook should exit 0 when no agent/hook/skill artifacts modified');
});
