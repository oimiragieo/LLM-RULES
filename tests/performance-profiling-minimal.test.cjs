const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('Performance Profiling - Minimal Tests', () => {
  it('should load PerformanceProfiler', () => {
    const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
    assert.ok(PerformanceProfiler);
  });

  it('should create profiler instance', () => {
    const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
    const profiler = new PerformanceProfiler(PROJECT_ROOT);
    assert.ok(profiler);
  });

  it('should instrument async function', async () => {
    const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
    const profiler = new PerformanceProfiler(PROJECT_ROOT);

    const testFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return 'result';
    };

    const instrumented = profiler.instrumentFunction('test', testFn);
    const result = await instrumented();

    assert.strictEqual(result, 'result');
    const metrics = profiler.getMetrics('test');
    assert.ok(metrics);
    assert.ok(metrics.executionTime >= 15);
  });

  it('should instrument sync function', () => {
    const { PerformanceProfiler } = require('../.claude/lib/utils/performance-profiler.cjs');
    const profiler = new PerformanceProfiler(PROJECT_ROOT);

    const testFn = () => {
      return 42;
    };

    const instrumented = profiler.instrumentFunction('syncTest', testFn);
    const result = instrumented();

    assert.strictEqual(result, 42);
    const metrics = profiler.getMetrics('syncTest');
    assert.ok(metrics);
    assert.ok(metrics.executionTime >= 0);
  });

  it('should load BottleneckAnalyzer', () => {
    const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
    assert.ok(BottleneckAnalyzer);
  });

  it('should find bottlenecks', () => {
    const { BottleneckAnalyzer } = require('../.claude/lib/utils/bottleneck-analyzer.cjs');
    const metrics = {
      fn1: { executionTime: 500 },
      fn2: { executionTime: 300 },
      fn3: { executionTime: 100 },
    };

    const analyzer = new BottleneckAnalyzer(metrics);
    const bottlenecks = analyzer.findBottlenecks(10);

    assert.ok(Array.isArray(bottlenecks));
    assert.ok(bottlenecks.length >= 2);
  });

  it('should load optimization targets', () => {
    const {
      setPerformanceTargets,
      optimizationPriority,
    } = require('../.claude/lib/utils/optimization-targets.cjs');
    assert.ok(setPerformanceTargets);
    assert.ok(optimizationPriority);
  });

  it('should set performance targets', () => {
    const { setPerformanceTargets } = require('../.claude/lib/utils/optimization-targets.cjs');
    const targets = setPerformanceTargets();

    assert.ok(targets.tier1);
    assert.ok(targets.tier2);
    assert.ok(targets.tier3);
    assert.ok(Array.isArray(targets.tier1));
  });

  it('should load report generator', () => {
    const {
      generateProfilingReport,
    } = require('../.claude/lib/utils/profiling-report-generator.cjs');
    assert.ok(generateProfilingReport);
  });

  it('should generate report', () => {
    const {
      generateProfilingReport,
    } = require('../.claude/lib/utils/profiling-report-generator.cjs');
    const report = generateProfilingReport(
      { fn1: { executionTime: 100 } },
      [{ name: 'fn1', executionTime: 100, percentage: 50 }],
      { tier1: [], tier2: [], tier3: [] }
    );

    assert.ok(typeof report === 'string');
    assert.ok(report.length > 0);
  });
});
