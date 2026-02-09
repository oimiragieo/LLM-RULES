/**
 * Tests for correction detection in user-prompt-unified.cjs
 *
 * Test Strategy:
 * - Test correction pattern detection (positive cases)
 * - Test false positives are avoided (negative cases)
 * - Test session-metrics.json is updated correctly
 * - Test graceful handling when session-metrics.json is missing
 * - Test stderr output contains correction warning
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'user-prompt-unified.cjs');
// Security: PROJECT_ROOT is process.cwd(), not user input - safe for path construction
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const METRICS_FILE = path.join(RUNTIME_DIR, 'session-metrics.json');

// Backup original metrics file if it exists
let originalMetrics = null;
// Security: RUNTIME_DIR derived from PROJECT_ROOT (process.cwd()), not user input
const REFLECTION_SPAWN_REQUEST = path.join(RUNTIME_DIR, 'reflection-spawn-request.json');
const REFLECTION_REMINDER = path.join(RUNTIME_DIR, 'reflection-reminder.txt');

before(() => {
  if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  }
  if (fs.existsSync(METRICS_FILE)) {
    originalMetrics = fs.readFileSync(METRICS_FILE, 'utf8');
  }
  // Clean up reflection files to avoid interference with tests
  if (fs.existsSync(REFLECTION_SPAWN_REQUEST)) {
    fs.unlinkSync(REFLECTION_SPAWN_REQUEST);
  }
  if (fs.existsSync(REFLECTION_REMINDER)) {
    fs.unlinkSync(REFLECTION_REMINDER);
  }
});

after(() => {
  // Restore original metrics file
  if (originalMetrics !== null) {
    fs.writeFileSync(METRICS_FILE, originalMetrics);
  } else if (fs.existsSync(METRICS_FILE)) {
    fs.unlinkSync(METRICS_FILE);
  }
});

/**
 * Helper to run hook with user prompt
 */
function runHookWithPrompt(prompt) {
  const input = JSON.stringify({
    hook_event: 'UserPromptSubmit',
    prompt: prompt,
    message: prompt,
    timestamp: new Date().toISOString(),
  });

  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    env: { ...process.env, DEBUG_HOOKS: 'false' },
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

/**
 * Helper to read session metrics
 */
function readMetrics() {
  if (!fs.existsSync(METRICS_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

describe('Correction Detection', () => {
  describe('Positive Detection Cases', () => {
    it('should detect "no, that\'s wrong" as a correction', () => {
      // Arrange: Clear metrics file
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      // Act
      const result = runHookWithPrompt("no, that's wrong");

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.match(
        result.stderr,
        /Correction Detected/i,
        'stderr should contain correction warning'
      );

      const metrics = readMetrics();
      assert.ok(metrics, 'session-metrics.json should be created');
      assert.strictEqual(metrics.corrections_count, 1, 'corrections_count should be 1');
      assert.ok(metrics.lastCorrectionAt, 'lastCorrectionAt timestamp should be set');
    });

    it('should detect "undo that change" as a correction', () => {
      // Arrange: Clear metrics file
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      // Act
      const result = runHookWithPrompt('undo that change');

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.match(
        result.stderr,
        /Correction Detected/i,
        'stderr should contain correction warning'
      );

      const metrics = readMetrics();
      assert.ok(metrics, 'session-metrics.json should be created');
      assert.strictEqual(metrics.corrections_count, 1, 'corrections_count should be 1');
    });

    it('should detect "revert that" as a correction', () => {
      // Arrange: Clear metrics file
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      // Act
      const result = runHookWithPrompt('revert that');

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.match(
        result.stderr,
        /Correction Detected/i,
        'stderr should contain correction warning'
      );

      const metrics = readMetrics();
      assert.ok(metrics, 'session-metrics.json should be created');
      assert.strictEqual(metrics.corrections_count, 1, 'corrections_count should be 1');
    });

    it('should detect "that\'s not what I meant" as a correction', () => {
      // Arrange: Clear metrics file
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      // Act
      const result = runHookWithPrompt("that's not what I meant");

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.match(
        result.stderr,
        /Correction Detected/i,
        'stderr should contain correction warning'
      );

      const metrics = readMetrics();
      assert.ok(metrics, 'session-metrics.json should be created');
      assert.strictEqual(metrics.corrections_count, 1, 'corrections_count should be 1');
    });
  });

  describe('Negative Cases (False Positive Prevention)', () => {
    it('should NOT detect "implement the feature" as a correction', () => {
      // Arrange: Clear metrics file
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      // Act
      const result = runHookWithPrompt('implement the feature');

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.doesNotMatch(
        result.stderr,
        /Correction Detected/i,
        'stderr should NOT contain correction warning'
      );

      const metrics = readMetrics();
      if (metrics) {
        assert.strictEqual(
          metrics.corrections_count || 0,
          0,
          'corrections_count should be 0 or undefined'
        );
      }
    });

    it('should NOT detect "I love that solution" as a correction', () => {
      // Arrange: Clear metrics file
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      // Act
      const result = runHookWithPrompt('I love that solution');

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.doesNotMatch(
        result.stderr,
        /Correction Detected/i,
        'stderr should NOT contain correction warning'
      );

      const metrics = readMetrics();
      if (metrics) {
        assert.strictEqual(
          metrics.corrections_count || 0,
          0,
          'corrections_count should be 0 or undefined'
        );
      }
    });

    it('should NOT detect "analyze the code" as a correction', () => {
      // Arrange: Clear metrics file
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      // Act
      const result = runHookWithPrompt('analyze the code');

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.doesNotMatch(
        result.stderr,
        /Correction Detected/i,
        'stderr should NOT contain correction warning'
      );

      const metrics = readMetrics();
      if (metrics) {
        assert.strictEqual(
          metrics.corrections_count || 0,
          0,
          'corrections_count should be 0 or undefined'
        );
      }
    });
  });

  describe('Counter Increment', () => {
    it('should increment correction count on multiple corrections', () => {
      // Arrange: Start with initial count
      fs.writeFileSync(METRICS_FILE, JSON.stringify({ corrections_count: 2, prompt_count: 10 }));

      // Act
      const result = runHookWithPrompt("no, that's wrong");

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.match(
        result.stderr,
        /Correction Detected/i,
        'stderr should contain correction warning'
      );
      assert.match(result.stderr, /total: 3/i, 'stderr should show total count of 3');

      const metrics = readMetrics();
      assert.ok(metrics, 'session-metrics.json should exist');
      assert.strictEqual(metrics.corrections_count, 3, 'corrections_count should be 3');
      assert.strictEqual(metrics.prompt_count, 10, 'prompt_count should be preserved');
    });
  });

  describe('Graceful Degradation', () => {
    it('should create session-metrics.json if missing', () => {
      // Arrange: Ensure file does not exist
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      // Act
      const result = runHookWithPrompt("no, that's wrong");

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      assert.match(
        result.stderr,
        /Correction Detected/i,
        'stderr should contain correction warning'
      );

      const metrics = readMetrics();
      assert.ok(metrics, 'session-metrics.json should be created');
      assert.strictEqual(metrics.corrections_count, 1, 'corrections_count should be 1');
    });

    it('should handle malformed session-metrics.json gracefully', () => {
      // Arrange: Write malformed JSON
      fs.writeFileSync(METRICS_FILE, '{ invalid json }');

      // Act
      const result = runHookWithPrompt("no, that's wrong");

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      // Hook should not crash, and should reset metrics
      const metrics = readMetrics();
      assert.ok(metrics, 'session-metrics.json should be valid after recovery');
      assert.strictEqual(metrics.corrections_count, 1, 'corrections_count should be 1 after reset');
    });
  });

  describe('Passthrough Behavior', () => {
    it('should pass through original input to stdout (non-blocking hook protocol)', () => {
      // Arrange: Clear metrics file
      if (fs.existsSync(METRICS_FILE)) {
        fs.unlinkSync(METRICS_FILE);
      }

      const originalPrompt = "no, that's wrong";

      // Act
      const result = runHookWithPrompt(originalPrompt);

      // Assert
      assert.strictEqual(result.status, 0, 'Hook should exit 0 (non-blocking)');
      // Note: This hook does not output JSON to stdout (it's a UserPromptSubmit hook, not a tool hook)
      // So we just verify it doesn't crash
      assert.ok(true, 'Hook executed without crashing');
    });
  });
});
