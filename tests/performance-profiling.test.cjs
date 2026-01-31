const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Test utilities
const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('Performance Profiling Framework (RED Phase)', () => {
  describe('PerformanceProfiler - Instrumentation (15+ tests)', () => {
    it('should create profiler with specs path', () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(path.join(PROJECT_ROOT, '.claude/lib'));

      assert.ok(profiler);
      assert.strictEqual(typeof profiler.instrumentFunction, 'function');
    });

    it('should instrument function with timing tracking', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'result';
      };

      const instrumented = profiler.instrumentFunction('testFn', testFn);
      const result = await instrumented();

      assert.strictEqual(result, 'result');
      const metrics = profiler.getMetrics('testFn');
      assert.ok(metrics);
      assert.ok(metrics.executionTime >= 10);
    });

    it('should track memory usage during function execution', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const memoryIntensiveFn = async () => {
        const arr = new Array(10000).fill('test');
        return arr.length;
      };

      const instrumented = profiler.instrumentFunction('memoryFn', memoryIntensiveFn);
      await instrumented();

      const metrics = profiler.getMetrics('memoryFn');
      assert.ok(metrics.memoryUsed > 0);
    });

    it('should track token usage if available', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const fnWithTokens = async () => {
        return { tokens: 100 };
      };

      const instrumented = profiler.instrumentFunction('tokenFn', fnWithTokens);
      await instrumented();

      const metrics = profiler.getMetrics('tokenFn');
      assert.ok('tokensUsed' in metrics);
    });

    it('should support starting profiling session with label', () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      profiler.startProfiling('test-session');

      // Should not throw
      assert.ok(true);
    });

    it('should support stopping profiling session and storing metrics', () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      profiler.startProfiling('test-session');
      profiler.stopProfiling('test-session');

      const metrics = profiler.getMetrics('test-session');
      assert.ok(metrics);
      assert.ok(metrics.executionTime >= 0);
    });

    it('should return null metrics for non-existent label', () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const metrics = profiler.getMetrics('non-existent');
      assert.strictEqual(metrics, null);
    });

    it('should profile all SPEC modules (001-012)', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(path.join(PROJECT_ROOT, '.claude/lib'));

      const results = await profiler.profileAllSpecs();

      assert.ok(results);
      assert.ok(Array.isArray(results));
      assert.ok(results.length > 0);
    });

    it('should generate flame graph data in JSON format', () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      // Add some sample metrics
      profiler.startProfiling('parent');
      profiler.startProfiling('child1');
      profiler.stopProfiling('child1');
      profiler.startProfiling('child2');
      profiler.stopProfiling('child2');
      profiler.stopProfiling('parent');

      const flameGraph = profiler.generateFlameGraph();

      assert.ok(flameGraph);
      assert.ok(typeof flameGraph === 'object');
    });

    it('should generate performance heatmap per function', () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      // Add metrics for multiple functions
      profiler.startProfiling('fn1');
      profiler.stopProfiling('fn1');
      profiler.startProfiling('fn2');
      profiler.stopProfiling('fn2');

      const heatmap = profiler.generateHeatmap();

      assert.ok(heatmap);
      assert.ok(typeof heatmap === 'object');
    });

    it('should measure timing accuracy within 5ms variance', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const delay = 50;
      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, delay));
      };

      const instrumented = profiler.instrumentFunction('accuracyTest', testFn);
      await instrumented();

      const metrics = profiler.getMetrics('accuracyTest');
      const variance = Math.abs(metrics.executionTime - delay);
      assert.ok(variance < 5, `Timing variance ${variance}ms exceeds 5ms threshold`);
    });

    it('should handle nested instrumentation correctly', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const innerFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'inner';
      };

      const outerFn = async () => {
        const instrumented = profiler.instrumentFunction('inner', innerFn);
        await instrumented();
        return 'outer';
      };

      const instrumentedOuter = profiler.instrumentFunction('outer', outerFn);
      await instrumentedOuter();

      const outerMetrics = profiler.getMetrics('outer');
      const innerMetrics = profiler.getMetrics('inner');

      assert.ok(outerMetrics.executionTime > innerMetrics.executionTime);
    });

    it('should track cache hits if available', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const fnWithCache = async () => {
        return { cacheHit: true };
      };

      const instrumented = profiler.instrumentFunction('cacheFn', fnWithCache);
      await instrumented();

      const metrics = profiler.getMetrics('cacheFn');
      assert.ok('cacheHits' in metrics);
    });

    it('should handle errors in instrumented functions', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const errorFn = async () => {
        throw new Error('Test error');
      };

      const instrumented = profiler.instrumentFunction('errorFn', errorFn);

      await assert.rejects(async () => {
        await instrumented();
      }, /Test error/);

      // Should still record metrics
      const metrics = profiler.getMetrics('errorFn');
      assert.ok(metrics);
    });

    it('should support multiple runs and aggregate metrics', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
      };

      const instrumented = profiler.instrumentFunction('multiRun', testFn);

      for (let i = 0; i < 5; i++) {
        await instrumented();
      }

      const metrics = profiler.getMetrics('multiRun');
      assert.ok(metrics.callCount === 5 || metrics.executionTime > 0);
    });
  });

  describe('BottleneckAnalyzer - Detection (15+ tests)', () => {
    it('should create analyzer with profiler metrics', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const metrics = { fn1: { executionTime: 100 }, fn2: { executionTime: 50 } };

      const analyzer = new BottleneckAnalyzer(metrics);

      assert.ok(analyzer);
      assert.strictEqual(typeof analyzer.findBottlenecks, 'function');
    });

    it('should find functions taking >10% of total time', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const metrics = {
        fn1: { executionTime: 500 },
        fn2: { executionTime: 300 },
        fn3: { executionTime: 100 },
        fn4: { executionTime: 100 },
      };

      const analyzer = new BottleneckAnalyzer(metrics);
      const bottlenecks = analyzer.findBottlenecks(10);

      assert.ok(Array.isArray(bottlenecks));
      assert.ok(bottlenecks.length >= 2);
      assert.ok(bottlenecks[0].name === 'fn1' || bottlenecks[0].name === 'fn2');
    });

    it('should support custom threshold percentage', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const metrics = {
        fn1: { executionTime: 50 },
        fn2: { executionTime: 50 },
      };

      const analyzer = new BottleneckAnalyzer(metrics);
      const bottlenecks = analyzer.findBottlenecks(40);

      assert.ok(bottlenecks.length >= 1);
    });

    it('should analyze memory-heavy operations sorted by size', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const metrics = {
        fn1: { memoryUsed: 100 * 1024 * 1024 },
        fn2: { memoryUsed: 50 * 1024 * 1024 },
        fn3: { memoryUsed: 10 * 1024 * 1024 },
      };

      const analyzer = new BottleneckAnalyzer(metrics);
      const memoryHeavy = analyzer.analyzeMemory();

      assert.ok(Array.isArray(memoryHeavy));
      assert.strictEqual(memoryHeavy[0].name, 'fn1');
      assert.strictEqual(memoryHeavy[1].name, 'fn2');
    });

    it('should analyze slow query functions', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const metrics = {
        queryByPhase: { executionTime: 600 },
        computeMetrics: { executionTime: 400 },
        generateReport: { executionTime: 300 },
      };

      const analyzer = new BottleneckAnalyzer(metrics);
      const slowQueries = analyzer.analyzeQueries();

      assert.ok(Array.isArray(slowQueries));
      assert.ok(slowQueries.length > 0);
    });

    it('should analyze checkpointing overhead', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const metrics = {
        saveCheckpoint: { executionTime: 120 },
        loadCheckpoint: { executionTime: 30 },
      };

      const analyzer = new BottleneckAnalyzer(metrics);
      const checkpointOverhead = analyzer.analyzeCheckpointing();

      assert.ok(checkpointOverhead);
      assert.ok(checkpointOverhead.totalTime >= 0);
    });

    it('should detect memory growth pattern from samples', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const samples = [
        { timestamp: 1000, memoryUsed: 50 * 1024 * 1024 },
        { timestamp: 2000, memoryUsed: 60 * 1024 * 1024 },
        { timestamp: 3000, memoryUsed: 70 * 1024 * 1024 },
      ];

      const analyzer = new BottleneckAnalyzer({});
      const pattern = analyzer.getMemoryGrowthPattern(samples);

      assert.ok(pattern);
      assert.ok(pattern.trend === 'increasing' || pattern.growthRate > 0);
    });

    it('should detect stable memory pattern', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const samples = [
        { timestamp: 1000, memoryUsed: 50 * 1024 * 1024 },
        { timestamp: 2000, memoryUsed: 51 * 1024 * 1024 },
        { timestamp: 3000, memoryUsed: 50 * 1024 * 1024 },
      ];

      const analyzer = new BottleneckAnalyzer({});
      const pattern = analyzer.getMemoryGrowthPattern(samples);

      assert.ok(pattern);
      assert.ok(pattern.trend === 'stable' || Math.abs(pattern.growthRate) < 0.05);
    });

    it('should suggest caching for repeated operations', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const bottleneck = {
        name: 'queryByPhase',
        executionTime: 600,
        callCount: 100,
      };

      const analyzer = new BottleneckAnalyzer({});
      const suggestions = analyzer.suggestOptimizations(bottleneck);

      assert.ok(Array.isArray(suggestions));
      assert.ok(suggestions.some(s => s.toLowerCase().includes('cache')));
    });

    it('should suggest async for blocking operations', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const bottleneck = {
        name: 'saveState',
        executionTime: 200,
        type: 'io',
      };

      const analyzer = new BottleneckAnalyzer({});
      const suggestions = analyzer.suggestOptimizations(bottleneck);

      assert.ok(suggestions.some(s => s.toLowerCase().includes('async')));
    });

    it('should suggest batching for multiple calls', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const bottleneck = {
        name: 'gitNotesAttach',
        executionTime: 45,
        callCount: 50,
      };

      const analyzer = new BottleneckAnalyzer({});
      const suggestions = analyzer.suggestOptimizations(bottleneck);

      assert.ok(suggestions.some(s => s.toLowerCase().includes('batch')));
    });

    it('should suggest parallel processing for independent operations', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const bottleneck = {
        name: 'processFiles',
        executionTime: 1000,
        parallelizable: true,
      };

      const analyzer = new BottleneckAnalyzer({});
      const suggestions = analyzer.suggestOptimizations(bottleneck);

      assert.ok(suggestions.some(s => s.toLowerCase().includes('parallel')));
    });

    it('should rank bottlenecks by impact', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const metrics = {
        fn1: { executionTime: 500 },
        fn2: { executionTime: 300 },
        fn3: { executionTime: 100 },
      };

      const analyzer = new BottleneckAnalyzer(metrics);
      const bottlenecks = analyzer.findBottlenecks(5);

      // Should be sorted by execution time (highest first)
      for (let i = 0; i < bottlenecks.length - 1; i++) {
        assert.ok(bottlenecks[i].executionTime >= bottlenecks[i + 1].executionTime);
      }
    });

    it('should calculate percentage of total time', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const metrics = {
        fn1: { executionTime: 500 },
        fn2: { executionTime: 500 },
      };

      const analyzer = new BottleneckAnalyzer(metrics);
      const bottlenecks = analyzer.findBottlenecks(1);

      assert.ok(bottlenecks[0].percentage === 50 || Math.abs(bottlenecks[0].percentage - 50) < 1);
    });

    it('should handle empty metrics gracefully', () => {
      const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
      const analyzer = new BottleneckAnalyzer({});

      const bottlenecks = analyzer.findBottlenecks();
      assert.ok(Array.isArray(bottlenecks));
      assert.strictEqual(bottlenecks.length, 0);
    });
  });

  describe('OptimizationTargets - Priority Setting (15+ tests)', () => {
    it('should set performance targets with tier categorization', () => {
      const { setPerformanceTargets } = require('../.claude/lib/utils/optimization-targets.cjs');

      const targets = setPerformanceTargets();

      assert.ok(targets);
      assert.ok(targets.tier1);
      assert.ok(targets.tier2);
      assert.ok(targets.tier3);
    });

    it('should define Tier 1 critical targets', () => {
      const { setPerformanceTargets } = require('../.claude/lib/utils/optimization-targets.cjs');

      const targets = setPerformanceTargets();

      assert.ok(Array.isArray(targets.tier1));
      assert.ok(targets.tier1.length > 0);
      assert.ok(targets.tier1.some(t => t.metric.includes('query')));
    });

    it('should define Tier 2 important targets', () => {
      const { setPerformanceTargets } = require('../.claude/lib/utils/optimization-targets.cjs');

      const targets = setPerformanceTargets();

      assert.ok(Array.isArray(targets.tier2));
      assert.ok(targets.tier2.length > 0);
    });

    it('should define Tier 3 nice-to-have targets', () => {
      const { setPerformanceTargets } = require('../.claude/lib/utils/optimization-targets.cjs');

      const targets = setPerformanceTargets();

      assert.ok(Array.isArray(targets.tier3));
      assert.ok(targets.tier3.length > 0);
    });

    it('should include rationale for each target', () => {
      const { setPerformanceTargets } = require('../.claude/lib/utils/optimization-targets.cjs');

      const targets = setPerformanceTargets();
      const allTargets = [...targets.tier1, ...targets.tier2, ...targets.tier3];

      allTargets.forEach(target => {
        assert.ok(target.rationale);
        assert.ok(typeof target.rationale === 'string');
      });
    });

    it('should calculate optimization priority (impact/effort ratio)', () => {
      const { optimizationPriority } = require('../.claude/lib/utils/optimization-targets.cjs');

      const bottleneck = {
        name: 'queryByPhase',
        executionTime: 600,
        callCount: 100,
      };
      const targetTime = 100;

      const priority = optimizationPriority(bottleneck, targetTime);

      assert.ok(priority);
      assert.ok(typeof priority.impact === 'string');
      assert.ok(typeof priority.effort === 'string');
      assert.ok(typeof priority.score === 'number');
    });

    it('should identify high impact optimizations (>20% savings)', () => {
      const { optimizationPriority } = require('../.claude/lib/utils/optimization-targets.cjs');

      const bottleneck = {
        name: 'slowFn',
        executionTime: 1000,
        percentage: 25,
      };

      const priority = optimizationPriority(bottleneck, 200);

      assert.strictEqual(priority.impact, 'high');
    });

    it('should identify medium impact optimizations (10-20% savings)', () => {
      const { optimizationPriority } = require('../.claude/lib/utils/optimization-targets.cjs');

      const bottleneck = {
        name: 'mediumFn',
        executionTime: 150,
        percentage: 15,
      };

      const priority = optimizationPriority(bottleneck, 100);

      assert.strictEqual(priority.impact, 'medium');
    });

    it('should identify low impact optimizations (<10% savings)', () => {
      const { optimizationPriority } = require('../.claude/lib/utils/optimization-targets.cjs');

      const bottleneck = {
        name: 'smallFn',
        executionTime: 50,
        percentage: 5,
      };

      const priority = optimizationPriority(bottleneck, 40);

      assert.strictEqual(priority.impact, 'low');
    });

    it('should estimate high effort (>2 days)', () => {
      const { optimizationPriority } = require('../.claude/lib/utils/optimization-targets.cjs');

      const bottleneck = {
        name: 'complexFn',
        executionTime: 1000,
        complexity: 'high',
      };

      const priority = optimizationPriority(bottleneck, 100);

      assert.ok(priority.effort === 'high' || priority.effortDays > 2);
    });

    it('should estimate medium effort (0.5-2 days)', () => {
      const { optimizationPriority } = require('../.claude/lib/utils/optimization-targets.cjs');

      const bottleneck = {
        name: 'moderateFn',
        executionTime: 500,
        complexity: 'medium',
      };

      const priority = optimizationPriority(bottleneck, 100);

      assert.ok(
        priority.effort === 'medium' || (priority.effortDays >= 0.5 && priority.effortDays <= 2)
      );
    });

    it('should estimate low effort (<0.5 days)', () => {
      const { optimizationPriority } = require('../.claude/lib/utils/optimization-targets.cjs');

      const bottleneck = {
        name: 'simpleFn',
        executionTime: 100,
        complexity: 'low',
      };

      const priority = optimizationPriority(bottleneck, 50);

      assert.ok(priority.effort === 'low' || priority.effortDays < 0.5);
    });

    it('should calculate priority score (higher is better)', () => {
      const { optimizationPriority } = require('../.claude/lib/utils/optimization-targets.cjs');

      const highImpact = optimizationPriority(
        { executionTime: 1000, percentage: 25, complexity: 'low' },
        100
      );

      const lowImpact = optimizationPriority(
        { executionTime: 100, percentage: 5, complexity: 'high' },
        90
      );

      assert.ok(highImpact.score > lowImpact.score);
    });

    it('should include target times for each component', () => {
      const { setPerformanceTargets } = require('../.claude/lib/utils/optimization-targets.cjs');

      const targets = setPerformanceTargets();
      const allTargets = [...targets.tier1, ...targets.tier2, ...targets.tier3];

      allTargets.forEach(target => {
        assert.ok(target.targetTime !== undefined);
        assert.ok(typeof target.targetTime === 'number');
      });
    });

    it('should include component names for identification', () => {
      const { setPerformanceTargets } = require('../.claude/lib/utils/optimization-targets.cjs');

      const targets = setPerformanceTargets();
      const allTargets = [...targets.tier1, ...targets.tier2, ...targets.tier3];

      allTargets.forEach(target => {
        assert.ok(target.component);
        assert.ok(typeof target.component === 'string');
      });
    });
  });

  describe('ProfilingReportGenerator - Markdown Reports (15+ tests)', () => {
    it('should generate markdown report from metrics and bottlenecks', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const metrics = { fn1: { executionTime: 100 } };
      const bottlenecks = [{ name: 'fn1', executionTime: 100, percentage: 50 }];
      const targets = { tier1: [], tier2: [], tier3: [] };

      const report = generateProfilingReport(metrics, bottlenecks, targets);

      assert.ok(typeof report === 'string');
      assert.ok(report.length > 0);
    });

    it('should include executive summary section', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const metrics = {};
      const bottlenecks = [{ name: 'fn1', executionTime: 500, percentage: 40 }];
      const targets = { tier1: [], tier2: [], tier3: [] };

      const report = generateProfilingReport(metrics, bottlenecks, targets);

      assert.ok(report.includes('Executive Summary') || report.includes('Summary'));
    });

    it('should list top bottlenecks in summary', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const bottlenecks = [
        { name: 'fn1', executionTime: 500, percentage: 40 },
        { name: 'fn2', executionTime: 300, percentage: 30 },
      ];

      const report = generateProfilingReport({}, bottlenecks, { tier1: [], tier2: [], tier3: [] });

      assert.ok(report.includes('fn1'));
      assert.ok(report.includes('fn2'));
    });

    it('should include recommendations in summary', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const bottlenecks = [{ name: 'fn1', executionTime: 500, suggestions: ['Add caching'] }];

      const report = generateProfilingReport({}, bottlenecks, { tier1: [], tier2: [], tier3: [] });

      assert.ok(report.includes('Recommendations') || report.includes('recommendations'));
    });

    it('should include per-SPEC performance breakdown', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const metrics = {
        'SPEC-001': { executionTime: 100 },
        'SPEC-002': { executionTime: 200 },
      };

      const report = generateProfilingReport(metrics, [], { tier1: [], tier2: [], tier3: [] });

      assert.ok(
        report.includes('SPEC-001') || report.includes('Per-SPEC') || report.includes('Breakdown')
      );
    });

    it('should include bottleneck analysis section', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const bottlenecks = [{ name: 'fn1', executionTime: 500 }];

      const report = generateProfilingReport({}, bottlenecks, { tier1: [], tier2: [], tier3: [] });

      assert.ok(report.includes('Bottleneck') || report.includes('bottleneck'));
    });

    it('should include optimization strategies for each bottleneck', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const bottlenecks = [
        {
          name: 'slowQuery',
          executionTime: 600,
          suggestions: ['Add indexing', 'Use caching'],
        },
      ];

      const report = generateProfilingReport({}, bottlenecks, { tier1: [], tier2: [], tier3: [] });

      assert.ok(report.includes('indexing') || report.includes('Strategies'));
    });

    it('should include tier-based recommendations (Tier 1)', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const targets = {
        tier1: [{ component: 'analytics', targetTime: 500, rationale: 'Critical path' }],
        tier2: [],
        tier3: [],
      };

      const report = generateProfilingReport({}, [], targets);

      assert.ok(report.includes('Tier 1') || report.includes('tier1'));
    });

    it('should include tier-based recommendations (Tier 2)', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const targets = {
        tier1: [],
        tier2: [{ component: 'brownfield', targetTime: 60000 }],
        tier3: [],
      };

      const report = generateProfilingReport({}, [], targets);

      assert.ok(report.includes('Tier 2') || report.includes('tier2'));
    });

    it('should include tier-based recommendations (Tier 3)', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const targets = {
        tier1: [],
        tier2: [],
        tier3: [{ component: 'reporting', targetTime: 50 }],
      };

      const report = generateProfilingReport({}, [], targets);

      assert.ok(report.includes('Tier 3') || report.includes('tier3'));
    });

    it('should include historical comparison if baseline available', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const metrics = { fn1: { executionTime: 100 } };
      const baseline = { fn1: { executionTime: 150 } };

      const report = generateProfilingReport(
        metrics,
        [],
        { tier1: [], tier2: [], tier3: [] },
        baseline
      );

      assert.ok(
        report.includes('Baseline') || report.includes('baseline') || report.includes('Historical')
      );
    });

    it('should estimate time savings per optimization', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const bottlenecks = [
        {
          name: 'slowFn',
          executionTime: 500,
          targetTime: 100,
          callCount: 100,
        },
      ];

      const report = generateProfilingReport({}, bottlenecks, { tier1: [], tier2: [], tier3: [] });

      assert.ok(
        report.includes('savings') || report.includes('improvement') || report.includes('%')
      );
    });

    it('should estimate memory savings per optimization', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const bottlenecks = [
        {
          name: 'memoryHeavy',
          memoryUsed: 100 * 1024 * 1024,
          targetMemory: 50 * 1024 * 1024,
        },
      ];

      const report = generateProfilingReport({}, bottlenecks, { tier1: [], tier2: [], tier3: [] });

      assert.ok(report.includes('MB') || report.includes('memory') || report.includes('Memory'));
    });

    it('should format report as valid markdown', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const report = generateProfilingReport({ fn1: { executionTime: 100 } }, [], {
        tier1: [],
        tier2: [],
        tier3: [],
      });

      // Check for markdown headers
      assert.ok(report.includes('#') || report.includes('##'));
    });

    it('should include visualization placeholders or ASCII charts', () => {
      const {
        generateProfilingReport,
      } = require('../.claude/lib/utils/profiling-report-generator.cjs');

      const metrics = {
        fn1: { executionTime: 500 },
        fn2: { executionTime: 300 },
        fn3: { executionTime: 100 },
      };

      const report = generateProfilingReport(metrics, [], { tier1: [], tier2: [], tier3: [] });

      // Should include some form of visualization
      assert.ok(report.length > 500); // Substantial content
    });
  });

  describe('Measurement Accuracy (10+ tests)', () => {
    it('should measure consistent timings across runs', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      };

      const instrumented = profiler.instrumentFunction('consistencyTest', testFn);
      const timings = [];

      for (let i = 0; i < 5; i++) {
        await instrumented();
        const metrics = profiler.getMetrics('consistencyTest');
        timings.push(metrics.executionTime);
      }

      // Calculate variance
      const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
      const variance = timings.reduce((acc, t) => acc + Math.pow(t - mean, 2), 0) / timings.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation should be small (<10% of mean)
      assert.ok(stdDev < mean * 0.1, `High variance: stdDev=${stdDev}, mean=${mean}`);
    });

    it('should handle rapid successive measurements', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const fastFn = async () => {
        return 'fast';
      };

      const instrumented = profiler.instrumentFunction('rapidTest', fastFn);

      for (let i = 0; i < 100; i++) {
        await instrumented();
      }

      const metrics = profiler.getMetrics('rapidTest');
      assert.ok(metrics);
    });

    it('should measure memory without leaks', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const before = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        const fn = async () => {
          const arr = new Array(100).fill('test');
          return arr.length;
        };
        const instrumented = profiler.instrumentFunction(`memTest${i}`, fn);
        await instrumented();
      }

      global.gc && global.gc();
      const after = process.memoryUsage().heapUsed;
      const growth = (after - before) / before;

      // Growth should be minimal (<20%)
      assert.ok(growth < 0.2, `Memory growth ${Math.round(growth * 100)}% exceeds 20%`);
    });

    it('should handle zero-time operations', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const instantFn = () => {
        return 1 + 1;
      };

      const instrumented = profiler.instrumentFunction('instantTest', instantFn);
      await instrumented();

      const metrics = profiler.getMetrics('instantTest');
      assert.ok(metrics.executionTime >= 0);
    });

    it('should handle long-running operations', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const longFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      };

      const instrumented = profiler.instrumentFunction('longTest', longFn);
      await instrumented();

      const metrics = profiler.getMetrics('longTest');
      assert.ok(metrics.executionTime >= 100);
    });

    it('should measure concurrent operations independently', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const fn1 = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      };
      const fn2 = async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
      };

      const instrumented1 = profiler.instrumentFunction('concurrent1', fn1);
      const instrumented2 = profiler.instrumentFunction('concurrent2', fn2);

      await Promise.all([instrumented1(), instrumented2()]);

      const metrics1 = profiler.getMetrics('concurrent1');
      const metrics2 = profiler.getMetrics('concurrent2');

      assert.ok(Math.abs(metrics1.executionTime - 50) < 10);
      assert.ok(Math.abs(metrics2.executionTime - 30) < 10);
    });

    it('should track metrics per invocation with unique IDs', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const testFn = async () => {
        return 'result';
      };

      const instrumented = profiler.instrumentFunction('invocationTest', testFn);

      await instrumented();
      await instrumented();

      const metrics = profiler.getMetrics('invocationTest');
      assert.ok(metrics);
    });

    it('should handle synchronous functions', () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const syncFn = () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      };

      const instrumented = profiler.instrumentFunction('syncTest', syncFn);
      const result = instrumented();

      assert.ok(result);
      const metrics = profiler.getMetrics('syncTest');
      assert.ok(metrics.executionTime >= 0);
    });

    it('should preserve function return values', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      const testFn = async (a, b) => {
        return a + b;
      };

      const instrumented = profiler.instrumentFunction('returnTest', testFn);
      const result = await instrumented(5, 3);

      assert.strictEqual(result, 8);
    });

    it('should preserve function arguments', async () => {
      const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
      const profiler = new PerformanceProfiler(PROJECT_ROOT);

      let receivedArgs;
      const testFn = async (...args) => {
        receivedArgs = args;
        return args;
      };

      const instrumented = profiler.instrumentFunction('argsTest', testFn);
      await instrumented(1, 'test', { key: 'value' });

      assert.deepStrictEqual(receivedArgs, [1, 'test', { key: 'value' }]);
    });
  });
});
