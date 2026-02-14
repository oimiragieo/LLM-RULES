#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const GUARD_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'reflection',
  'reflection-step0-guard.cjs'
);

function loadGuardWithEnv(overrides = {}) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  delete require.cache[require.resolve(GUARD_PATH)];
  const guard = require(GUARD_PATH);
  return {
    guard,
    restore: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      delete require.cache[require.resolve(GUARD_PATH)];
    },
  };
}

test('resolveEffectiveEnforcementMode keeps block before repeat threshold', () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_REPEAT_THRESHOLD: '3',
    REFLECTION_STEP0_LOOP_BREAKER_MODE: 'warn',
  });
  try {
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 2), 'block');
  } finally {
    restore();
  }
});

test('resolveEffectiveEnforcementMode degrades repeated block to warn', () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_REPEAT_THRESHOLD: '2',
    REFLECTION_STEP0_LOOP_BREAKER_MODE: 'warn',
  });
  try {
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 2), 'warn');
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 6), 'warn');
  } finally {
    restore();
  }
});

test('resolveEffectiveEnforcementMode respects loop-breaker off', () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_REPEAT_THRESHOLD: '2',
    REFLECTION_STEP0_LOOP_BREAKER_MODE: 'off',
  });
  try {
    assert.equal(guard.resolveEffectiveEnforcementMode('block', 8), 'block');
  } finally {
    restore();
  }
});

test('emitEventWithTimeout fails closed on timeout without throwing', async () => {
  const { guard, restore } = loadGuardWithEnv({
    REFLECTION_STEP0_EVENT_TIMEOUT_MS: '20',
  });
  try {
    guard.__setEventBus({
      emit: () =>
        new Promise(resolve => {
          setTimeout(resolve, 100);
        }),
    });

    const started = Date.now();
    const result = await guard.emitEventWithTimeout('TEST_EVENT', { ok: true });
    const elapsed = Date.now() - started;

    assert.equal(result.emitted, false);
    assert.match(result.reason, /event_emit_timeout/);
    assert.ok(elapsed < 90);
  } finally {
    restore();
  }
});
