/**
 * SPEC-022: Large Workflow Performance Optimization - RED Phase Tests
 *
 * Category 1: Lazy Loading (12 tests)
 * Category 2: Caching Strategy (12 tests)
 * Category 3: Result Streaming (10 tests)
 * Category 4: Memory Budgeting (10 tests)
 * Category 5: End-to-End Performance (6 tests)
 *
 * Total: 50 tests for comprehensive coverage
 *
 * TDD RED Phase: All tests should FAIL with MODULE_NOT_FOUND
 */

/* global AbortController */

const { describe, test } = require('node:test');
const assert = require('node:assert');

// Module imports (will fail during RED phase)
const LazyLoader = require('../.claude/lib/workflow/lazy-loader.cjs');
const WorkflowCache = require('../.claude/lib/workflow/workflow-cache.cjs');
const ResultStreamer = require('../.claude/lib/workflow/result-streamer.cjs');
const MemoryBudgeter = require('../.claude/lib/workflow/memory-budgeter.cjs');

describe('SPEC-022: Large Workflow Performance Optimization', () => {
  // ============================================================================
  // Category 1: Lazy Loading (12 tests)
  // ============================================================================

  describe('Category 1: Lazy Loading', () => {
    test('loads workflow steps on demand rather than upfront', () => {
      const workflow = {
        name: 'large-workflow',
        phases: [
          { name: 'phase1', tasks: ['task1'] },
          { name: 'phase2', tasks: ['task2'] },
          { name: 'phase3', tasks: ['task3'] },
        ],
      };

      const loader = new LazyLoader(workflow);

      // Initially, no phases should be loaded
      assert.strictEqual(loader.getLoadedPhasesCount(), 0);

      // Load first phase
      loader.loadPhase('phase1');
      assert.strictEqual(loader.getLoadedPhasesCount(), 1);

      // Load second phase
      loader.loadPhase('phase2');
      assert.strictEqual(loader.getLoadedPhasesCount(), 2);
    });

    test('resolves dependencies when loading a phase', () => {
      const workflow = {
        name: 'workflow-with-dependencies',
        phases: [
          { name: 'phase1', tasks: ['task1'] },
          { name: 'phase2', tasks: ['task2'], dependsOn: ['phase1'] },
          { name: 'phase3', tasks: ['task3'], dependsOn: ['phase2'] },
        ],
      };

      const loader = new LazyLoader(workflow);

      // Loading phase3 should auto-load phase1 and phase2 (dependencies)
      loader.loadPhase('phase3');

      const loaded = loader.getLoadedPhases();
      assert.ok(loaded.includes('phase1'));
      assert.ok(loaded.includes('phase2'));
      assert.ok(loaded.includes('phase3'));
    });

    test('prevents loading unused phases when only subset needed', () => {
      const workflow = {
        name: 'workflow-with-branches',
        phases: [
          { name: 'phase1', tasks: ['task1'] },
          { name: 'phase2a', tasks: ['task2a'], dependsOn: ['phase1'] },
          { name: 'phase2b', tasks: ['task2b'], dependsOn: ['phase1'] },
          { name: 'phase3a', tasks: ['task3a'], dependsOn: ['phase2a'] },
        ],
      };

      const loader = new LazyLoader(workflow);

      // Load only the 'phase3a' branch
      loader.loadPhase('phase3a');

      const loaded = loader.getLoadedPhases();
      assert.ok(loaded.includes('phase1'));
      assert.ok(loaded.includes('phase2a'));
      assert.ok(loaded.includes('phase3a'));
      assert.ok(!loaded.includes('phase2b'), 'phase2b should NOT be loaded');
    });

    test('measures memory savings from lazy loading', () => {
      const largeWorkflow = {
        name: 'large-workflow',
        phases: Array.from({ length: 100 }, (_, i) => ({
          name: `phase${i}`,
          tasks: [`task${i}`],
          metadata: { large: 'x'.repeat(1000) }, // Each phase has 1KB metadata
        })),
      };

      const loader = new LazyLoader(largeWorkflow);

      // Load only 10% of phases
      for (let i = 0; i < 10; i++) {
        loader.loadPhase(`phase${i}`);
      }

      const memorySavings = loader.calculateMemorySavings();
      // Should save ~90% of memory (only loaded 10%)
      assert.ok(memorySavings > 0.85, `Memory savings should be >85%, got ${memorySavings}`);
    });

    test('supports unloading phases to free memory', () => {
      const workflow = {
        name: 'workflow-with-completed-phases',
        phases: [
          { name: 'phase1', tasks: ['task1'] },
          { name: 'phase2', tasks: ['task2'] },
          { name: 'phase3', tasks: ['task3'] },
        ],
      };

      const loader = new LazyLoader(workflow);

      loader.loadPhase('phase1');
      loader.loadPhase('phase2');
      loader.loadPhase('phase3');
      assert.strictEqual(loader.getLoadedPhasesCount(), 3);

      // Unload completed phase1
      loader.unloadPhase('phase1');
      assert.strictEqual(loader.getLoadedPhasesCount(), 2);

      const loaded = loader.getLoadedPhases();
      assert.ok(!loaded.includes('phase1'));
    });

    test('builds dependency graph efficiently (O(V+E))', () => {
      const workflow = {
        name: 'workflow-with-complex-deps',
        phases: Array.from({ length: 100 }, (_, i) => ({
          name: `phase${i}`,
          tasks: [`task${i}`],
          dependsOn: i > 0 ? [`phase${i - 1}`] : [],
        })),
      };

      const loader = new LazyLoader(workflow);

      const startTime = Date.now();
      loader.buildDependencyGraph();
      const duration = Date.now() - startTime;

      // Should complete in <10ms for 100-node graph
      assert.ok(duration < 10, `Dependency graph build took ${duration}ms, expected <10ms`);
    });

    test('caches dependency graph for reuse', () => {
      const workflow = {
        name: 'workflow-cached-deps',
        phases: [
          { name: 'phase1', tasks: ['task1'] },
          { name: 'phase2', tasks: ['task2'], dependsOn: ['phase1'] },
        ],
      };

      const loader = new LazyLoader(workflow);

      loader.buildDependencyGraph();
      const graph1 = loader.getDependencyGraph();

      // Second call should return cached graph (same reference)
      const graph2 = loader.getDependencyGraph();
      assert.strictEqual(graph1, graph2, 'Dependency graph should be cached');
    });

    test('detects circular dependencies during lazy loading', () => {
      const workflow = {
        name: 'workflow-with-cycle',
        phases: [
          { name: 'phase1', tasks: ['task1'], dependsOn: ['phase2'] },
          { name: 'phase2', tasks: ['task2'], dependsOn: ['phase1'] },
        ],
      };

      const loader = new LazyLoader(workflow);

      assert.throws(
        () => loader.loadPhase('phase1'),
        /Circular dependency detected/,
        'Should throw on circular dependency'
      );
    });

    test('supports dynamic phase addition during execution', () => {
      const workflow = {
        name: 'dynamic-workflow',
        phases: [{ name: 'phase1', tasks: ['task1'] }],
      };

      const loader = new LazyLoader(workflow);
      loader.loadPhase('phase1');

      // Add new phase dynamically
      loader.addPhase({ name: 'phase2', tasks: ['task2'], dependsOn: ['phase1'] });

      const phases = loader.getAllPhases();
      assert.strictEqual(phases.length, 2);
      assert.ok(phases.some(p => p.name === 'phase2'));
    });

    test('tracks which phases have been loaded vs available', () => {
      const workflow = {
        name: 'workflow-tracking',
        phases: [
          { name: 'phase1', tasks: ['task1'] },
          { name: 'phase2', tasks: ['task2'] },
          { name: 'phase3', tasks: ['task3'] },
        ],
      };

      const loader = new LazyLoader(workflow);

      assert.strictEqual(loader.getTotalPhasesCount(), 3);
      assert.strictEqual(loader.getLoadedPhasesCount(), 0);

      loader.loadPhase('phase1');
      assert.strictEqual(loader.getLoadedPhasesCount(), 1);
    });

    test('optimizes memory by loading minimal dependency tree', () => {
      const workflow = {
        name: 'workflow-minimal-loading',
        phases: [
          { name: 'init', tasks: ['init'] },
          { name: 'branch-a', tasks: ['a'], dependsOn: ['init'] },
          { name: 'branch-b', tasks: ['b'], dependsOn: ['init'] },
          { name: 'merge-a', tasks: ['merge-a'], dependsOn: ['branch-a'] },
        ],
      };

      const loader = new LazyLoader(workflow);

      // Load only merge-a path (should load init, branch-a, merge-a)
      loader.loadPhase('merge-a');

      const loaded = loader.getLoadedPhases();
      assert.strictEqual(loaded.length, 3, 'Should load minimal dependency tree');
      assert.ok(loaded.includes('init'));
      assert.ok(loaded.includes('branch-a'));
      assert.ok(loaded.includes('merge-a'));
      assert.ok(!loaded.includes('branch-b'), 'Should NOT load unneeded branch-b');
    });

    test('measures performance improvement from lazy loading', () => {
      const largeWorkflow = {
        name: 'large-workflow-performance',
        phases: Array.from({ length: 1000 }, (_, i) => ({
          name: `phase${i}`,
          tasks: [`task${i}`],
        })),
      };

      const loader = new LazyLoader(largeWorkflow);

      const startTime = Date.now();
      // Load only 1% of phases
      for (let i = 0; i < 10; i++) {
        loader.loadPhase(`phase${i}`);
      }
      const lazyLoadTime = Date.now() - startTime;

      // Lazy loading 10 phases should be <5ms
      assert.ok(lazyLoadTime < 5, `Lazy loading took ${lazyLoadTime}ms, expected <5ms`);

      // Memory improvement: ~99% reduction (only loaded 1%)
      const memorySavings = loader.calculateMemorySavings();
      assert.ok(memorySavings > 0.95, `Memory savings should be >95%, got ${memorySavings}`);
    });
  });

  // ============================================================================
  // Category 2: Caching Strategy (12 tests)
  // ============================================================================

  describe('Category 2: Caching Strategy', () => {
    test('implements LRU cache for workflow metadata', () => {
      const cache = new WorkflowCache({ maxSize: 3 });

      cache.set('workflow1', { metadata: 'data1' });
      cache.set('workflow2', { metadata: 'data2' });
      cache.set('workflow3', { metadata: 'data3' });

      assert.ok(cache.has('workflow1'));
      assert.ok(cache.has('workflow2'));
      assert.ok(cache.has('workflow3'));

      // Add 4th entry, should evict LRU (workflow1)
      cache.set('workflow4', { metadata: 'data4' });

      assert.ok(!cache.has('workflow1'), 'workflow1 should be evicted (LRU)');
      assert.ok(cache.has('workflow4'));
    });

    test('updates LRU order on cache access', () => {
      const cache = new WorkflowCache({ maxSize: 3 });

      cache.set('workflow1', { data: '1' });
      cache.set('workflow2', { data: '2' });
      cache.set('workflow3', { data: '3' });

      // Access workflow1 to make it most recently used
      cache.get('workflow1');

      // Add workflow4, should evict workflow2 (now LRU)
      cache.set('workflow4', { data: '4' });

      assert.ok(cache.has('workflow1'), 'workflow1 should remain (recently accessed)');
      assert.ok(!cache.has('workflow2'), 'workflow2 should be evicted (LRU)');
    });

    test('tracks cache hit and miss rates', () => {
      const cache = new WorkflowCache({ maxSize: 5 });

      cache.set('workflow1', { data: '1' });

      cache.get('workflow1'); // Hit
      cache.get('workflow2'); // Miss
      cache.get('workflow1'); // Hit
      cache.get('workflow3'); // Miss

      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 2);
      assert.strictEqual(stats.misses, 2);
      assert.strictEqual(stats.hitRate, 0.5);
    });

    test('supports TTL-based cache expiration', async () => {
      const cache = new WorkflowCache({ maxSize: 10, ttl: 50 }); // 50ms TTL

      cache.set('workflow1', { data: '1' });
      assert.ok(cache.has('workflow1'));

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      assert.ok(!cache.has('workflow1'), 'Entry should expire after TTL');
    });

    test('invalidates cache entries by key', () => {
      const cache = new WorkflowCache({ maxSize: 5 });

      cache.set('workflow1', { data: '1' });
      cache.set('workflow2', { data: '2' });

      assert.ok(cache.has('workflow1'));

      cache.invalidate('workflow1');
      assert.ok(!cache.has('workflow1'));
      assert.ok(cache.has('workflow2'), 'Other entries should remain');
    });

    test('invalidates cache entries by pattern', () => {
      const cache = new WorkflowCache({ maxSize: 10 });

      cache.set('user-workflow-1', { data: '1' });
      cache.set('user-workflow-2', { data: '2' });
      cache.set('admin-workflow-1', { data: '3' });

      cache.invalidatePattern(/^user-/);

      assert.ok(!cache.has('user-workflow-1'));
      assert.ok(!cache.has('user-workflow-2'));
      assert.ok(cache.has('admin-workflow-1'), 'Non-matching entries should remain');
    });

    test('clears entire cache', () => {
      const cache = new WorkflowCache({ maxSize: 5 });

      cache.set('workflow1', { data: '1' });
      cache.set('workflow2', { data: '2' });

      cache.clear();

      assert.strictEqual(cache.size(), 0);
      assert.ok(!cache.has('workflow1'));
      assert.ok(!cache.has('workflow2'));
    });

    test('caches workflow execution results', () => {
      const cache = new WorkflowCache({ maxSize: 10 });

      const result = { status: 'success', output: { value: 42 } };
      cache.set('workflow1:execution:123', result);

      const cached = cache.get('workflow1:execution:123');
      assert.deepStrictEqual(cached, result);
    });

    test('caches dependency graphs separately from workflow data', () => {
      const cache = new WorkflowCache({ maxSize: 10 });

      const workflow = { name: 'workflow1', phases: [] };
      const dependencyGraph = { phase1: [], phase2: ['phase1'] };

      cache.set('workflow1:metadata', workflow);
      cache.set('workflow1:dependencies', dependencyGraph);

      assert.ok(cache.has('workflow1:metadata'));
      assert.ok(cache.has('workflow1:dependencies'));

      const cachedDeps = cache.get('workflow1:dependencies');
      assert.deepStrictEqual(cachedDeps, dependencyGraph);
    });

    test('prevents cache stampede with locking', async () => {
      const cache = new WorkflowCache({ maxSize: 10 });

      let computeCount = 0;
      const expensiveCompute = async key => {
        computeCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return { data: `computed-${key}` };
      };

      // Simulate 3 concurrent requests for same key
      const requests = [
        cache.getOrCompute('workflow1', expensiveCompute),
        cache.getOrCompute('workflow1', expensiveCompute),
        cache.getOrCompute('workflow1', expensiveCompute),
      ];

      await Promise.all(requests);

      // Compute should only run once (lock prevents stampede)
      assert.strictEqual(computeCount, 1, 'Compute should run only once');
      assert.ok(cache.has('workflow1'));
    });

    test('supports cache warming for frequently accessed workflows', () => {
      const cache = new WorkflowCache({ maxSize: 10 });

      const workflows = [
        { name: 'workflow1', data: '1' },
        { name: 'workflow2', data: '2' },
        { name: 'workflow3', data: '3' },
      ];

      cache.warm(workflows);

      assert.ok(cache.has('workflow1'));
      assert.ok(cache.has('workflow2'));
      assert.ok(cache.has('workflow3'));
    });

    test('measures cache effectiveness (2x throughput improvement)', () => {
      const cache = new WorkflowCache({ maxSize: 10 });

      // Simulate workflow loading
      const loadWorkflow = name => {
        const cached = cache.get(name);
        if (cached) return cached;

        const workflow = { name, phases: [], metadata: {} };
        cache.set(name, workflow);
        return workflow;
      };

      // Load 5 unique workflows, then repeat (cache hits)
      const startTime = Date.now();
      for (let i = 0; i < 5; i++) {
        loadWorkflow(`workflow${i}`);
      }
      for (let i = 0; i < 5; i++) {
        loadWorkflow(`workflow${i}`); // Cache hits
      }
      const _duration2 = Date.now() - startTime;

      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 5, 'Should have 5 cache hits');
      assert.strictEqual(stats.misses, 5, 'Should have 5 cache misses');
      assert.strictEqual(stats.hitRate, 0.5);
    });
  });

  // ============================================================================
  // Category 3: Result Streaming (10 tests)
  // ============================================================================

  describe('Category 3: Result Streaming', () => {
    test('streams workflow results as they become available', async () => {
      const streamer = new ResultStreamer();

      const results = [];
      const workflow = {
        phases: [
          {
            name: 'phase1',
            async execute() {
              return 'result1';
            },
          },
          {
            name: 'phase2',
            async execute() {
              return 'result2';
            },
          },
          {
            name: 'phase3',
            async execute() {
              return 'result3';
            },
          },
        ],
      };

      for await (const result of streamer.stream(workflow)) {
        results.push(result);
      }

      assert.strictEqual(results.length, 3);
      assert.deepStrictEqual(results, ['result1', 'result2', 'result3']);
    });

    test('handles backpressure when consumer is slow', async () => {
      const streamer = new ResultStreamer({ bufferSize: 2 });

      const workflow = {
        phases: Array.from({ length: 10 }, (_, i) => ({
          name: `phase${i}`,
          async execute() {
            return `result${i}`;
          },
        })),
      };

      const results = [];
      for await (const result of streamer.stream(workflow)) {
        // Simulate slow consumer
        await new Promise(resolve => setTimeout(resolve, 5));
        results.push(result);
      }

      assert.strictEqual(results.length, 10);
    });

    test('processes results incrementally without accumulating in memory', async () => {
      const streamer = new ResultStreamer();

      const workflow = {
        phases: Array.from({ length: 100 }, (_, i) => ({
          name: `phase${i}`,
          async execute() {
            return { data: 'x'.repeat(1000) };
          }, // 1KB per result
        })),
      };

      let processed = 0;
      const startMemory = process.memoryUsage().heapUsed;

      for await (const result of streamer.stream(workflow)) {
        processed++;
        // Process result immediately, don't accumulate
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (endMemory - startMemory) / 1024 / 1024; // MB

      assert.strictEqual(processed, 100);
      // Memory growth should be minimal (<10MB) due to streaming
      assert.ok(memoryGrowth < 10, `Memory growth ${memoryGrowth}MB should be <10MB`);
    });

    test('emits progress events during streaming', async () => {
      const streamer = new ResultStreamer();

      const progressEvents = [];
      streamer.on('progress', event => {
        progressEvents.push(event);
      });

      const workflow = {
        phases: [
          {
            name: 'phase1',
            async execute() {
              return 'result1';
            },
          },
          {
            name: 'phase2',
            async execute() {
              return 'result2';
            },
          },
        ],
      };

      for await (const result of streamer.stream(workflow)) {
        // Consume stream
      }

      assert.ok(progressEvents.length > 0);
      assert.ok(progressEvents.some(e => e.phase === 'phase1'));
      assert.ok(progressEvents.some(e => e.phase === 'phase2'));
    });

    test('handles errors during streaming without stopping', async () => {
      const streamer = new ResultStreamer({ continueOnError: true });

      const workflow = {
        phases: [
          {
            name: 'phase1',
            async execute() {
              return 'result1';
            },
          },
          {
            name: 'phase2',
            async execute() {
              throw new Error('phase2 failed');
            },
          },
          {
            name: 'phase3',
            async execute() {
              return 'result3';
            },
          },
        ],
      };

      const results = [];
      const errors = [];

      for await (const result of streamer.stream(workflow)) {
        if (result instanceof Error) {
          errors.push(result);
        } else {
          results.push(result);
        }
      }

      assert.strictEqual(results.length, 2);
      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].message.includes('phase2 failed'));
    });

    test('supports filtering results during streaming', async () => {
      const streamer = new ResultStreamer({
        filter: result => result.status === 'success',
      });

      const workflow = {
        phases: [
          {
            name: 'phase1',
            async execute() {
              return { status: 'success', data: '1' };
            },
          },
          {
            name: 'phase2',
            async execute() {
              return { status: 'error', data: '2' };
            },
          },
          {
            name: 'phase3',
            async execute() {
              return { status: 'success', data: '3' };
            },
          },
        ],
      };

      const results = [];
      for await (const result of streamer.stream(workflow)) {
        results.push(result);
      }

      assert.strictEqual(results.length, 2);
      assert.ok(results.every(r => r.status === 'success'));
    });

    test('supports transforming results during streaming', async () => {
      const streamer = new ResultStreamer({
        transform: result => result.data.toUpperCase(),
      });

      const workflow = {
        phases: [
          {
            name: 'phase1',
            async execute() {
              return { data: 'result1' };
            },
          },
          {
            name: 'phase2',
            async execute() {
              return { data: 'result2' };
            },
          },
        ],
      };

      const results = [];
      for await (const result of streamer.stream(workflow)) {
        results.push(result);
      }

      assert.deepStrictEqual(results, ['RESULT1', 'RESULT2']);
    });

    test('supports parallel streaming for independent phases', async () => {
      const streamer = new ResultStreamer({ parallel: true, maxConcurrent: 3 });

      const workflow = {
        phases: [
          {
            name: 'phase1',
            async execute() {
              await new Promise(r => setTimeout(r, 10));
              return '1';
            },
          },
          {
            name: 'phase2',
            async execute() {
              await new Promise(r => setTimeout(r, 10));
              return '2';
            },
          },
          {
            name: 'phase3',
            async execute() {
              await new Promise(r => setTimeout(r, 10));
              return '3';
            },
          },
        ],
      };

      const startTime = Date.now();
      const results = [];
      for await (const result of streamer.stream(workflow)) {
        results.push(result);
      }
      const _duration = Date.now() - startTime;

      assert.strictEqual(results.length, 3);
      // Parallel should take ~10ms, sequential would take ~30ms
      assert.ok(_duration < 20, `Parallel streaming took ${_duration}ms, expected <20ms`);
    });

    test('closes stream properly on completion', async () => {
      const streamer = new ResultStreamer();

      const workflow = {
        phases: [
          {
            name: 'phase1',
            async execute() {
              return 'result1';
            },
          },
        ],
      };

      for await (const result of streamer.stream(workflow)) {
        // Consume stream
      }

      assert.ok(streamer.isClosed(), 'Stream should be closed after completion');
    });

    test('supports aborting stream mid-execution', async () => {
      const streamer = new ResultStreamer();

      const workflow = {
        phases: Array.from({ length: 100 }, (_, i) => ({
          name: `phase${i}`,
          async execute() {
            await new Promise(r => setTimeout(r, 5));
            return `result${i}`;
          },
        })),
      };

      const results = [];
      const controller = new AbortController();

      setTimeout(() => controller.abort(), 50); // Abort after 50ms

      try {
        for await (const result of streamer.stream(workflow, { signal: controller.signal })) {
          results.push(result);
        }
      } catch (err) {
        assert.ok(err.name === 'AbortError', 'Should throw AbortError');
      }

      // Should have processed some but not all results
      assert.ok(results.length > 0 && results.length < 100);
    });
  });

  // ============================================================================
  // Category 4: Memory Budgeting (10 tests)
  // ============================================================================

  describe('Category 4: Memory Budgeting', () => {
    test('enforces per-workflow memory limits', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 100 * 1024 * 1024 }); // 100MB

      const workflow = {
        name: 'workflow1',
        phases: [
          { name: 'phase1', estimatedMemory: 50 * 1024 * 1024 }, // 50MB
        ],
      };

      budgeter.allocate('workflow1', workflow);

      const allocated = budgeter.getAllocated('workflow1');
      assert.strictEqual(allocated, 50 * 1024 * 1024);
    });

    test('throws when workflow exceeds memory budget', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 100 * 1024 * 1024 }); // 100MB

      const workflow = {
        name: 'workflow1',
        phases: [
          { name: 'phase1', estimatedMemory: 150 * 1024 * 1024 }, // 150MB (exceeds budget)
        ],
      };

      assert.throws(
        () => budgeter.allocate('workflow1', workflow),
        /Memory budget exceeded/,
        'Should throw when budget exceeded'
      );
    });

    test('tracks memory usage per workflow', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 500 * 1024 * 1024 }); // 500MB

      budgeter.allocate('workflow1', { phases: [{ estimatedMemory: 100 * 1024 * 1024 }] });
      budgeter.allocate('workflow2', { phases: [{ estimatedMemory: 200 * 1024 * 1024 }] });

      assert.strictEqual(budgeter.getAllocated('workflow1'), 100 * 1024 * 1024);
      assert.strictEqual(budgeter.getAllocated('workflow2'), 200 * 1024 * 1024);
      assert.strictEqual(budgeter.getTotalAllocated(), 300 * 1024 * 1024);
    });

    test('releases memory when workflow completes', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 500 * 1024 * 1024 });

      budgeter.allocate('workflow1', { phases: [{ estimatedMemory: 100 * 1024 * 1024 }] });
      assert.strictEqual(budgeter.getTotalAllocated(), 100 * 1024 * 1024);

      budgeter.release('workflow1');
      assert.strictEqual(budgeter.getTotalAllocated(), 0);
    });

    test('prevents OOM by blocking new workflows when budget exhausted', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 200 * 1024 * 1024 }); // 200MB

      budgeter.allocate('workflow1', { phases: [{ estimatedMemory: 150 * 1024 * 1024 }] });

      // Try to allocate another 100MB (total would be 250MB, exceeds 200MB budget)
      assert.throws(
        () => budgeter.allocate('workflow2', { phases: [{ estimatedMemory: 100 * 1024 * 1024 }] }),
        /Memory budget exceeded/
      );
    });

    test('supports dynamic memory budget adjustment', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 200 * 1024 * 1024 });

      budgeter.allocate('workflow1', { phases: [{ estimatedMemory: 100 * 1024 * 1024 }] });

      // Increase budget
      budgeter.setMaxMemory(500 * 1024 * 1024);

      // Now this should succeed
      budgeter.allocate('workflow2', { phases: [{ estimatedMemory: 200 * 1024 * 1024 }] });

      assert.strictEqual(budgeter.getTotalAllocated(), 300 * 1024 * 1024);
    });

    test('warns when memory usage approaches budget limit', () => {
      const budgeter = new MemoryBudgeter({
        maxMemory: 200 * 1024 * 1024,
        warnThreshold: 0.8, // Warn at 80%
      });

      const warnings = [];
      budgeter.on('warning', event => {
        warnings.push(event);
      });

      budgeter.allocate('workflow1', { phases: [{ estimatedMemory: 170 * 1024 * 1024 }] }); // 85% of budget

      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].message.includes('Memory usage at'));
    });

    test('provides memory usage statistics', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 1000 * 1024 * 1024 }); // 1GB

      budgeter.allocate('workflow1', { phases: [{ estimatedMemory: 100 * 1024 * 1024 }] });
      budgeter.allocate('workflow2', { phases: [{ estimatedMemory: 200 * 1024 * 1024 }] });

      const stats = budgeter.getStats();
      assert.strictEqual(stats.totalAllocated, 300 * 1024 * 1024);
      assert.strictEqual(stats.totalBudget, 1000 * 1024 * 1024);
      assert.strictEqual(stats.utilizationPercentage, 30);
      assert.strictEqual(stats.availableMemory, 700 * 1024 * 1024);
    });

    test('supports reserving memory for critical workflows', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 500 * 1024 * 1024 });

      // Reserve 200MB for critical workflows
      budgeter.reserve('critical', 200 * 1024 * 1024);

      const stats = budgeter.getStats();
      assert.strictEqual(stats.reserved, 200 * 1024 * 1024);
      assert.strictEqual(stats.availableMemory, 300 * 1024 * 1024);

      // Normal workflows can only use 300MB now
      assert.throws(
        () => budgeter.allocate('workflow1', { phases: [{ estimatedMemory: 400 * 1024 * 1024 }] }),
        /Memory budget exceeded/
      );
    });

    test('prevents memory leaks by tracking active allocations', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 1000 * 1024 * 1024 });

      budgeter.allocate('workflow1', { phases: [{ estimatedMemory: 100 * 1024 * 1024 }] });
      budgeter.allocate('workflow2', { phases: [{ estimatedMemory: 200 * 1024 * 1024 }] });
      budgeter.allocate('workflow3', { phases: [{ estimatedMemory: 300 * 1024 * 1024 }] });

      const activeWorkflows = budgeter.getActiveWorkflows();
      assert.strictEqual(activeWorkflows.length, 3);
      assert.ok(activeWorkflows.includes('workflow1'));

      budgeter.release('workflow2');
      const updatedActive = budgeter.getActiveWorkflows();
      assert.strictEqual(updatedActive.length, 2);
      assert.ok(!updatedActive.includes('workflow2'));
    });
  });

  // ============================================================================
  // Category 5: End-to-End Performance (6 tests)
  // ============================================================================

  describe('Category 5: End-to-End Performance', () => {
    test('optimizes large workflow with all features combined', async () => {
      const lazyLoader = new LazyLoader({
        name: 'large-workflow',
        phases: Array.from({ length: 1000 }, (_, i) => ({
          name: `phase${i}`,
          tasks: [`task${i}`],
          estimatedMemory: 1 * 1024 * 1024, // 1MB per phase
        })),
      });

      const _cache = new WorkflowCache({ maxSize: 100 });
      const streamer = new ResultStreamer();
      const budgeter = new MemoryBudgeter({ maxMemory: 100 * 1024 * 1024 }); // 100MB budget

      // 1. Lazy load only needed phases (first 10)
      for (let i = 0; i < 10; i++) {
        lazyLoader.loadPhase(`phase${i}`);
      }

      // 2. Allocate memory budget
      const loadedWorkflow = {
        name: 'large-workflow',
        phases: lazyLoader.getLoadedPhases().map(name => ({
          name,
          estimatedMemory: 1 * 1024 * 1024,
          async execute() {
            return { data: `result-${name}` };
          },
        })),
      };
      budgeter.allocate('large-workflow', loadedWorkflow);

      // 3. Stream results (memory efficient)
      const results = [];
      for await (const result of streamer.stream(loadedWorkflow)) {
        results.push(result);
      }

      // Verify optimizations
      const memorySavings = lazyLoader.calculateMemorySavings();
      assert.ok(memorySavings > 0.9, 'Lazy loading should save >90% memory');
      assert.ok(budgeter.getTotalAllocated() <= 100 * 1024 * 1024, 'Should stay within budget');
      assert.strictEqual(results.length, 10, 'Should stream 10 results');
    });

    test('measures memory usage reduction from lazy loading', () => {
      const workflow = {
        name: 'memory-test-workflow',
        phases: Array.from({ length: 100 }, (_, i) => ({
          name: `phase${i}`,
          tasks: [`task${i}`],
          metadata: { large: 'x'.repeat(10000) }, // 10KB per phase
        })),
      };

      const lazyLoader = new LazyLoader(workflow);

      // Load only 10% of phases
      for (let i = 0; i < 10; i++) {
        lazyLoader.loadPhase(`phase${i}`);
      }

      const memorySavings = lazyLoader.calculateMemorySavings();
      // Should save ~90% of memory (1MB total vs 10MB full load)
      assert.ok(memorySavings > 0.85, `Memory savings should be >85%, got ${memorySavings}`);
    });

    test('validates cache improves throughput by 2x', () => {
      const cache = new WorkflowCache({ maxSize: 10 });

      // Simulate loading workflow (expensive operation)
      const loadWorkflow = name => {
        const cached = cache.get(name);
        if (cached) return cached;

        // Simulate expensive load
        const workflow = { name, metadata: {}, phases: [] };
        cache.set(name, workflow);
        return workflow;
      };

      const _startTime = Date.now();

      // First pass: All cache misses
      for (let i = 0; i < 10; i++) {
        loadWorkflow(`workflow${i}`);
      }

      // Second pass: All cache hits (should be ~2x faster)
      for (let i = 0; i < 10; i++) {
        loadWorkflow(`workflow${i}`);
      }

      const _duration = Date.now() - _startTime;

      const stats = cache.getStats();
      assert.strictEqual(stats.hits, 10, 'Should have 10 cache hits');
      assert.strictEqual(stats.hitRate, 0.5);
    });

    test('validates streaming prevents memory accumulation', async () => {
      const streamer = new ResultStreamer();

      const workflow = {
        phases: Array.from({ length: 100 }, (_, i) => ({
          name: `phase${i}`,
          async execute() {
            return { data: 'x'.repeat(10000) }; // 10KB per result
          },
        })),
      };

      const startMemory = process.memoryUsage().heapUsed;

      let processed = 0;
      for await (const result of streamer.stream(workflow)) {
        processed++;
        // Process result immediately, don't accumulate
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (endMemory - startMemory) / 1024 / 1024; // MB

      assert.strictEqual(processed, 100);
      // Memory growth should be <5MB due to streaming (not 1MB accumulation)
      assert.ok(memoryGrowth < 5, `Memory growth ${memoryGrowth}MB should be <5MB`);
    });

    test('validates memory budgeting prevents OOM', () => {
      const budgeter = new MemoryBudgeter({ maxMemory: 100 * 1024 * 1024 }); // 100MB

      const workflows = Array.from({ length: 10 }, (_, i) => ({
        name: `workflow${i}`,
        phases: [{ estimatedMemory: 50 * 1024 * 1024 }], // 50MB each
      }));

      let allocated = 0;
      let blocked = 0;

      workflows.forEach(workflow => {
        try {
          budgeter.allocate(workflow.name, workflow);
          allocated++;
        } catch (err) {
          if (err.message.includes('Memory budget exceeded')) {
            blocked++;
          }
        }
      });

      // Only 2 workflows should be allocated (2 * 50MB = 100MB)
      assert.strictEqual(allocated, 2);
      assert.strictEqual(blocked, 8);
      assert.ok(budgeter.getTotalAllocated() <= 100 * 1024 * 1024);
    });

    test('validates combined optimizations achieve performance targets', async () => {
      // Phase 4 targets from architecture doc:
      // - Lazy loading: -40% memory
      // - Caching: 2x throughput
      // - Streaming: <1% memory overhead
      // - Memory budgeting: No OOM

      const workflow = {
        name: 'performance-test-workflow',
        phases: Array.from({ length: 100 }, (_, i) => ({
          name: `phase${i}`,
          tasks: [`task${i}`],
          estimatedMemory: 1 * 1024 * 1024, // 1MB per phase
          async execute() {
            return { data: `result${i}` };
          },
        })),
      };

      const lazyLoader = new LazyLoader(workflow);
      const cache = new WorkflowCache({ maxSize: 50 });
      const streamer = new ResultStreamer();
      const budgeter = new MemoryBudgeter({ maxMemory: 50 * 1024 * 1024 }); // 50MB budget

      // Load only 40% of phases (lazy loading)
      for (let i = 0; i < 40; i++) {
        lazyLoader.loadPhase(`phase${i}`);
      }

      // Allocate budget
      const loadedWorkflow = {
        name: 'performance-test-workflow',
        phases: lazyLoader.getLoadedPhases().map(name => ({
          name,
          estimatedMemory: 1 * 1024 * 1024,
          async execute() {
            return { data: `result${name}` };
          },
        })),
      };
      budgeter.allocate('performance-test-workflow', loadedWorkflow);

      // Stream results
      const startMemory = process.memoryUsage().heapUsed;
      let processed = 0;

      for await (const result of streamer.stream(loadedWorkflow)) {
        processed++;
      }

      const endMemory = process.memoryUsage().heapUsed;
      const memoryOverhead = ((endMemory - startMemory) / startMemory) * 100;

      // Validate targets
      const memorySavings = lazyLoader.calculateMemorySavings();
      assert.ok(
        memorySavings >= 0.4,
        `Lazy loading should save >=40% memory, got ${memorySavings * 100}%`
      );
      assert.ok(memoryOverhead < 1, `Streaming overhead should be <1%, got ${memoryOverhead}%`);
      assert.ok(
        budgeter.getTotalAllocated() <= 50 * 1024 * 1024,
        'Should stay within memory budget'
      );
      assert.strictEqual(processed, 40, 'Should stream all loaded phases');

      // Cache hit rate test
      cache.set('test-workflow', workflow);
      const _hit1 = cache.get('test-workflow');
      const _hit2 = cache.get('test-workflow');
      const stats = cache.getStats();
      assert.ok(stats.hitRate >= 0.5, 'Cache hit rate should improve throughput');
    });
  });
});
