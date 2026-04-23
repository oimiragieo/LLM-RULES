'use strict';
/**
 * exit4-degrade-spawn-token-guard.test.cjs
 *
 * RED tests (TDD) for exit-4 DEGRADE conversions in spawn-token-guard.cjs.
 *
 * Site 1 (line ~65): token hard-limit exceeded → exit 4 + DEGRADE: reason=context_too_large
 * Site 2 (line ~104): projected budget exceeded → exit 4 + DEGRADE: reason=projected_budget_exceeded
 *
 * ADR: .claude/context/artifacts/analysis/hook-exit-code-contract-2026-04-21.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.resolve(__dirname, '../../.claude/hooks/routing/spawn-token-guard.cjs');
const PROJECT_ROOT = path.resolve(__dirname, '../../');

function runHook(input, env = {}) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    shell: false,
    timeout: 8000,
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function makeTaskInput(promptLength) {
  return {
    tool_name: 'Task',
    tool_input: { prompt: 'x'.repeat(promptLength) },
  };
}

function makeProjectedInput({ promptLength = 0, skillsContext = 0, memoryPayload = 0 } = {}) {
  return {
    tool_name: 'Task',
    tool_input: {
      prompt: 'x'.repeat(promptLength),
      _spawn_budget_meta: {
        skills_context_chars: skillsContext,
        memory_payload_chars: memoryPayload,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Site 1: token hard-limit exceeded → exit 4 + DEGRADE trailer
// ---------------------------------------------------------------------------
describe('spawn-token-guard: Site 1 — token hard-limit → exit 4 DEGRADE', () => {
  it('exits 4 (not 2) when token count exceeds BLOCK threshold', () => {
    // Custom block at 5K tokens (=20K chars). Send 25K chars (>5K tokens).
    const result = runHook(makeTaskInput(25_000), {
      CONTEXT_THRESHOLD_WARN: '1000',
      CONTEXT_THRESHOLD_BLOCK: '5000',
    });
    assert.strictEqual(
      result.exitCode,
      4,
      `Expected exit 4 for token hard-limit, got ${result.exitCode}. stderr: ${result.stderr}`
    );
  });

  it('emits DEGRADE: reason=context_too_large trailer on stderr when hard-limit hit', () => {
    const result = runHook(makeTaskInput(25_000), {
      CONTEXT_THRESHOLD_WARN: '1000',
      CONTEXT_THRESHOLD_BLOCK: '5000',
    });
    assert.ok(
      result.stderr.includes('DEGRADE:'),
      `Expected stderr to contain "DEGRADE:", got: ${result.stderr}`
    );
    assert.ok(
      result.stderr.includes('reason=context_too_large'),
      `Expected "reason=context_too_large" in stderr, got: ${result.stderr}`
    );
  });

  it('includes threshold value in DEGRADE trailer', () => {
    const result = runHook(makeTaskInput(25_000), {
      CONTEXT_THRESHOLD_WARN: '1000',
      CONTEXT_THRESHOLD_BLOCK: '5000',
    });
    assert.ok(
      result.stderr.includes('threshold=5000'),
      `Expected "threshold=5000" in DEGRADE trailer, got: ${result.stderr}`
    );
  });
});

// ---------------------------------------------------------------------------
// Site 2: projected budget exceeded (SPAWN_BUDGET_HARD=on) → exit 4 + DEGRADE trailer
// ---------------------------------------------------------------------------
describe('spawn-token-guard: Site 2 — projected budget exceeded → exit 4 DEGRADE', () => {
  it('exits 4 (not 2) when projected context exceeds hard budget limit', () => {
    // 90K tokens = 360K chars; default budget 50K * 1.6 = 80K hard limit
    const result = runHook(
      makeProjectedInput({
        promptLength: 200_000,
        skillsContext: 100_000,
        memoryPayload: 60_000,
      }),
      {
        SPAWN_BUDGET_HARD: 'on',
        CONTEXT_THRESHOLD_WARN: '999999',
        CONTEXT_THRESHOLD_BLOCK: '9999999',
      }
    );
    assert.strictEqual(
      result.exitCode,
      4,
      `Expected exit 4 for projected budget exceeded, got ${result.exitCode}. stderr: ${result.stderr}`
    );
  });

  it('emits DEGRADE: reason=projected_budget_exceeded trailer on stderr', () => {
    const result = runHook(
      makeProjectedInput({
        promptLength: 200_000,
        skillsContext: 100_000,
        memoryPayload: 60_000,
      }),
      {
        SPAWN_BUDGET_HARD: 'on',
        CONTEXT_THRESHOLD_WARN: '999999',
        CONTEXT_THRESHOLD_BLOCK: '9999999',
      }
    );
    assert.ok(
      result.stderr.includes('DEGRADE:'),
      `Expected stderr to contain "DEGRADE:", got: ${result.stderr}`
    );
    assert.ok(
      result.stderr.includes('reason=projected_budget_exceeded'),
      `Expected "reason=projected_budget_exceeded" in stderr, got: ${result.stderr}`
    );
  });

  it('includes threshold value in projected budget DEGRADE trailer', () => {
    // Default: SPAWN_BUDGET_WARN=50000, HARD_LIMIT=floor(50000*1.6)=80000
    const result = runHook(
      makeProjectedInput({
        promptLength: 200_000,
        skillsContext: 100_000,
        memoryPayload: 60_000,
      }),
      {
        SPAWN_BUDGET_HARD: 'on',
        CONTEXT_THRESHOLD_WARN: '999999',
        CONTEXT_THRESHOLD_BLOCK: '9999999',
      }
    );
    assert.ok(
      result.stderr.includes('threshold='),
      `Expected "threshold=" in projected budget DEGRADE trailer, got: ${result.stderr}`
    );
  });
});
