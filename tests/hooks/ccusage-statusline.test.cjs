'use strict';

/**
 * Tests for ccusage-statusline.cjs UserPromptSubmit hook.
 *
 * Tests verify:
 *  1. exit 0 on valid stdin (no-op allow)
 *  2. Writes formatted status line to stderr
 *  3. CCUSAGE_STATUSLINE=off disables output
 *  4. Graceful degradation when adapter returns null
 *  5. Cost formatting ($X.XXXX)
 *  6. Number formatting with commas
 *  7. Cache savings line when cache tokens present
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const HOOK_PATH = path.resolve(__dirname, '../../.claude/hooks/monitoring/ccusage-statusline.cjs');
const PROJECT_STATUS_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'ccusage-status.txt'
);

/**
 * Run the hook with given env overrides and return { stdout, stderr, exitCode }.
 */
function _runHook(envOverrides = {}, stdinData = '{}') {
  const env = {
    ...process.env,
    // Default: disable ccusage so adapter returns null (avoids real npx call)
    CCUSAGE_DISABLED: 'true',
    ...envOverrides,
  };

  try {
    const stdout = execFileSync('node', [HOOK_PATH], {
      input: stdinData,
      encoding: 'utf8',
      env,
      shell: false,
      timeout: 10_000,
      // Capture stderr separately
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status ?? 1,
    };
  }
}

/**
 * Run the hook and capture stderr separately using spawnSync.
 */
function runHookWithStderr(envOverrides = {}, stdinData = '{}') {
  const { spawnSync } = require('child_process');
  const env = {
    ...process.env,
    CCUSAGE_DISABLED: 'true',
    ...envOverrides,
  };

  const result = spawnSync('node', [HOOK_PATH], {
    input: stdinData,
    encoding: 'utf8',
    env,
    shell: false,
    timeout: 10_000,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 0,
  };
}

// ── Test 1: exits 0 on valid stdin ─────────────────────────────────────────

test('hook exits 0 on valid stdin', () => {
  const { exitCode } = runHookWithStderr({});
  assert.equal(exitCode, 0, 'Hook must exit 0 (fail-open)');
});

// ── Test 2: writes status line to stderr when adapter has data ─────────────

test('writes usage summary to stderr when data available', () => {
  // We'll use the adapter's setExecOverride mechanism by setting an env var
  // that triggers mock data. But the cleanest approach is to use a wrapper
  // that exports adapter mock data via a special env var.
  // Since adapter supports CCUSAGE_DISABLED, we need a different approach:
  // create a temp mock adapter via env var CCUSAGE_TEST_MOCK_DATA.
  const mockData = JSON.stringify({
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0.0123,
  });

  const { stderr, exitCode } = runHookWithStderr({
    CCUSAGE_DISABLED: 'false',
    CCUSAGE_TEST_MOCK_DATA: mockData,
  });

  assert.equal(exitCode, 0, 'Hook must exit 0');
  // Should contain token counts
  assert.match(stderr, /1,000|1000/, 'Should show input token count');
  assert.match(stderr, /500/, 'Should show output token count');
  // Should contain a dollar cost (calculated from pricing table)
  assert.match(stderr, /\$\d+\.\d{4}/, 'Should show cost with dollar sign');
});

// ── Test 3: CCUSAGE_STATUSLINE=off suppresses all output ──────────────────

test('CCUSAGE_STATUSLINE=off suppresses stderr output', () => {
  const { stderr, exitCode } = runHookWithStderr({
    CCUSAGE_STATUSLINE: 'off',
    CCUSAGE_DISABLED: 'false',
    CCUSAGE_TEST_MOCK_DATA: JSON.stringify({
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.01,
    }),
  });

  assert.equal(exitCode, 0, 'Hook must exit 0 even when disabled');
  assert.equal(stderr.trim(), '', 'stderr must be empty when CCUSAGE_STATUSLINE=off');
});

// ── Test 4: graceful degradation when adapter returns null ─────────────────

test('exits 0 silently when adapter returns null (graceful degradation)', () => {
  const { stderr, exitCode } = runHookWithStderr({
    CCUSAGE_DISABLED: 'true',
  });

  assert.equal(exitCode, 0, 'Must exit 0 when no data');
  // No error message should be emitted to stderr
  assert.doesNotMatch(stderr, /error|Error|ENOENT/i, 'Must not emit error messages on null data');
});

// ── Test 5: cost formatted to 4 decimal places ─────────────────────────────

test('formats cost with 4 decimal places', () => {
  const mockData = JSON.stringify({
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0.00045678,
  });

  const { stderr, exitCode } = runHookWithStderr({
    CCUSAGE_DISABLED: 'false',
    CCUSAGE_TEST_MOCK_DATA: mockData,
  });

  assert.equal(exitCode, 0);
  // Cost should appear with $ prefix and 4 decimal places
  assert.match(stderr, /\$\d+\.\d{4}/, 'Cost should be formatted with dollar sign and 4 decimals');
});

// ── Test 6: large numbers formatted with commas ────────────────────────────

test('formats large token counts with commas', () => {
  const mockData = JSON.stringify({
    inputTokens: 123456,
    outputTokens: 78901,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalCost: 1.2345,
  });

  const { stderr, exitCode } = runHookWithStderr({
    CCUSAGE_DISABLED: 'false',
    CCUSAGE_TEST_MOCK_DATA: mockData,
  });

  assert.equal(exitCode, 0);
  assert.match(stderr, /123,456/, 'Input tokens should have comma formatting');
  assert.match(stderr, /78,901/, 'Output tokens should have comma formatting');
});

// ── Test 7: cache savings line when cache tokens present ───────────────────

test('shows cache savings when cache tokens are present', () => {
  const mockData = JSON.stringify({
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 200,
    cacheReadTokens: 5000,
    totalCost: 0.05,
  });

  const { stderr, exitCode } = runHookWithStderr({
    CCUSAGE_DISABLED: 'false',
    CCUSAGE_TEST_MOCK_DATA: mockData,
  });

  assert.equal(exitCode, 0);
  // Should mention cache somewhere
  assert.match(stderr, /cache|Cache/i, 'Should show cache info when cache tokens present');
  assert.match(stderr, /5,000/, 'Should show cache read token count');
});

// ── Test 8: exits 0 even on malformed stdin ────────────────────────────────

test('exits 0 on malformed/empty stdin (fail-open)', () => {
  const { exitCode } = runHookWithStderr({}, 'NOT VALID JSON {{{');
  assert.equal(exitCode, 0, 'Must exit 0 even with malformed stdin');
});

// ── Test 9: writes status to runtime file when CCUSAGE_RUNTIME_DIR is set ──

test('writes status to runtime file when CCUSAGE_RUNTIME_DIR is set', () => {
  const { spawnSync } = require('child_process');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccusage-test-'));

  try {
    const mockData = JSON.stringify({
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.0015,
    });

    const result = spawnSync('node', [HOOK_PATH], {
      input: '{}',
      encoding: 'utf8',
      env: {
        ...process.env,
        CCUSAGE_DISABLED: 'false',
        CCUSAGE_TEST_MOCK_DATA: mockData,
        CCUSAGE_RUNTIME_DIR: tmpDir,
      },
      shell: false,
      timeout: 10_000,
    });

    assert.equal(result.status ?? 0, 0, 'Hook must exit 0');

    const statusFile = path.join(tmpDir, 'ccusage-status.txt');
    assert.ok(
      fs.existsSync(statusFile),
      'ccusage-status.txt must be created in CCUSAGE_RUNTIME_DIR'
    );

    const content = fs.readFileSync(statusFile, 'utf8');
    assert.match(content, /\[tokens\]/, 'status file must contain [tokens] prefix');
    assert.match(content, /300/, 'status file must contain total token count (100+200=300)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('writes default status file under PROJECT_ROOT when cwd is outside repo', () => {
  const { spawnSync } = require('child_process');
  const outsideCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ccusage-outside-cwd-'));
  const backup = fs.existsSync(PROJECT_STATUS_FILE)
    ? fs.readFileSync(PROJECT_STATUS_FILE, 'utf8')
    : null;

  try {
    fs.rmSync(PROJECT_STATUS_FILE, { force: true });

    const result = spawnSync('node', [HOOK_PATH], {
      input: '{}',
      cwd: outsideCwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        CCUSAGE_DISABLED: 'false',
        CCUSAGE_TEST_MOCK_DATA: JSON.stringify({
          inputTokens: 10,
          outputTokens: 20,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0.001,
        }),
      },
      shell: false,
      timeout: 10_000,
    });

    assert.equal(result.status ?? 0, 0, 'Hook must exit 0');
    assert.ok(
      fs.existsSync(PROJECT_STATUS_FILE),
      'default ccusage status must be written under PROJECT_ROOT'
    );
    assert.equal(
      fs.existsSync(path.join(outsideCwd, '.claude', 'context', 'runtime', 'ccusage-status.txt')),
      false,
      'default ccusage status must not be written under process.cwd()'
    );
  } finally {
    if (backup === null) {
      fs.rmSync(PROJECT_STATUS_FILE, { force: true });
    } else {
      fs.mkdirSync(path.dirname(PROJECT_STATUS_FILE), { recursive: true });
      fs.writeFileSync(PROJECT_STATUS_FILE, backup, 'utf8');
    }
    fs.rmSync(outsideCwd, { recursive: true, force: true });
  }
});
