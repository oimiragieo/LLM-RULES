'use strict';
const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');

// We'll test the engine module directly
const ENGINE_PATH = '../../../.claude/lib/guardrails/guardrail-engine.cjs';

function loadEngine() {
  delete require.cache[require.resolve(ENGINE_PATH)];
  return require(ENGINE_PATH);
}

describe('guardrail-engine', () => {
  test('exports expected functions', () => {
    const engine = loadEngine();
    assert.strictEqual(typeof engine.validateTaskOutput, 'function');
    assert.strictEqual(typeof engine.getCircuitState, 'function');
    assert.strictEqual(typeof engine.resetCircuit, 'function');
  });

  test('valid task output passes guardrail', () => {
    const engine = loadEngine();
    const result = engine.validateTaskOutput({
      summary: 'Implemented feature X',
      status: 'success',
      filesModified: ['src/x.js'],
    });
    assert.strictEqual(result.passed, true);
    assert.ok(Array.isArray(result.checks));
    assert.ok(result.checks.every(c => c.passed));
  });

  test('output missing summary fails guardrail', () => {
    const engine = loadEngine();
    const result = engine.validateTaskOutput({
      status: 'success',
      filesModified: [],
    });
    assert.strictEqual(result.passed, false);
    const failedCheck = result.checks.find(c => !c.passed);
    assert.ok(failedCheck, 'Should have a failing check');
    assert.ok(failedCheck.message.includes('summary'), 'Should mention summary');
  });

  test('output missing status fails guardrail', () => {
    const engine = loadEngine();
    const result = engine.validateTaskOutput({
      summary: 'Did work',
      filesModified: [],
    });
    assert.strictEqual(result.passed, false);
  });

  test('invalid status enum value fails guardrail', () => {
    const engine = loadEngine();
    const result = engine.validateTaskOutput({
      summary: 'Did work',
      status: 'invalid-status',
      filesModified: [],
    });
    assert.strictEqual(result.passed, false);
  });

  test('circuit breaker activates after 2 identical failures', () => {
    const engine = loadEngine();
    engine.resetCircuit('test-agent');

    // First failure
    engine.validateTaskOutput({ status: 'success' }, { agentType: 'test-agent' });
    assert.strictEqual(engine.getCircuitState('test-agent'), 'closed');

    // Second identical failure
    engine.validateTaskOutput({ status: 'success' }, { agentType: 'test-agent' });
    assert.strictEqual(engine.getCircuitState('test-agent'), 'open');
  });

  test('different errors do not trigger circuit breaker', () => {
    const engine = loadEngine();
    engine.resetCircuit('test-agent-2');

    // First failure: missing summary
    engine.validateTaskOutput(
      { status: 'success', filesModified: [] },
      { agentType: 'test-agent-2' }
    );

    // Second failure: missing status (different error)
    engine.validateTaskOutput(
      { summary: 'work', filesModified: [] },
      { agentType: 'test-agent-2' }
    );

    assert.strictEqual(engine.getCircuitState('test-agent-2'), 'closed');
  });

  test('result includes circuit breaker state', () => {
    const engine = loadEngine();
    engine.resetCircuit('test-agent-3');

    // Trigger circuit breaker
    engine.validateTaskOutput({ status: 'success' }, { agentType: 'test-agent-3' });
    const result = engine.validateTaskOutput({ status: 'success' }, { agentType: 'test-agent-3' });
    assert.strictEqual(result.circuitBreakerTripped, true);
  });

  test('null or undefined metadata returns failure gracefully', () => {
    const engine = loadEngine();
    const result = engine.validateTaskOutput(null);
    assert.strictEqual(result.passed, false);

    const result2 = engine.validateTaskOutput(undefined);
    assert.strictEqual(result2.passed, false);
  });

  test('additionalProperties are allowed (backward compat)', () => {
    const engine = loadEngine();
    const result = engine.validateTaskOutput({
      summary: 'Done',
      status: 'success',
      filesModified: [],
      customField: 'extra data',
      legacy: true,
    });
    assert.strictEqual(result.passed, true);
  });
});
