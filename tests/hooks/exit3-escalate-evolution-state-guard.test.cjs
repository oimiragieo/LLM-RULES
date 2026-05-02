'use strict';

/**
 * Evolution-state guard block regression tests.
 *
 * Direct hook blocks use exit 2. The stderr trailer keeps structured
 * escalation metadata for downstream dispatchers.
 *
 * Site:
 *   Line ~314 - evolution lock active (concurrent evolution) -> exit 2,
 *   blockerType=concurrent_evolution, blocker=evolution_lock_active
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/evolution/evolution-state-guard.cjs'
);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// We need access to the lock path to pre-create a lock for the test
const { EVOLUTION_LOCK_PATH } = require('../../.claude/hooks/evolution/evolution-state-guard.cjs');

/**
 * Run the hook subprocess with controlled stdin and env.
 * The evolution-state-guard hook triggers on Edit/Write calls targeting
 * evolution-state.json files. Craft input accordingly.
 */
function runHook(toolName, toolInput, envOverrides = {}) {
  const stdinData = JSON.stringify({ tool_name: toolName, tool_input: toolInput });
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: stdinData,
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      EVOLUTION_STATE_GUARD: 'block',
      ...envOverrides,
    },
    timeout: 15000,
    shell: false,
    windowsHide: true,
  });
}

/** Build a Write tool_input targeting evolution-state.json with given state value. */
function evolutionWriteInput(state) {
  return {
    file_path: path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'evolution-state.json'),
    content: JSON.stringify({ state }),
  };
}

/**
 * Write a fresh (non-stale) evolution lock file so acquireEvolutionLock will fail.
 */
function writeFreshLock(owner = 'concurrent-test-process') {
  const lockData = JSON.stringify({ timestamp: Date.now(), pid: 99998, owner });
  try {
    fs.mkdirSync(path.dirname(EVOLUTION_LOCK_PATH), { recursive: true });
  } catch (_) {
    /* ok */
  }
  fs.writeFileSync(EVOLUTION_LOCK_PATH, lockData, 'utf8');
}

/**
 * Remove the lock file after test.
 */
function removeLock() {
  try {
    fs.unlinkSync(EVOLUTION_LOCK_PATH);
  } catch (_) {
    /* ok */
  }
}

// ---------------------------------------------------------------------------
// Site 5: evolution lock active -> exit 2
// ---------------------------------------------------------------------------

test('site5: evolution lock active when starting idle->evaluating -> exit 2', () => {
  // Pre-create a live lock so acquireEvolutionLock will fail
  writeFreshLock('other-evolution-process');

  const result = runHook('Write', evolutionWriteInput('evaluating'));
  removeLock();

  assert.equal(
    result.status,
    2,
    `Expected exit 2 when evolution lock active, got ${result.status}. stderr: ${result.stderr}`
  );
});

test('site5: evolution lock active → ESCALATE trailer with blockerType=concurrent_evolution', () => {
  writeFreshLock('blocking-owner');

  const result = runHook('Write', evolutionWriteInput('evaluating'));
  removeLock();

  assert.ok(
    result.stderr.includes('ESCALATE:'),
    `Expected ESCALATE: trailer in stderr. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blockerType=concurrent_evolution'),
    `Expected blockerType=concurrent_evolution. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('needsFrom=user'),
    `Expected needsFrom=user. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blocker=evolution_lock_active'),
    `Expected blocker=evolution_lock_active. Got: ${result.stderr}`
  );
});

test('site5: evolution lock active in warn mode -> exit 0 (warn unchanged)', () => {
  writeFreshLock('other-process');

  const result = runHook('Write', evolutionWriteInput('evaluating'), {
    EVOLUTION_STATE_GUARD: 'warn',
  });
  removeLock();

  assert.equal(
    result.status,
    0,
    `Expected exit 0 in warn mode, got ${result.status}. stderr: ${result.stderr}`
  );
});

test('site5: no lock active -> idle->evaluating transition succeeds (exit 0)', () => {
  // Ensure no lock exists
  removeLock();

  const result = runHook('Write', evolutionWriteInput('evaluating'));
  // Clean up any lock this test may have acquired
  removeLock();

  assert.equal(
    result.status,
    0,
    `Expected exit 0 when no lock active and transition is valid, got ${result.status}. stderr: ${result.stderr}`
  );
});
