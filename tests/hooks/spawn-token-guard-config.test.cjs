'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const HOOK_PATH = path.resolve(__dirname, '../../.claude/hooks/routing/spawn-token-guard.cjs');
const RUNTIME_DIR = path.resolve(__dirname, '../../.claude/context/runtime');
const REMINDER_PATH = path.join(RUNTIME_DIR, 'compression-reminder.txt');

function runHook(input, env = {}) {
  const merged = { ...process.env, ...env };
  try {
    const stdout = execFileSync('node', [HOOK_PATH], {
      input: JSON.stringify(input),
      env: merged,
      timeout: 5000,
      encoding: 'utf-8',
      shell: false,
    });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

function makeTaskInput(promptLength) {
  return {
    tool_name: 'Task',
    tool_input: {
      prompt: 'x'.repeat(promptLength),
    },
  };
}

describe('D8: Configurable Context Thresholds', () => {
  beforeEach(() => {
    // Clean up reminder if it exists
    try {
      fs.unlinkSync(REMINDER_PATH);
    } catch (_) {
      /* ignore */
    }
  });

  afterEach(() => {
    // Restore state
    try {
      fs.unlinkSync(REMINDER_PATH);
    } catch (_) {
      /* ignore */
    }
  });

  it('should use default 80K warn threshold when env var is not set', () => {
    // 79K tokens = 316K chars, should NOT warn
    const result = runHook(makeTaskInput(316_000), {
      CONTEXT_THRESHOLD_WARN: undefined,
      CONTEXT_THRESHOLD_BLOCK: undefined,
    });
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true);
    assert.equal(parsed.message, undefined, 'Should not have a warn message under 80K');
  });

  it('should use custom CONTEXT_THRESHOLD_WARN from env', () => {
    // Set warn to 10K tokens (= 40K chars). Send 50K chars (12.5K tokens) -> should warn
    const result = runHook(makeTaskInput(50_000), {
      CONTEXT_THRESHOLD_WARN: '10000',
      CONTEXT_THRESHOLD_BLOCK: '200000',
    });
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true);
    assert.ok(parsed.message, 'Should have a warn message above custom 10K threshold');
    assert.ok(parsed.message.includes('WARN'), 'Message should contain WARN');
  });

  it('should use custom CONTEXT_THRESHOLD_BLOCK from env', () => {
    // Set block to 5K tokens (= 20K chars). Send 25K chars (6.25K tokens) -> should block
    // v2.5.0 ADR: token hard-limit exits 4 (DEGRADE) instead of 2 (BLOCK)
    const result = runHook(makeTaskInput(25_000), {
      CONTEXT_THRESHOLD_WARN: '1000',
      CONTEXT_THRESHOLD_BLOCK: '5000',
    });
    assert.equal(result.exitCode, 4, 'Should DEGRADE (exit 4) above custom block threshold');
  });

  it('should fall back to hardcoded 80K warn when env var is invalid', () => {
    // Invalid env var should fall back to 80K
    const result = runHook(makeTaskInput(316_000), {
      CONTEXT_THRESHOLD_WARN: 'not-a-number',
      CONTEXT_THRESHOLD_BLOCK: 'invalid',
    });
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true);
    // 79K tokens is under default 80K, so no warning expected
    assert.equal(parsed.message, undefined);
  });

  it('should fall back to hardcoded 120K block when env var is invalid', () => {
    // Invalid env var, 130K tokens = 520K chars -> should DEGRADE at default 120K
    // v2.5.0 ADR: token hard-limit exits 4 (DEGRADE) instead of 2 (BLOCK)
    const result = runHook(makeTaskInput(520_000), {
      CONTEXT_THRESHOLD_WARN: 'invalid',
      CONTEXT_THRESHOLD_BLOCK: 'invalid',
    });
    assert.equal(result.exitCode, 4, 'Should DEGRADE (exit 4) at default 120K threshold');
  });

  it('should allow prompts under custom warn threshold without message', () => {
    // Set warn to 50K. Send 30K tokens (120K chars) -> should pass silently
    const result = runHook(makeTaskInput(120_000), {
      CONTEXT_THRESHOLD_WARN: '50000',
      CONTEXT_THRESHOLD_BLOCK: '200000',
    });
    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true);
    assert.equal(parsed.message, undefined, 'Should not warn under custom threshold');
  });
});
