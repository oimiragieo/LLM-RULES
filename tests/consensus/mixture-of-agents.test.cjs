'use strict';

/**
 * Tests for Mixture-of-Agents consensus tool
 * Covers VAL-IR-006 and VAL-IR-007
 */

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const path = require('node:path');

const { runConsensus } = require(
  path.join(__dirname, '../../.claude/lib/consensus/mixture-of-agents.cjs')
);

// ---------------------------------------------------------------------------
// Mock dispatchers for testability
// ---------------------------------------------------------------------------

/**
 * Creates a dispatcher that resolves all model calls with a canned response.
 */
function makeSuccessDispatcher(responseTemplate = 'Response from {model}') {
  return async function dispatcher(model, _prompt) {
    return responseTemplate.replace('{model}', model);
  };
}

/**
 * Creates a dispatcher where a specific model rejects with an error.
 */
function makePartialFailDispatcher(failModel, failError = new Error('model timeout')) {
  return async function dispatcher(model, _prompt) {
    if (model === failModel) {
      throw failError;
    }
    return `Response from ${model}`;
  };
}

/**
 * Creates a dispatcher that rejects all model calls.
 */
function makeAllFailDispatcher(errorMsg = 'all models failed') {
  return async function dispatcher(_model, _prompt) {
    throw new Error(errorMsg);
  };
}

// ---------------------------------------------------------------------------
// Test suite: VAL-IR-006 — full success path
// ---------------------------------------------------------------------------

describe('runConsensus() — full success (VAL-IR-006)', () => {
  it('returns responses.length === N and non-empty consensus when all models succeed', async () => {
    const models = ['model-a', 'model-b', 'model-c'];
    const dispatcher = makeSuccessDispatcher();

    const result = await runConsensus('What is 2+2?', models, { dispatcher });

    assert.ok(typeof result === 'object' && result !== null, 'result should be an object');
    assert.ok('consensus' in result, 'result must have consensus field');
    assert.ok('responses' in result, 'result must have responses field');
    assert.ok('errors' in result, 'result must have errors field');

    assert.strictEqual(result.responses.length, 3, 'responses.length should equal N (3)');
    assert.strictEqual(result.errors.length, 0, 'errors array should be empty on full success');
    assert.ok(
      typeof result.consensus === 'string' && result.consensus.length > 0,
      'consensus should be a non-empty string'
    );
  });

  it('each response entry has model and response fields', async () => {
    const models = ['model-a', 'model-b'];
    const dispatcher = makeSuccessDispatcher('answer from {model}');

    const result = await runConsensus('test prompt', models, { dispatcher });

    for (const entry of result.responses) {
      assert.ok('model' in entry, 'each response entry must have model field');
      assert.ok('response' in entry, 'each response entry must have response field');
      assert.ok(
        models.includes(entry.model),
        `model field "${entry.model}" must be one of the input models`
      );
      assert.ok(
        typeof entry.response === 'string' && entry.response.length > 0,
        'response field must be a non-empty string'
      );
    }
  });

  it('dispatches the prompt to all N models', async () => {
    const models = ['m1', 'm2', 'm3'];
    const called = [];
    const dispatcher = async (model, prompt) => {
      called.push({ model, prompt });
      return `ok from ${model}`;
    };

    await runConsensus('hello', models, { dispatcher });

    assert.strictEqual(called.length, 3, 'dispatcher should be called once per model');
    assert.deepEqual(
      called.map(c => c.model).sort(),
      ['m1', 'm2', 'm3'],
      'dispatcher should be called with each model'
    );
    assert.ok(
      called.every(c => c.prompt === 'hello'),
      'dispatcher should receive the original prompt for each model'
    );
  });

  it('fans out concurrently using Promise.allSettled (single model works too)', async () => {
    const models = ['only-model'];
    const dispatcher = makeSuccessDispatcher('solo answer');

    const result = await runConsensus('solo prompt', models, { dispatcher });

    assert.strictEqual(result.responses.length, 1);
    assert.strictEqual(result.errors.length, 0);
    assert.ok(result.consensus && result.consensus.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Test suite: VAL-IR-007 — partial failure path
// ---------------------------------------------------------------------------

describe('runConsensus() — partial model failure (VAL-IR-007)', () => {
  it('produces consensus from remaining models when one of N fails', async () => {
    const models = ['model-a', 'model-b', 'model-c'];
    const dispatcher = makePartialFailDispatcher('model-b');

    const result = await runConsensus('test query', models, { dispatcher });

    assert.strictEqual(result.responses.length, 2, 'responses should contain 2 successful entries');
    assert.strictEqual(result.errors.length, 1, 'errors should contain 1 failed model entry');
    assert.ok(
      typeof result.consensus === 'string' && result.consensus.length > 0,
      'consensus should still be non-empty even with one failure'
    );
  });

  it('errors array contains the failed model identifier', async () => {
    const models = ['model-a', 'model-b', 'model-c'];
    const dispatcher = makePartialFailDispatcher('model-b', new Error('timeout'));

    const result = await runConsensus('query', models, { dispatcher });

    assert.strictEqual(result.errors.length, 1);
    const err = result.errors[0];
    assert.ok('model' in err, 'error entry must have model field');
    assert.ok('error' in err, 'error entry must have error field');
    assert.strictEqual(err.model, 'model-b', 'error.model must be the failing model id');
  });

  it('successful responses exclude the failed model', async () => {
    const models = ['alpha', 'beta', 'gamma'];
    const dispatcher = makePartialFailDispatcher('beta');

    const result = await runConsensus('prompt', models, { dispatcher });

    const modelNames = result.responses.map(r => r.model);
    assert.ok(modelNames.includes('alpha'), 'alpha should be in responses');
    assert.ok(modelNames.includes('gamma'), 'gamma should be in responses');
    assert.ok(!modelNames.includes('beta'), 'beta should NOT be in responses');
  });

  it('handles multiple failures — consensus from 1 of 3 models', async () => {
    const models = ['ok-model', 'fail-1', 'fail-2'];
    const dispatcher = async (model, _prompt) => {
      if (model !== 'ok-model') throw new Error(`${model} failed`);
      return 'sole survivor response';
    };

    const result = await runConsensus('prompt', models, { dispatcher });

    assert.strictEqual(result.responses.length, 1, 'should have exactly 1 successful response');
    assert.strictEqual(result.errors.length, 2, 'should have 2 errors');
    assert.ok(
      result.consensus && result.consensus.length > 0,
      'consensus must still be produced from the 1 success'
    );
  });
});

// ---------------------------------------------------------------------------
// Test suite: all models fail
// ---------------------------------------------------------------------------

describe('runConsensus() — all models fail', () => {
  it('returns consensus: null when all models fail', async () => {
    const models = ['model-x', 'model-y', 'model-z'];
    const dispatcher = makeAllFailDispatcher('network error');

    const result = await runConsensus('failing prompt', models, { dispatcher });

    assert.strictEqual(result.consensus, null, 'consensus must be null when all models fail');
    assert.strictEqual(result.responses.length, 0, 'responses must be empty');
    assert.strictEqual(result.errors.length, 3, 'all 3 models should appear in errors');
  });

  it('each error entry records the model identifier', async () => {
    const models = ['m1', 'm2'];
    const dispatcher = makeAllFailDispatcher();

    const result = await runConsensus('prompt', models, { dispatcher });

    const errorModels = result.errors.map(e => e.model).sort();
    assert.deepEqual(errorModels, ['m1', 'm2']);
  });
});

// ---------------------------------------------------------------------------
// Test suite: options passthrough and defaults
// ---------------------------------------------------------------------------

describe('runConsensus() — options', () => {
  it('works without explicit options object (uses defaults)', async () => {
    // Without a dispatcher, the default dispatcher should throw for each model,
    // resulting in all-fail scenario with consensus: null
    const models = ['m1'];

    // No dispatcher injected — default dispatcher rejects
    const result = await runConsensus('prompt', models);

    // Default dispatcher has no real backend, so all models fail
    assert.strictEqual(result.consensus, null);
    assert.strictEqual(result.errors.length, 1);
  });

  it('accepts a custom synthesize function via options', async () => {
    const models = ['model-a', 'model-b'];
    const dispatcher = makeSuccessDispatcher('ans:{model}');
    const synthesize = responses => `CUSTOM:${responses.map(r => r.response).join('|')}`;

    const result = await runConsensus('q', models, { dispatcher, synthesize });

    assert.ok(result.consensus.startsWith('CUSTOM:'), 'custom synthesizer should be used');
  });
});
