#!/usr/bin/env node
'use strict';

/**
 * spend-guard-trigger.test.cjs — S4 TDD: PostToolUse hook that calls
 * checkSpendCeiling and writes the override file when ceiling is exceeded.
 *
 * Test IDs: SGT-001 … SGT-003
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;
let originalEnv;

function setupTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgt-test-'));
  originalEnv = { ...process.env };
  return tmpDir;
}

function teardownTmpDir() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_e) {
    // Best-effort cleanup
  }
}

/**
 * Write a ccusage-status.txt with the given cost.
 */
function writeCcusageStatus(cost, dir) {
  const runtimeDir = path.join(dir, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const filePath = path.join(runtimeDir, 'ccusage-status.txt');
  const content = `[tokens] 10,000 today (in: 1,000 / out: 9,000) | Cost: $${cost.toFixed(4)}\n`;
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/**
 * Run the hook as a subprocess, providing hook input via stdin.
 * Returns { stdout, stderr, exitCode }.
 */
function runHook(hookInput, env = {}) {
  const HOOK_PATH = path.resolve(
    __dirname,
    '../../.claude/hooks/monitoring/spend-guard-trigger.cjs'
  );
  const stdinData = JSON.stringify(hookInput);
  try {
    const stdout = execFileSync(process.execPath, [HOOK_PATH], {
      input: stdinData,
      env: { ...process.env, ...env },
      timeout: 10000,
    });
    return { stdout: stdout.toString(), exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
      exitCode: err.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpendGuardTrigger (PostToolUse hook)', () => {
  beforeEach(() => {
    setupTmpDir();
  });

  afterEach(() => {
    teardownTmpDir();
  });

  // -------------------------------------------------------------------------
  // SGT-001: hook exits 0 and outputs { allow: true } when under ceiling
  // -------------------------------------------------------------------------
  it('SGT-001: hook exits 0 and outputs { allow: true } when spend is under ceiling', () => {
    const statusFile = writeCcusageStatus(1.0, tmpDir);
    const runtimeDir = path.join(tmpDir, 'runtime');
    const overridePath = path.join(runtimeDir, 'spend-guard-override.json');

    const result = runHook(
      { tool_name: 'Read', tool_input: {}, tool_response: {} },
      {
        SPEND_GUARD_STATUS_FILE: statusFile,
        SPEND_GUARD_OVERRIDE_FILE: overridePath,
        SPEND_GUARD_CEILING_USD: '5.0',
      }
    );

    assert.equal(result.exitCode, 0, 'Hook must exit 0');
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true, 'Hook must output { allow: true }');
    assert.ok(!fs.existsSync(overridePath), 'No override file when under ceiling');
  });

  // -------------------------------------------------------------------------
  // SGT-002: hook exits 0 and outputs { allow: true, additionalContext } when ceiling exceeded
  // -------------------------------------------------------------------------
  it('SGT-002: hook outputs additionalContext hint when spend exceeds ceiling', () => {
    const statusFile = writeCcusageStatus(7.5, tmpDir);
    const runtimeDir = path.join(tmpDir, 'runtime');
    const overridePath = path.join(runtimeDir, 'spend-guard-override.json');

    const result = runHook(
      { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: {} },
      {
        SPEND_GUARD_STATUS_FILE: statusFile,
        SPEND_GUARD_OVERRIDE_FILE: overridePath,
        SPEND_GUARD_CEILING_USD: '5.0',
      }
    );

    assert.equal(result.exitCode, 0, 'Hook must exit 0 (advisory/fail-open)');
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true, 'Hook must still allow the tool call');
    assert.ok(
      typeof parsed.additionalContext === 'string' && parsed.additionalContext.length > 0,
      'Hook must include additionalContext advisory message when ceiling exceeded'
    );
    assert.ok(fs.existsSync(overridePath), 'Override file should be written when ceiling exceeded');

    const override = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
    assert.equal(override.suggestedModel, 'haiku', 'Override must suggest haiku');
  });

  // -------------------------------------------------------------------------
  // SGT-003: hook is fail-open — missing status file still exits 0
  // -------------------------------------------------------------------------
  it('SGT-003: hook exits 0 even when ccusage-status.txt is missing (fail-open)', () => {
    const nonExistentStatus = path.join(tmpDir, 'runtime', 'ccusage-status.txt');
    const overridePath = path.join(tmpDir, 'runtime', 'spend-guard-override.json');

    const result = runHook(
      { tool_name: 'Write', tool_input: { file_path: '/tmp/test.txt' }, tool_response: {} },
      {
        SPEND_GUARD_STATUS_FILE: nonExistentStatus,
        SPEND_GUARD_OVERRIDE_FILE: overridePath,
        SPEND_GUARD_CEILING_USD: '5.0',
      }
    );

    assert.equal(result.exitCode, 0, 'Hook must exit 0 even with missing status file');
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true, 'Hook must output { allow: true } when failing open');
  });
});
