/**
 * Tests for adaptive-quality-gate.cjs hook
 *
 * Hook: PreToolUse (Edit|Write) - non-blocking, counts edits and suggests quality checkpoints
 *
 * Test Strategy:
 * - Run hook via execSync with JSON stdin
 * - Manipulate counter file between runs
 * - Verify stdout (passthrough) and stderr (warnings)
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'adaptive-quality-gate.cjs');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const COUNTER_FILE = path.join(RUNTIME_DIR, 'edit-counter.json');
const METRICS_FILE = path.join(RUNTIME_DIR, 'session-metrics.json');

/**
 * Run the hook with given input, return { stdout, stderr, exitCode }
 */
function runHook(input) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status || 0,
  };
}

/**
 * Clean up test files before each test
 */
function cleanupTestFiles() {
  if (fs.existsSync(COUNTER_FILE)) {
    fs.unlinkSync(COUNTER_FILE);
  }
  if (fs.existsSync(METRICS_FILE)) {
    fs.unlinkSync(METRICS_FILE);
  }
}

/**
 * Create a session metrics file with given correction rate
 */
function createMetricsFile(corrections, prompts) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(METRICS_FILE, JSON.stringify({
    corrections_count: corrections,
    prompt_count: prompts,
  }));
}

const hookInput = {
  tool: 'Edit',
  parameters: { file_path: 'test.js', old_string: 'old', new_string: 'new' },
};

test('First edit creates counter file with count=1', () => {
  cleanupTestFiles();
  const result = runHook(hookInput);

  // Should pass through original input
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.tool, 'Edit');
  assert.strictEqual(result.exitCode, 0);

  // Counter file should exist with count=1
  assert.ok(fs.existsSync(COUNTER_FILE));
  const counter = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
  assert.strictEqual(counter.count, 1);
});

test('5th edit triggers first threshold warning (default thresholds)', () => {
  cleanupTestFiles();

  // Run hook 5 times
  for (let i = 0; i < 5; i++) {
    const result = runHook(hookInput);
    if (i === 4) {
      // 5th run should have warning in stderr
      assert.ok(
        result.stderr.includes('checkpoint') || result.stderr.includes('quality') || result.stderr.includes('5 edits'),
        `Expected checkpoint/quality warning in stderr, got: ${result.stderr}`
      );
      assert.ok(result.stderr.includes('lint:fix'));
      assert.ok(result.stderr.includes('format'));
    }
    // All runs should pass through
    assert.strictEqual(result.exitCode, 0);
  }

  // Counter should be at 5
  const counter = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
  assert.strictEqual(counter.count, 5);
});

test('10th edit triggers second threshold warning (default thresholds)', () => {
  cleanupTestFiles();

  // Run hook 10 times
  let secondWarningFound = false;
  for (let i = 0; i < 10; i++) {
    const result = runHook(hookInput);
    if (i === 9) {
      // 10th run should have stronger warning
      assert.ok(
        result.stderr.includes('10 edits') || result.stderr.includes('Strongly recommend'),
        `Expected stronger warning in stderr, got: ${result.stderr}`
      );
      assert.ok(result.stderr.includes('test'));
      secondWarningFound = true;
    }
    assert.strictEqual(result.exitCode, 0);
  }

  assert.ok(secondWarningFound);
  const counter = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
  assert.strictEqual(counter.count, 10);
});

test('20th edit triggers repeat warning at interval of 10 (default thresholds)', () => {
  cleanupTestFiles();

  // Run hook 20 times
  let repeatWarningFound = false;
  for (let i = 0; i < 20; i++) {
    const result = runHook(hookInput);
    if (i === 19) {
      // 20th run should have repeat warning
      assert.ok(
        result.stderr.includes('20 edits') || result.stderr.includes('checkpoint'),
        `Expected repeat warning in stderr, got: ${result.stderr}`
      );
      repeatWarningFound = true;
    }
    assert.strictEqual(result.exitCode, 0);
  }

  assert.ok(repeatWarningFound);
  const counter = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
  assert.strictEqual(counter.count, 20);
});

test('Adaptive thresholds lower when high correction rate (>25%)', () => {
  cleanupTestFiles();

  // Create metrics file with 30% correction rate
  createMetricsFile(30, 100);

  // Run hook 3 times (first threshold should be 3 for high correction rate)
  let warningFound = false;
  for (let i = 0; i < 3; i++) {
    const result = runHook(hookInput);
    if (i === 2) {
      // 3rd run should trigger first threshold
      assert.ok(
        result.stderr.includes('3 edits') || result.stderr.includes('checkpoint'),
        `Expected first threshold warning at 3 edits, got: ${result.stderr}`
      );
      warningFound = true;
    }
    assert.strictEqual(result.exitCode, 0);
  }

  assert.ok(warningFound);
});

test('Default thresholds used when no correction rate file exists', () => {
  cleanupTestFiles();
  // No metrics file created

  // Run hook 5 times (default first threshold)
  let warningFound = false;
  for (let i = 0; i < 5; i++) {
    const result = runHook(hookInput);
    if (i === 4) {
      assert.ok(
        result.stderr.includes('5 edits') || result.stderr.includes('checkpoint'),
        `Expected default threshold at 5 edits, got: ${result.stderr}`
      );
      warningFound = true;
    }
    assert.strictEqual(result.exitCode, 0);
  }

  assert.ok(warningFound);
});

test('Always passes through original JSON to stdout (non-blocking verification)', () => {
  cleanupTestFiles();

  const customInput = {
    tool: 'Write',
    parameters: { file_path: 'custom.js', content: 'console.log("test");' },
  };

  const result = runHook(customInput);

  // Should pass through unchanged
  const parsed = JSON.parse(result.stdout);
  assert.deepStrictEqual(parsed, customInput);
  assert.strictEqual(result.exitCode, 0);
});

test('Malformed counter file resets to 1 (no crash)', () => {
  cleanupTestFiles();

  // Create malformed counter file
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.writeFileSync(COUNTER_FILE, 'invalid json{{{');

  const result = runHook(hookInput);

  // Should not crash, should pass through
  assert.strictEqual(result.exitCode, 0);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.tool, 'Edit');

  // Counter should be reset to 1
  const counter = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
  assert.strictEqual(counter.count, 1);
});
