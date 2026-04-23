'use strict';

/**
 * spawn-budget-preflight.test.cjs — TDD RED tests for spawn-budget pre-flight check
 *
 * Tests projected context budget enforcement in spawn-token-guard.cjs.
 * Projected context = skills context + memory injection + prompt length (4 chars/token).
 *
 * Test IDs: SBP-001 … SBP-005
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.resolve(__dirname, '../../.claude/hooks/routing/spawn-token-guard.cjs');

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

/**
 * Build a Task hook input with separate projected-context fields.
 * The hook must read these fields from tool_input metadata to compute:
 *   projectedTokens = (skillsContext + memoryPayload + promptLength) / 4
 *
 * @param {object} opts
 * @param {number} opts.promptLength     - bytes in the prompt string
 * @param {number} opts.skillsContext    - estimated bytes from loaded skills
 * @param {number} opts.memoryPayload    - estimated bytes from memory injection
 */
function makeProjectedInput({ promptLength = 0, skillsContext = 0, memoryPayload = 0 } = {}) {
  return {
    tool_name: 'Task',
    tool_input: {
      prompt: 'x'.repeat(promptLength),
      // Metadata fields injected by spawn-prompt-assembler (S3 integration point)
      _spawn_budget_meta: {
        skills_context_chars: skillsContext,
        memory_payload_chars: memoryPayload,
      },
    },
  };
}

describe('SBP: Spawn Budget Pre-flight', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  // -------------------------------------------------------------------------
  // SBP-001: projected context < 50K tokens → passes through with no warning
  // -------------------------------------------------------------------------
  it('SBP-001: projected context under 50K tokens passes silently', () => {
    // 40K tokens = 160K chars total. Split: 80K prompt + 50K skills + 30K memory
    const input = makeProjectedInput({
      promptLength: 80_000,
      skillsContext: 50_000,
      memoryPayload: 30_000,
    });

    // Total chars = 160K → 40K tokens → under 50K default
    const result = runHook(input, {
      SPAWN_BUDGET_DEFAULT_CONTEXT: undefined,
      SPAWN_BUDGET_HARD: undefined,
      // Push existing warn/block thresholds up so they don't fire
      CONTEXT_THRESHOLD_WARN: '999999',
      CONTEXT_THRESHOLD_BLOCK: '9999999',
    });

    assert.equal(result.exitCode, 0, 'Should exit 0 (allow) under budget');
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true, 'Should allow');
    assert.ok(
      !parsed.message || !parsed.message.includes('CONTEXT BUDGET WARNING'),
      'Should NOT include CONTEXT BUDGET WARNING below threshold'
    );
  });

  // -------------------------------------------------------------------------
  // SBP-002: projected context 50K–80K tokens → warning attached to spawn prompt
  // -------------------------------------------------------------------------
  it('SBP-002: projected context between 50K and 80K tokens attaches CONTEXT BUDGET WARNING', () => {
    // 60K tokens = 240K chars total. Split: 100K prompt + 100K skills + 40K memory
    const input = makeProjectedInput({
      promptLength: 100_000,
      skillsContext: 100_000,
      memoryPayload: 40_000,
    });

    // Total = 240K chars → 60K tokens → above 50K default, below 80K existing warn
    const result = runHook(input, {
      SPAWN_BUDGET_DEFAULT_CONTEXT: undefined,
      SPAWN_BUDGET_HARD: undefined,
      CONTEXT_THRESHOLD_WARN: '999999',
      CONTEXT_THRESHOLD_BLOCK: '9999999',
    });

    assert.equal(result.exitCode, 0, 'Should exit 0 (allow) in warning range');
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.allow, true, 'Should allow in warning range');
    assert.ok(parsed.message, 'Should have a message in warning range');
    assert.ok(
      parsed.message.includes('CONTEXT BUDGET WARNING'),
      `Message should contain "CONTEXT BUDGET WARNING", got: ${parsed.message}`
    );
    // Message should include the projected size
    assert.ok(
      /\d+/.test(parsed.message),
      'Warning message should include the projected token count'
    );
  });

  // -------------------------------------------------------------------------
  // SBP-003: projected context > 80K AND SPAWN_BUDGET_HARD=on → DEGRADE (exit 4)
  // (v2.5.0: converted from exit 2 per hook-exit-code-contract-2026-04-21.md ADR)
  // -------------------------------------------------------------------------
  it('SBP-003: projected context > 80K with SPAWN_BUDGET_HARD=on degrades spawn (exit 4)', () => {
    // 90K tokens = 360K chars. Split: 200K prompt + 100K skills + 60K memory
    const input = makeProjectedInput({
      promptLength: 200_000,
      skillsContext: 100_000,
      memoryPayload: 60_000,
    });

    // Total = 360K chars → 90K tokens → above 80K hard limit with SPAWN_BUDGET_HARD=on
    const result = runHook(input, {
      SPAWN_BUDGET_DEFAULT_CONTEXT: undefined,
      SPAWN_BUDGET_HARD: 'on',
      CONTEXT_THRESHOLD_WARN: '999999',
      CONTEXT_THRESHOLD_BLOCK: '9999999',
    });

    assert.equal(result.exitCode, 4, 'Should exit 4 (DEGRADE) when projected > 80K with HARD=on');
  });

  // -------------------------------------------------------------------------
  // SBP-004: configurable via SPAWN_BUDGET_DEFAULT_CONTEXT env (default 50000)
  // -------------------------------------------------------------------------
  it('SBP-004: SPAWN_BUDGET_DEFAULT_CONTEXT overrides the 50K default threshold', () => {
    // With default 50K: 60K tokens should warn. With custom 70K: 60K should pass silently.
    const input = makeProjectedInput({
      promptLength: 100_000,
      skillsContext: 100_000,
      memoryPayload: 40_000,
    });
    // 60K tokens

    // Case A: custom threshold of 70K → 60K tokens should pass silently
    const resultA = runHook(input, {
      SPAWN_BUDGET_DEFAULT_CONTEXT: '70000',
      SPAWN_BUDGET_HARD: undefined,
      CONTEXT_THRESHOLD_WARN: '999999',
      CONTEXT_THRESHOLD_BLOCK: '9999999',
    });
    assert.equal(resultA.exitCode, 0, 'Should exit 0 under custom 70K threshold');
    const parsedA = JSON.parse(resultA.stdout);
    assert.equal(parsedA.allow, true);
    assert.ok(
      !parsedA.message || !parsedA.message.includes('CONTEXT BUDGET WARNING'),
      'Should not warn under custom 70K threshold'
    );

    // Case B: custom threshold of 40K → 60K tokens should warn
    const resultB = runHook(input, {
      SPAWN_BUDGET_DEFAULT_CONTEXT: '40000',
      SPAWN_BUDGET_HARD: undefined,
      CONTEXT_THRESHOLD_WARN: '999999',
      CONTEXT_THRESHOLD_BLOCK: '9999999',
    });
    assert.equal(resultB.exitCode, 0, 'Should exit 0 (warn, not block) in soft mode');
    const parsedB = JSON.parse(resultB.stdout);
    assert.equal(parsedB.allow, true);
    assert.ok(
      parsedB.message && parsedB.message.includes('CONTEXT BUDGET WARNING'),
      'Should warn above custom 40K threshold'
    );
  });

  // -------------------------------------------------------------------------
  // SBP-005: projection = sum of skills_context_chars + memory_payload_chars + prompt length
  //          estimated via 4 chars/token ratio
  // -------------------------------------------------------------------------
  it('SBP-005: projection correctly sums skills+memory+prompt via 4 chars/token ratio', () => {
    // Precisely at threshold: 50K tokens = 200K chars
    // 80K prompt + 80K skills + 40K memory = 200K chars = exactly 50K tokens
    // Should warn (≥ threshold)
    const inputAtThreshold = makeProjectedInput({
      promptLength: 80_000,
      skillsContext: 80_000,
      memoryPayload: 40_000,
    });

    const resultAt = runHook(inputAtThreshold, {
      SPAWN_BUDGET_DEFAULT_CONTEXT: '50000',
      SPAWN_BUDGET_HARD: undefined,
      CONTEXT_THRESHOLD_WARN: '999999',
      CONTEXT_THRESHOLD_BLOCK: '9999999',
    });
    assert.equal(resultAt.exitCode, 0, 'At threshold: allow');
    const parsedAt = JSON.parse(resultAt.stdout);
    assert.ok(
      parsedAt.message && parsedAt.message.includes('CONTEXT BUDGET WARNING'),
      'Should warn at exact threshold (200K chars = 50K tokens)'
    );

    // One char under threshold: 199_999 total chars = 49_999.75 → 49_999 tokens < 50K
    // 80K prompt + 79_999 skills + 40K memory = 199_999 chars → should NOT warn
    const inputUnder = makeProjectedInput({
      promptLength: 80_000,
      skillsContext: 79_999,
      memoryPayload: 40_000,
    });

    const resultUnder = runHook(inputUnder, {
      SPAWN_BUDGET_DEFAULT_CONTEXT: '50000',
      SPAWN_BUDGET_HARD: undefined,
      CONTEXT_THRESHOLD_WARN: '999999',
      CONTEXT_THRESHOLD_BLOCK: '9999999',
    });
    assert.equal(resultUnder.exitCode, 0, 'Just under threshold: allow');
    const parsedUnder = JSON.parse(resultUnder.stdout);
    assert.ok(
      !parsedUnder.message || !parsedUnder.message.includes('CONTEXT BUDGET WARNING'),
      'Should NOT warn just under threshold (199_999 chars = 49_999 tokens < 50K)'
    );
  });
});
