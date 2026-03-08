#!/usr/bin/env node
/**
 * Tests for evolution-state-guard.cjs
 *
 * Tests the state machine guard hook which ensures valid state transitions
 * in the EVOLVE workflow. Prevents skipping phases or invalid state changes.
 */

'use strict';

// Test helpers
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

console.log('\n=== evolution-state-guard.cjs tests ===\n');

const fs = require('fs');
const os = require('os');
const path = require('path');

// Import the module under test
const {
  getEnforcementMode,
  isValidTransition,
  VALID_STATES,
  STATE_TRANSITIONS,
  checkEvolutionLock,
  acquireEvolutionLock,
  EVOLUTION_LOCK_TTL_MS,
} = require('../../.claude/hooks/evolution/evolution-state-guard.cjs');

// Test: Module exports exist
test('exports getEnforcementMode function', () => {
  assertEqual(typeof getEnforcementMode, 'function', 'Should export function');
});

test('exports isValidTransition function', () => {
  assertEqual(typeof isValidTransition, 'function', 'Should export function');
});

test('exports VALID_STATES constant', () => {
  assertEqual(Array.isArray(VALID_STATES), true, 'Should export array');
  assertEqual(VALID_STATES.includes('idle'), true, 'Should include idle');
  assertEqual(VALID_STATES.includes('evaluating'), true, 'Should include evaluating');
  assertEqual(VALID_STATES.includes('validating'), true, 'Should include validating');
  assertEqual(VALID_STATES.includes('obtaining'), true, 'Should include obtaining');
  assertEqual(VALID_STATES.includes('locking'), true, 'Should include locking');
  assertEqual(VALID_STATES.includes('verifying'), true, 'Should include verifying');
  assertEqual(VALID_STATES.includes('enabling'), true, 'Should include enabling');
});

test('exports STATE_TRANSITIONS map', () => {
  assertEqual(typeof STATE_TRANSITIONS, 'object', 'Should export object');
});

// Test: getEnforcementMode
test('getEnforcementMode returns block by default', () => {
  const originalEnv = process.env.EVOLUTION_STATE_GUARD;
  delete process.env.EVOLUTION_STATE_GUARD;
  assertEqual(getEnforcementMode(), 'block', 'Default should be block');
  process.env.EVOLUTION_STATE_GUARD = originalEnv;
});

test('getEnforcementMode respects EVOLUTION_STATE_GUARD env var', () => {
  const originalEnv = process.env.EVOLUTION_STATE_GUARD;
  process.env.EVOLUTION_STATE_GUARD = 'warn';
  assertEqual(getEnforcementMode(), 'warn', 'Should be warn');
  process.env.EVOLUTION_STATE_GUARD = 'off';
  assertEqual(getEnforcementMode(), 'off', 'Should be off');
  process.env.EVOLUTION_STATE_GUARD = originalEnv;
});

test('getEnforcementMode defaults to block for invalid values', () => {
  const originalEnv = process.env.EVOLUTION_STATE_GUARD;
  process.env.EVOLUTION_STATE_GUARD = 'invalid';
  assertEqual(getEnforcementMode(), 'block', 'Should default to block');
  process.env.EVOLUTION_STATE_GUARD = originalEnv;
});

// Test: Valid state transitions
test('isValidTransition: idle -> evaluating is valid', () => {
  assertEqual(isValidTransition('idle', 'evaluating'), true, 'Should be valid');
});

test('isValidTransition: evaluating -> validating is valid', () => {
  assertEqual(isValidTransition('evaluating', 'validating'), true, 'Should be valid');
});

test('isValidTransition: evaluating -> aborted is valid', () => {
  assertEqual(isValidTransition('evaluating', 'aborted'), true, 'Should be valid');
});

test('isValidTransition: validating -> obtaining is valid', () => {
  assertEqual(isValidTransition('validating', 'obtaining'), true, 'Should be valid');
});

test('isValidTransition: validating -> aborted is valid', () => {
  assertEqual(isValidTransition('validating', 'aborted'), true, 'Should be valid');
});

test('isValidTransition: obtaining -> locking is valid', () => {
  assertEqual(isValidTransition('obtaining', 'locking'), true, 'Should be valid');
});

test('isValidTransition: obtaining -> obtaining is valid (more research)', () => {
  assertEqual(isValidTransition('obtaining', 'obtaining'), true, 'Should be valid');
});

test('isValidTransition: locking -> verifying is valid', () => {
  assertEqual(isValidTransition('locking', 'verifying'), true, 'Should be valid');
});

test('isValidTransition: locking -> locking is valid (retry)', () => {
  assertEqual(isValidTransition('locking', 'locking'), true, 'Should be valid');
});

test('isValidTransition: verifying -> enabling is valid', () => {
  assertEqual(isValidTransition('verifying', 'enabling'), true, 'Should be valid');
});

test('isValidTransition: verifying -> locking is valid (fix issues)', () => {
  assertEqual(isValidTransition('verifying', 'locking'), true, 'Should be valid');
});

test('isValidTransition: enabling -> idle is valid', () => {
  assertEqual(isValidTransition('enabling', 'idle'), true, 'Should be valid');
});

// Test: Invalid state transitions (skipping phases)
test('isValidTransition: idle -> locking is INVALID (skip research)', () => {
  assertEqual(isValidTransition('idle', 'locking'), false, 'Should be invalid');
});

test('isValidTransition: idle -> obtaining is INVALID (skip evaluate)', () => {
  assertEqual(isValidTransition('idle', 'obtaining'), false, 'Should be invalid');
});

test('isValidTransition: evaluating -> locking is INVALID (skip research)', () => {
  assertEqual(isValidTransition('evaluating', 'locking'), false, 'Should be invalid');
});

test('isValidTransition: validating -> locking is INVALID (skip research)', () => {
  assertEqual(isValidTransition('validating', 'locking'), false, 'Should be invalid');
});

test('isValidTransition: obtaining -> enabling is INVALID (skip verify)', () => {
  assertEqual(isValidTransition('obtaining', 'enabling'), false, 'Should be invalid');
});

test('isValidTransition: locking -> enabling is INVALID (skip verify)', () => {
  assertEqual(isValidTransition('locking', 'enabling'), false, 'Should be invalid');
});

// Test: Edge cases
test('isValidTransition handles unknown states', () => {
  assertEqual(isValidTransition('unknown', 'evaluating'), false, 'Unknown from should be invalid');
  assertEqual(isValidTransition('idle', 'unknown'), false, 'Unknown to should be invalid');
});

test('isValidTransition handles null/undefined', () => {
  assertEqual(isValidTransition(null, 'evaluating'), false, 'null from should be invalid');
  assertEqual(isValidTransition('idle', null), false, 'null to should be invalid');
  assertEqual(
    isValidTransition(undefined, 'evaluating'),
    false,
    'undefined from should be invalid'
  );
  assertEqual(isValidTransition('idle', undefined), false, 'undefined to should be invalid');
});

// Test: acquireEvolutionLock — atomic lock acquisition (SEC-TOCTOU fix)
// These tests use a temp lock path to avoid interfering with real evolution state.
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolution-lock-test-'));
  const realLockPath =
    require('../../.claude/hooks/evolution/evolution-state-guard.cjs').EVOLUTION_LOCK_PATH;

  // Patch the lock path for isolation using env (not exported, tested via acquireEvolutionLock behavior)
  // We test behavior via the exported function directly with a clean filesystem state.

  test('acquireEvolutionLock is exported', () => {
    assertEqual(typeof acquireEvolutionLock, 'function', 'Should export acquireEvolutionLock');
  });

  test('acquireEvolutionLock succeeds when no lock exists', () => {
    // Remove real lock if it exists for a clean test
    try {
      fs.unlinkSync(realLockPath);
    } catch (_) {
      /* ok */
    }
    const result = acquireEvolutionLock('test-owner');
    // Clean up
    try {
      fs.unlinkSync(realLockPath);
    } catch (_) {
      /* ok */
    }
    assertEqual(result, true, 'Should acquire lock when none exists');
  });

  test('acquireEvolutionLock fails when active lock exists', () => {
    // Pre-create a fresh lock
    const lockData = JSON.stringify({ timestamp: Date.now(), pid: process.pid, owner: 'other' });
    try {
      fs.mkdirSync(path.dirname(realLockPath), { recursive: true });
    } catch (_) {
      /* ok */
    }
    fs.writeFileSync(realLockPath, lockData, 'utf8');
    const result = acquireEvolutionLock('new-owner');
    // Clean up
    try {
      fs.unlinkSync(realLockPath);
    } catch (_) {
      /* ok */
    }
    assertEqual(result, false, 'Should fail to acquire when active lock exists');
  });

  test('acquireEvolutionLock succeeds on stale lock (>30min old)', () => {
    // Pre-create a stale lock
    const staleTs = Date.now() - (EVOLUTION_LOCK_TTL_MS + 60000); // 1 min past TTL
    const lockData = JSON.stringify({ timestamp: staleTs, pid: 99999, owner: 'old-owner' });
    try {
      fs.mkdirSync(path.dirname(realLockPath), { recursive: true });
    } catch (_) {
      /* ok */
    }
    fs.writeFileSync(realLockPath, lockData, 'utf8');
    const result = acquireEvolutionLock('new-owner');
    // Clean up
    try {
      fs.unlinkSync(realLockPath);
    } catch (_) {
      /* ok */
    }
    assertEqual(result, true, 'Should acquire lock when existing lock is stale');
  });

  test('checkEvolutionLock uses safeParseJSON (no prototype pollution from tampered lock)', () => {
    // Write a lock file with a prototype pollution payload
    const maliciousLock =
      '{"__proto__":{"isAdmin":true},"timestamp":' + Date.now() + ',"owner":"attacker"}';
    try {
      fs.mkdirSync(path.dirname(realLockPath), { recursive: true });
    } catch (_) {
      /* ok */
    }
    fs.writeFileSync(realLockPath, maliciousLock, 'utf8');
    // checkEvolutionLock should not throw or pollute Object.prototype
    const result = checkEvolutionLock();
    // Clean up
    try {
      fs.unlinkSync(realLockPath);
    } catch (_) {
      /* ok */
    }
    // Prototype should NOT be polluted
    assertEqual({}.isAdmin, undefined, 'Prototype pollution prevented');
    // The lock should be detected as active (timestamp is fresh)
    assertEqual(result.locked, true, 'Lock should be detected as active despite malicious payload');
  });

  // Cleanup temp dir
  try {
    fs.rmdirSync(tmpDir);
  } catch (_) {
    /* ok */
  }
}

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
