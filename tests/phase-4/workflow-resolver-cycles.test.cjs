/**
 * Phase 4 / SPEC-018: Resolver and cycle detection tests
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { WorkflowResolver } = require('../../.claude/lib/workflow/workflow-resolver.cjs');
const { CycleDetector } = require('../../.claude/lib/workflow/cycle-detector.cjs');

describe('Phase 4: workflow resolver and cycle detection', () => {
  test('cycle detector throws on circular dependency', async () => {
    const detector = new CycleDetector();
    const registry = new Map();
    registry.set('a', { name: 'a', extends: 'b' });
    registry.set('b', { name: 'b', extends: 'c' });
    registry.set('c', { name: 'c', extends: 'a' });

    await assert.rejects(async () => detector.detectCycles(registry.get('a'), registry), {
      message: /Circular dependency detected/,
    });
  });

  test('cycle detector reports full cycle path', async () => {
    const detector = new CycleDetector();
    const registry = new Map();
    registry.set('x', { name: 'x', extends: 'y' });
    registry.set('y', { name: 'y', extends: 'x' });

    try {
      await detector.detectCycles(registry.get('x'), registry);
      assert.fail('expected throw');
    } catch (err) {
      assert.ok(err.message.includes('x'));
      assert.ok(err.message.includes('y'));
      assert.ok(err.message.includes(' -> '));
    }
  });

  test('cycle detector allows DAG', async () => {
    const detector = new CycleDetector();
    const registry = new Map();
    registry.set('a', { name: 'a' });
    registry.set('b', { name: 'b', extends: 'a' });
    registry.set('c', { name: 'c', extends: 'b' });

    await detector.detectCycles(registry.get('c'), registry);
  });

  test('cycle detector enforces max depth', async () => {
    const detector = new CycleDetector();
    const registry = new Map();
    registry.set('l0', { name: 'l0', extends: 'l1' });
    registry.set('l1', { name: 'l1', extends: 'l2' });
    registry.set('l2', { name: 'l2', extends: 'l3' });
    registry.set('l3', { name: 'l3', extends: 'l4' });
    registry.set('l4', { name: 'l4' });

    await assert.rejects(async () => detector.detectCycles(registry.get('l0'), registry, new Set(), { maxDepth: 3 }), {
      message: /depth exceeded/,
    });
  });

  test('resolver resolveWithCycleCheck runs cycle check then resolve', async () => {
    const registry = new Map();
    registry.set('ok', { name: 'ok', phases: [] });
    const resolver = new WorkflowResolver();
    const def = await resolver.resolveWithCycleCheck('ok', registry);
    assert.strictEqual(def.name, 'ok');
  });

  test('resolver resolveWithCycleCheck throws on cycle', async () => {
    const registry = new Map();
    registry.set('cycle', { name: 'cycle', extends: 'cycle' });
    const resolver = new WorkflowResolver();
    await assert.rejects(async () => resolver.resolveWithCycleCheck('cycle', registry), {
      message: /Circular dependency/,
    });
  });

  test('resolver clearCache clears cache', async () => {
    const registry = new Map();
    registry.set('k', { name: 'k' });
    const resolver = new WorkflowResolver();
    resolver.setRegistry(registry);
    await resolver.resolve('k');
    resolver.clearCache();
    assert.strictEqual(resolver.cache.size, 0);
  });
});
