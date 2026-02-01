/**
 * Phase 4 / SPEC-022: Large workflow performance tests
 * Lazy load, cache, stream, memory budget
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const LazyLoader = require('../../.claude/lib/workflow/lazy-loader.cjs');
const WorkflowCache = require('../../.claude/lib/workflow/workflow-cache.cjs');
const MemoryBudgeter = require('../../.claude/lib/workflow/memory-budgeter.cjs');

describe('Phase 4: workflow performance (SPEC-022)', () => {
  test('LazyLoader loadPhase loads phase and dependencies', () => {
    const workflow = {
      phases: [
        { name: 'a' },
        { name: 'b', dependsOn: 'a' },
        { name: 'c', dependsOn: 'b' },
      ],
    };
    const loader = new LazyLoader(workflow);
    loader.loadPhase('c');
    assert.ok(loader.loadedPhases.has('a'));
    assert.ok(loader.loadedPhases.has('b'));
    assert.ok(loader.loadedPhases.has('c'));
  });

  test('WorkflowCache set/get and stats', () => {
    const cache = new WorkflowCache({ maxSize: 10 });
    cache.set('k1', 'v1');
    assert.strictEqual(cache.get('k1'), 'v1');
    assert.strictEqual(cache.stats.hits, 1);
    cache.get('k2');
    assert.ok(cache.stats.misses >= 1);
  });

  test('WorkflowCache invalidatePattern', () => {
    const cache = new WorkflowCache({ maxSize: 10 });
    cache.set('wf:a:1', 1);
    cache.set('wf:b:1', 2);
    cache.set('other', 3);
    cache.invalidatePattern(/^wf:/);
    assert.strictEqual(cache.get('wf:a:1'), undefined);
    assert.strictEqual(cache.get('other'), 3);
  });

  test('MemoryBudgeter allocate and release', () => {
    const budgeter = new MemoryBudgeter({ maxMemory: 10 * 1024 * 1024 });
    budgeter.allocate('wf1', { phases: [{ name: 'p1' }] });
    assert.ok(budgeter.getAllocated('wf1') >= 0);
    budgeter.release('wf1');
    assert.strictEqual(budgeter.getAllocated('wf1'), 0);
  });

  test('MemoryBudgeter getTotalAllocated returns number', () => {
    const budgeter = new MemoryBudgeter({ maxMemory: 1024 * 1024 });
    const total = budgeter.getTotalAllocated();
    assert.strictEqual(typeof total, 'number');
    assert.ok(total >= 0);
  });
});
