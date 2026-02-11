/**
 * Tests for adaptive-quality-gate.cjs hook
 *
 * Hook: PreToolUse (Edit|Write) - non-blocking, counts edits and suggests quality checkpoints
 *
 * Test Strategy:
 * - Run hook via execSync with JSON stdin
 * - Manipulate counter file between runs
 * - Verify stderr warnings and that stdout stays empty (side-effect-only hook)
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'session',
  'adaptive-quality-gate.cjs'
);

/**
 * Create isolated temp directory for test
 */
function createTestEnv() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptive-test-'));
  const runtimeDir = path.join(tempDir, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });

  return {
    runtimeDir,
    counterFile: path.join(runtimeDir, 'edit-counter.json'),
    metricsFile: path.join(runtimeDir, 'session-metrics.json'),
    cleanup: () => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Run the hook with given input and test environment
 */
function runHook(input, testEnv) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_RUNTIME_DIR: testEnv.runtimeDir,
    },
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status || 0,
  };
}

/**
 * Create a session metrics file with given correction rate in test env
 */
function createMetricsFile(testEnv, corrections, prompts) {
  fs.writeFileSync(
    testEnv.metricsFile,
    JSON.stringify({
      corrections_count: corrections,
      prompt_count: prompts,
    })
  );
}

const hookInput = {
  tool: 'Edit',
  parameters: { file_path: 'test.js', old_string: 'old', new_string: 'new' },
};

test('First edit creates counter file with count=1', () => {
  const testEnv = createTestEnv();
  try {
    const result = runHook(hookInput, testEnv);

    // Side-effect-only hook should not emit stdout
    assert.strictEqual(result.stdout.trim(), '');
    assert.strictEqual(result.exitCode, 0);

    // Counter file should exist with count=1
    assert.ok(fs.existsSync(testEnv.counterFile));
    const counter = JSON.parse(fs.readFileSync(testEnv.counterFile, 'utf8'));
    assert.strictEqual(counter.count, 1);
  } finally {
    testEnv.cleanup();
  }
});

test('5th edit triggers first threshold warning (default thresholds)', () => {
  const testEnv = createTestEnv();
  try {
    // Run hook 5 times
    for (let i = 0; i < 5; i++) {
      const result = runHook(hookInput, testEnv);
      if (i === 4) {
        // 5th run should have warning in stderr
        assert.ok(
          result.stderr.includes('checkpoint') ||
            result.stderr.includes('quality') ||
            result.stderr.includes('5 edits'),
          `Expected checkpoint/quality warning in stderr, got: ${result.stderr}`
        );
        assert.ok(result.stderr.includes('lint:fix'));
        assert.ok(result.stderr.includes('format'));
      }
      // All runs should remain non-blocking
      assert.strictEqual(result.exitCode, 0);
    }

    // Counter should be at 5
    const counter = JSON.parse(fs.readFileSync(testEnv.counterFile, 'utf8'));
    assert.strictEqual(counter.count, 5);
  } finally {
    testEnv.cleanup();
  }
});

test('10th edit triggers second threshold warning (default thresholds)', () => {
  const testEnv = createTestEnv();
  try {
    // Run hook 10 times
    let secondWarningFound = false;
    for (let i = 0; i < 10; i++) {
      const result = runHook(hookInput, testEnv);
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
    const counter = JSON.parse(fs.readFileSync(testEnv.counterFile, 'utf8'));
    assert.strictEqual(counter.count, 10);
  } finally {
    testEnv.cleanup();
  }
});

test('20th edit triggers repeat warning at interval of 10 (default thresholds)', () => {
  const testEnv = createTestEnv();
  try {
    // Run hook 20 times
    let repeatWarningFound = false;
    for (let i = 0; i < 20; i++) {
      const result = runHook(hookInput, testEnv);
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
    const counter = JSON.parse(fs.readFileSync(testEnv.counterFile, 'utf8'));
    assert.strictEqual(counter.count, 20);
  } finally {
    testEnv.cleanup();
  }
});

test('Adaptive thresholds lower when high correction rate (>25%)', () => {
  const testEnv = createTestEnv();
  try {
    // Create metrics file with 30% correction rate
    createMetricsFile(testEnv, 30, 100);

    // Run hook 3 times (first threshold should be 3 for high correction rate)
    let warningFound = false;
    for (let i = 0; i < 3; i++) {
      const result = runHook(hookInput, testEnv);
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
  } finally {
    testEnv.cleanup();
  }
});

test('Default thresholds used when no correction rate file exists', () => {
  const testEnv = createTestEnv();
  try {
    // No metrics file created

    // Run hook 5 times (default first threshold)
    let warningFound = false;
    for (let i = 0; i < 5; i++) {
      const result = runHook(hookInput, testEnv);
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
  } finally {
    testEnv.cleanup();
  }
});

test('Does not emit stdout on allow path (non-blocking verification)', () => {
  const testEnv = createTestEnv();
  try {
    const customInput = {
      tool: 'Write',
      parameters: { file_path: 'custom.js', content: 'console.log("test");' },
    };

    const result = runHook(customInput, testEnv);

    // Side-effect-only hook should not emit stdout
    assert.strictEqual(result.stdout.trim(), '');
    assert.strictEqual(result.exitCode, 0);
  } finally {
    testEnv.cleanup();
  }
});

test('Malformed counter file resets to 1 (no crash)', () => {
  const testEnv = createTestEnv();
  try {
    // Create malformed counter file
    fs.writeFileSync(testEnv.counterFile, 'invalid json{{{');

    const result = runHook(hookInput, testEnv);

    // Should not crash and should remain silent on stdout
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout.trim(), '');

    // Counter should be reset to 1
    const counter = JSON.parse(fs.readFileSync(testEnv.counterFile, 'utf8'));
    assert.strictEqual(counter.count, 1);
  } finally {
    testEnv.cleanup();
  }
});
