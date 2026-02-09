/**
 * SPEC-021: Legacy Code Integration Adapters - TDD Test Suite
 *
 * Tests for:
 * 1. Strangler Fig Pattern (gradual legacy replacement)
 * 2. Adapter Pattern (system abstraction)
 * 3. Interface Mapping (legacy ↔ new system translation)
 * 4. Error Resilience (legacy system failure handling)
 *
 * Total: 44 tests
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// ============================================================================
// Category 1: Strangler Fig Pattern (12 tests)
// ============================================================================

describe('SPEC-021: Category 1 - Strangler Fig Pattern', () => {
  let stranglerFig;

  beforeEach(() => {
    const StranglerFig = require('../.claude/lib/workflow/strangler-fig.cjs');
    stranglerFig = new StranglerFig();
  });

  it('1.1: Should intercept legacy system calls', async () => {
    const legacyFn = () => 'legacy-result';
    const newFn = () => 'new-result';

    stranglerFig.register('feature1', { legacyFn, newFn, percentage: 0 });

    const result = await stranglerFig.execute('feature1', []);
    assert.strictEqual(result, 'legacy-result', 'Should route to legacy when percentage=0');
  });

  it('1.2: Should route to new system when enabled', async () => {
    const legacyFn = () => 'legacy-result';
    const newFn = () => 'new-result';

    stranglerFig.register('feature2', { legacyFn, newFn, percentage: 100 });

    const result = await stranglerFig.execute('feature2', []);
    assert.strictEqual(result, 'new-result', 'Should route to new when percentage=100');
  });

  it('1.3: Should split traffic by percentage', async () => {
    const legacyFn = () => 'legacy';
    const newFn = () => 'new';

    stranglerFig.register('feature3', { legacyFn, newFn, percentage: 50 });

    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(await stranglerFig.execute('feature3', []));
    }

    const newCount = results.filter(r => r === 'new').length;
    assert.ok(newCount >= 30 && newCount <= 70, 'Should split ~50/50 (±20%)');
  });

  it('1.4: Should detect feature ownership (legacy vs new)', () => {
    stranglerFig.register('legacyFeature', { legacyFn: () => {}, newFn: () => {}, percentage: 0 });
    stranglerFig.register('newFeature', { legacyFn: () => {}, newFn: () => {}, percentage: 100 });

    assert.strictEqual(stranglerFig.getOwner('legacyFeature'), 'legacy');
    assert.strictEqual(stranglerFig.getOwner('newFeature'), 'new');
  });

  it('1.5: Should track migration progress (0% → 100%)', async () => {
    stranglerFig.register('feature', { legacyFn: () => {}, newFn: () => {}, percentage: 0 });

    assert.strictEqual(stranglerFig.getMigrationProgress('feature'), 0);

    await stranglerFig.setPercentage('feature', 50);
    assert.strictEqual(stranglerFig.getMigrationProgress('feature'), 50);

    await stranglerFig.setPercentage('feature', 100);
    assert.strictEqual(stranglerFig.getMigrationProgress('feature'), 100);
  });

  it('1.6: Should gradually ramp up new system (10% → 50% → 100%)', async () => {
    stranglerFig.register('feature', { legacyFn: () => {}, newFn: () => {}, percentage: 10 });

    await stranglerFig.rampUp('feature', 50, 100); // 100ms duration
    assert.strictEqual(stranglerFig.getMigrationProgress('feature'), 50);

    await stranglerFig.rampUp('feature', 100, 100);
    assert.strictEqual(stranglerFig.getMigrationProgress('feature'), 100);
  });

  it('1.7: Should rollback to legacy on error', async () => {
    const legacyFn = () => 'legacy';
    const newFn = () => {
      throw new Error('new system error');
    };

    stranglerFig.register('feature', { legacyFn, newFn, percentage: 100, fallbackOnError: true });

    const result = await stranglerFig.execute('feature', []);
    assert.strictEqual(result, 'legacy', 'Should fallback to legacy on new system error');
  });

  it('1.8: Should track feature flags', () => {
    stranglerFig.register('feature', {
      legacyFn: () => {},
      newFn: () => {},
      featureFlag: 'use-new-checkout',
    });

    assert.strictEqual(stranglerFig.getFeatureFlag('feature'), 'use-new-checkout');
  });

  it('1.9: Should list all registered features', () => {
    stranglerFig.register('feature1', { legacyFn: () => {}, newFn: () => {}, percentage: 0 });
    stranglerFig.register('feature2', { legacyFn: () => {}, newFn: () => {}, percentage: 100 });

    const features = stranglerFig.listFeatures();
    assert.strictEqual(features.length, 2);
    assert.ok(features.includes('feature1'));
    assert.ok(features.includes('feature2'));
  });

  it('1.10: Should deregister completed migrations', () => {
    stranglerFig.register('feature', { legacyFn: () => {}, newFn: () => {}, percentage: 100 });

    stranglerFig.deregister('feature');

    const features = stranglerFig.listFeatures();
    assert.strictEqual(features.length, 0);
  });

  it('1.11: Should collect metrics (legacy calls, new calls, fallbacks)', async () => {
    const legacyFn = () => 'legacy';
    const newFn = () => {
      throw new Error('error');
    };

    stranglerFig.register('feature', { legacyFn, newFn, percentage: 100, fallbackOnError: true });

    await stranglerFig.execute('feature', []);

    const metrics = stranglerFig.getMetrics('feature');
    assert.strictEqual(metrics.newCalls, 1);
    assert.strictEqual(metrics.fallbacks, 1);
  });

  it('1.12: Should support async legacy and new functions', async () => {
    const legacyFn = async () => 'legacy-async';
    const newFn = async () => 'new-async';

    stranglerFig.register('feature', { legacyFn, newFn, percentage: 100 });

    const result = await stranglerFig.execute('feature', []);
    assert.strictEqual(result, 'new-async');
  });
});

// ============================================================================
// Category 2: Adapter Pattern (12 tests)
// ============================================================================

describe('SPEC-021: Category 2 - Adapter Pattern', () => {
  let LegacyAdapter;
  let AdapterRegistry;

  beforeEach(() => {
    LegacyAdapter = require('../.claude/lib/workflow/legacy-adapter.cjs');
    AdapterRegistry = require('../.claude/lib/workflow/adapter-registry.cjs');
  });

  it('2.1: Should define adapter interface', () => {
    const adapter = new LegacyAdapter('conductor-main', '1.0.0');

    assert.strictEqual(typeof adapter.request, 'function');
    assert.strictEqual(typeof adapter.response, 'function');
    assert.strictEqual(typeof adapter.error, 'function');
  });

  it('2.2: Should create adapter for legacy system', () => {
    const adapter = new LegacyAdapter('conductor-main', '1.0.0');

    assert.strictEqual(adapter.getSystem(), 'conductor-main');
    assert.strictEqual(adapter.getVersion(), '1.0.0');
  });

  it('2.3: Should create adapter for new system', () => {
    const adapter = new LegacyAdapter('agent-studio', '2.0.0');

    assert.strictEqual(adapter.getSystem(), 'agent-studio');
    assert.strictEqual(adapter.getVersion(), '2.0.0');
  });

  it('2.4: Should transform request data (new → legacy format)', () => {
    const adapter = new LegacyAdapter('conductor-main', '1.0.0');

    const newRequest = { task: { id: '123', name: 'task1' } };
    const legacyRequest = adapter.request(newRequest);

    assert.ok(legacyRequest.taskId, 'Should map task.id to taskId');
    assert.strictEqual(legacyRequest.taskId, '123');
  });

  it('2.5: Should transform response data (legacy → new format)', () => {
    const adapter = new LegacyAdapter('conductor-main', '1.0.0');

    const legacyResponse = { taskId: '123', status: 'completed' };
    const newResponse = adapter.response(legacyResponse);

    assert.ok(newResponse.task, 'Should wrap in task object');
    assert.strictEqual(newResponse.task.id, '123');
  });

  it('2.6: Should chain adapters (legacy → intermediate → new)', () => {
    const conductorAdapter = new LegacyAdapter('conductor-main', '1.0.0');
    const intermediateAdapter = new LegacyAdapter('intermediate', '1.5.0');

    const originalRequest = { task: { id: '123' } };
    const step1 = conductorAdapter.request(originalRequest);
    const step2 = intermediateAdapter.request(step1);

    assert.ok(step2.id, 'Should chain transformations');
  });

  it('2.7: Should handle adapter errors gracefully', () => {
    const adapter = new LegacyAdapter('conductor-main', '1.0.0');

    const legacyError = { code: 404, message: 'Not found' };
    const standardError = adapter.error(legacyError);

    assert.strictEqual(standardError.status, 404);
    assert.strictEqual(standardError.message, 'Not found');
  });

  it('2.8: Should register adapter in registry', () => {
    const registry = new AdapterRegistry();
    const adapter = new LegacyAdapter('conductor-main', '1.0.0');

    registry.register('conductor-main', '1.0.0', adapter);

    const retrieved = registry.get('conductor-main', '1.0.0');
    assert.strictEqual(retrieved, adapter);
  });

  it('2.9: Should lookup adapter by system and version', () => {
    const registry = new AdapterRegistry();
    const adapter1 = new LegacyAdapter('conductor-main', '1.0.0');
    const adapter2 = new LegacyAdapter('conductor-main', '2.0.0');

    registry.register('conductor-main', '1.0.0', adapter1);
    registry.register('conductor-main', '2.0.0', adapter2);

    assert.strictEqual(registry.get('conductor-main', '1.0.0'), adapter1);
    assert.strictEqual(registry.get('conductor-main', '2.0.0'), adapter2);
  });

  it('2.10: Should fallback to compatible adapter version', () => {
    const registry = new AdapterRegistry();
    const adapter1_0 = new LegacyAdapter('conductor-main', '1.0.0');

    registry.register('conductor-main', '1.0.0', adapter1_0);

    // Request 1.0.5 should fallback to 1.0.0 (compatible)
    const fallback = registry.get('conductor-main', '1.0.5', { fallbackToCompatible: true });
    assert.strictEqual(fallback, adapter1_0);
  });

  it('2.11: Should manage adapter lifecycle (register, update, deregister)', () => {
    const registry = new AdapterRegistry();
    const adapter = new LegacyAdapter('conductor-main', '1.0.0');

    registry.register('conductor-main', '1.0.0', adapter);
    assert.ok(registry.get('conductor-main', '1.0.0'));

    registry.deregister('conductor-main', '1.0.0');
    assert.strictEqual(registry.get('conductor-main', '1.0.0'), null);
  });

  it('2.12: Should load adapters dynamically (lazy loading)', async () => {
    const registry = new AdapterRegistry();

    // Register factory function instead of instance
    registry.registerFactory(
      'conductor-main',
      '1.0.0',
      () => new LegacyAdapter('conductor-main', '1.0.0')
    );

    const adapter = await registry.load('conductor-main', '1.0.0');
    assert.ok(adapter instanceof LegacyAdapter);
  });
});

// ============================================================================
// Category 3: Interface Mapping (10 tests)
// ============================================================================

describe('SPEC-021: Category 3 - Interface Mapping', () => {
  let InterfaceMapper;

  beforeEach(() => {
    InterfaceMapper = require('../.claude/lib/workflow/interface-mapper.cjs');
  });

  it('3.1: Should map API contract (legacy → new)', () => {
    const mapper = new InterfaceMapper();

    mapper.addMapping('createTask', {
      from: { taskId: 'string', taskName: 'string' },
      to: { task: { id: 'string', name: 'string' } },
    });

    const legacyData = { taskId: '123', taskName: 'task1' };
    const newData = mapper.map('createTask', legacyData);

    assert.deepStrictEqual(newData, { task: { id: '123', name: 'task1' } });
  });

  it('3.2: Should transform data structures (flat → nested)', () => {
    const mapper = new InterfaceMapper();

    mapper.addMapping('user', {
      from: { userId: 'string', userName: 'string', userEmail: 'string' },
      to: { user: { id: 'string', profile: { name: 'string', email: 'string' } } },
    });

    const flat = { userId: '1', userName: 'Alice', userEmail: 'alice@example.com' };
    const nested = mapper.map('user', flat);

    assert.deepStrictEqual(nested, {
      user: { id: '1', profile: { name: 'Alice', email: 'alice@example.com' } },
    });
  });

  it('3.3: Should transform data structures (nested → flat)', () => {
    const mapper = new InterfaceMapper();

    mapper.addMapping('userReverse', {
      from: { user: { id: 'string', profile: { name: 'string' } } },
      to: { userId: 'string', userName: 'string' },
    });

    const nested = { user: { id: '1', profile: { name: 'Alice' } } };
    const flat = mapper.map('userReverse', nested);

    assert.deepStrictEqual(flat, { userId: '1', userName: 'Alice' });
  });

  it('3.4: Should translate method calls (legacy method → new method)', () => {
    const mapper = new InterfaceMapper();

    mapper.addMethodMapping('getTaskById', 'fetchTask');

    const newMethod = mapper.mapMethod('getTaskById');
    assert.strictEqual(newMethod, 'fetchTask');
  });

  it('3.5: Should map error codes (legacy errors → standard errors)', () => {
    const mapper = new InterfaceMapper();

    mapper.addErrorMapping(404, { status: 404, code: 'NOT_FOUND' });
    mapper.addErrorMapping(500, { status: 500, code: 'INTERNAL_ERROR' });

    const standardError = mapper.mapError(404);
    assert.deepStrictEqual(standardError, { status: 404, code: 'NOT_FOUND' });
  });

  it('3.6: Should handle missing mappings gracefully', () => {
    const mapper = new InterfaceMapper();

    const result = mapper.map('unknownMapping', { data: 'test' });
    assert.deepStrictEqual(result, { data: 'test' }, 'Should return original data if no mapping');
  });

  it('3.7: Should support custom transformation functions', () => {
    const mapper = new InterfaceMapper();

    mapper.addMapping('timestamp', {
      from: { createdAt: 'string' },
      to: { timestamp: 'number' },
      transform: data => ({ timestamp: new Date(data.createdAt).getTime() }),
    });

    const result = mapper.map('timestamp', { createdAt: '2026-01-30T10:00:00Z' });
    assert.ok(typeof result.timestamp === 'number');
  });

  it('3.8: Should validate mapped data against schema', () => {
    const mapper = new InterfaceMapper();

    mapper.addMapping('validateTask', {
      from: { taskId: 'string' },
      to: { task: { id: 'string' } },
      schema: { task: { id: { type: 'string', required: true } } },
    });

    const result = mapper.map('validateTask', { taskId: '123' });
    assert.ok(result.task.id, 'Should validate successfully');

    assert.throws(() => {
      mapper.map('validateTask', { wrongField: 'value' });
    }, /validation/i);
  });

  it('3.9: Should support bidirectional mapping (legacy ↔ new)', () => {
    const mapper = new InterfaceMapper();

    mapper.addMapping('task', {
      from: { taskId: 'string' },
      to: { task: { id: 'string' } },
    });

    const forward = mapper.map('task', { taskId: '123' });
    assert.deepStrictEqual(forward, { task: { id: '123' } });

    const reverse = mapper.mapReverse('task', { task: { id: '123' } });
    assert.deepStrictEqual(reverse, { taskId: '123' });
  });

  it('3.10: Should handle array transformations', () => {
    const mapper = new InterfaceMapper();

    mapper.addMapping('taskList', {
      from: { tasks: [{ taskId: 'string' }] },
      to: { items: [{ task: { id: 'string' } }] },
    });

    const legacy = { tasks: [{ taskId: '1' }, { taskId: '2' }] };
    const newFormat = mapper.map('taskList', legacy);

    assert.strictEqual(newFormat.items.length, 2);
    assert.strictEqual(newFormat.items[0].task.id, '1');
  });
});

// ============================================================================
// Category 4: Error Resilience (10 tests)
// ============================================================================

describe('SPEC-021: Category 4 - Error Resilience', () => {
  let StranglerFig;
  let LegacyAdapter;

  beforeEach(() => {
    StranglerFig = require('../.claude/lib/workflow/strangler-fig.cjs');
    LegacyAdapter = require('../.claude/lib/workflow/legacy-adapter.cjs');
  });

  it('4.1: Should handle legacy system failure', async () => {
    const stranglerFig = new StranglerFig();
    const legacyFn = () => {
      throw new Error('Legacy system down');
    };
    const newFn = () => 'new-result';

    stranglerFig.register('feature', { legacyFn, newFn, percentage: 0, fallbackToNew: true });

    const result = await stranglerFig.execute('feature', []);
    assert.strictEqual(result, 'new-result', 'Should fallback to new on legacy failure');
  });

  it('4.2: Should fallback to legacy on new system failure', async () => {
    const stranglerFig = new StranglerFig();
    const legacyFn = () => 'legacy-result';
    const newFn = () => {
      throw new Error('New system error');
    };

    stranglerFig.register('feature', { legacyFn, newFn, percentage: 100, fallbackOnError: true });

    const result = await stranglerFig.execute('feature', []);
    assert.strictEqual(result, 'legacy-result', 'Should fallback to legacy on new failure');
  });

  it('4.3: Should retry failed calls (3 retries with exponential backoff)', async () => {
    const stranglerFig = new StranglerFig();
    let attempts = 0;
    const flakeyFn = () => {
      attempts++;
      if (attempts < 3) throw new Error('Transient error');
      return 'success';
    };

    stranglerFig.register('feature', {
      legacyFn: flakeyFn,
      newFn: () => {},
      percentage: 0,
      retryConfig: { maxRetries: 3, backoff: 'exponential' },
    });

    const result = await stranglerFig.execute('feature', []);
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  it('4.4: Should circuit break after consecutive failures', async () => {
    const stranglerFig = new StranglerFig();
    const failingFn = () => {
      throw new Error('System down');
    };

    stranglerFig.register('feature', {
      legacyFn: failingFn,
      newFn: () => 'new',
      percentage: 0,
      circuitBreaker: { threshold: 3, timeout: 5000 },
    });

    // Trigger circuit breaker
    for (let i = 0; i < 3; i++) {
      try {
        await stranglerFig.execute('feature', []);
      } catch (_error) {
        // Expected
      }
    }

    // Should now open circuit and fallback
    const result = await stranglerFig.execute('feature', []);
    assert.strictEqual(result, 'new', 'Should use new system after circuit opens');
  });

  it('4.5: Should log errors for monitoring', async () => {
    const stranglerFig = new StranglerFig();
    const errors = [];
    const legacyFn = () => {
      throw new Error('Legacy error');
    };

    stranglerFig.register('feature', {
      legacyFn,
      newFn: () => 'new',
      percentage: 0,
      fallbackToNew: true,
      onError: error => errors.push(error),
    });

    await stranglerFig.execute('feature', []);
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].message, 'Legacy error');
  });

  it('4.6: Should recover from partial failures (some adapters fail)', async () => {
    const adapter = new LegacyAdapter('conductor-main', '1.0.0');

    // Simulate partial adapter failure
    const originalRequest = adapter.request;
    adapter.request = data => {
      if (!data) throw new Error('Invalid request');
      return originalRequest.call(adapter, data);
    };

    assert.throws(() => adapter.request(null));

    const result = adapter.request({ task: { id: '123' } });
    assert.ok(result, 'Should recover from partial failure');
  });

  it('4.7: Should timeout long-running legacy calls', async () => {
    const stranglerFig = new StranglerFig();
    const slowFn = () => new Promise(resolve => setTimeout(() => resolve('slow'), 10000));

    stranglerFig.register('feature', {
      legacyFn: slowFn,
      newFn: () => 'new',
      percentage: 0,
      timeout: 100,
      fallbackToNew: true,
    });

    const startTime = Date.now();
    const result = await stranglerFig.execute('feature', []);
    const duration = Date.now() - startTime;

    assert.strictEqual(result, 'new', 'Should fallback after timeout');
    assert.ok(duration < 200, 'Should timeout quickly');
  });

  it('4.8: Should provide degraded service on both systems failing', async () => {
    const stranglerFig = new StranglerFig();
    const failingLegacy = () => {
      throw new Error('Legacy down');
    };
    const failingNew = () => {
      throw new Error('New down');
    };

    stranglerFig.register('feature', {
      legacyFn: failingLegacy,
      newFn: failingNew,
      percentage: 100,
      fallbackOnError: true,
      degradedFn: () => ({ status: 'degraded', message: 'Limited functionality' }),
    });

    const result = await stranglerFig.execute('feature', []);
    assert.strictEqual(result.status, 'degraded');
  });

  it('4.9: Should collect error metrics (error rate, error types)', async () => {
    const stranglerFig = new StranglerFig();
    const legacyFn = () => {
      throw new Error('Error 1');
    };

    stranglerFig.register('feature', {
      legacyFn,
      newFn: () => 'new',
      percentage: 0,
      fallbackToNew: true,
    });

    await stranglerFig.execute('feature', []);

    const metrics = stranglerFig.getMetrics('feature');
    assert.strictEqual(metrics.errors, 1);
    assert.ok(Array.isArray(metrics.errorTypes));
  });

  it('4.10: Should validate responses before returning', async () => {
    const stranglerFig = new StranglerFig();
    const invalidFn = () => ({ invalidField: 'value' });

    stranglerFig.register('feature', {
      legacyFn: invalidFn,
      newFn: () => ({ validField: 'value' }),
      percentage: 0,
      fallbackToNew: true,
      responseSchema: { validField: { type: 'string', required: true } },
    });

    const result = await stranglerFig.execute('feature', []);
    assert.ok(result.validField, 'Should fallback if response invalid');
  });
});
