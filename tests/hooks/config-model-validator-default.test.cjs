#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const routingGuard = require('../../.claude/hooks/routing/routing-guard.cjs');
const originalConfigModelValidator = process.env.CONFIG_MODEL_VALIDATOR;

function restoreEnv() {
  if (originalConfigModelValidator === undefined) {
    delete process.env.CONFIG_MODEL_VALIDATOR;
  } else {
    process.env.CONFIG_MODEL_VALIDATOR = originalConfigModelValidator;
  }
}

test('checkConfigModelValidator defaults to block on model mismatch', () => {
  try {
    delete process.env.CONFIG_MODEL_VALIDATOR;

    const result = routingGuard.checkConfigModelValidator('Task', {
      prompt: 'You are zzzunknown',
      model: 'haiku',
    });

    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.result, 'block');
  } finally {
    restoreEnv();
  }
});

test('checkConfigModelValidator warns when explicitly configured to warn', () => {
  try {
    process.env.CONFIG_MODEL_VALIDATOR = 'warn';

    const result = routingGuard.checkConfigModelValidator('Task', {
      prompt: 'You are zzzunknown',
      model: 'haiku',
    });

    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.result, 'warn');
  } finally {
    restoreEnv();
  }
});

test('checkConfigModelValidator disables when set to off', () => {
  try {
    process.env.CONFIG_MODEL_VALIDATOR = 'off';

    const result = routingGuard.checkConfigModelValidator('Task', {
      prompt: 'You are zzzunknown',
      model: 'haiku',
    });

    assert.strictEqual(result.pass, true);
  } finally {
    restoreEnv();
  }
});

test('extractAgentTypeFromPrompt handles article form "You are a <agent>"', () => {
  const extracted = routingGuard.extractAgentTypeFromPrompt('You are a developer agent.');
  assert.strictEqual(extracted, 'developer');
});
