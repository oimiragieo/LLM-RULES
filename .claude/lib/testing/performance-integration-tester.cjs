/**
 * Performance Integration Tester
 *
 * Measures performance of integration scenarios and generates reports.
 * Validates performance targets for sequential and parallel execution.
 *
 * SPEC-012: Multi-Feature Integration Testing
 */

/**
 * Measure sequential workflow execution time
 *
 * @param {Function} workflowFn - Workflow function to measure
 * @param {object} options - Options with {iterations, warmup}
 * @returns {Promise<object>} Performance metrics
 */
async function measureSequentialWorkflow(workflowFn, options = {}) {
  const {
    iterations = 1,
    warmup = 0
  } = options;

  if (typeof workflowFn !== 'function') {
    throw new Error('workflowFn must be a function');
  }

  // Warmup runs (not counted in metrics)
  for (let i = 0; i < warmup; i++) {
    await workflowFn();
  }

  const timings = [];
  const memorySnapshots = [];

  for (let i = 0; i < iterations; i++) {
    const memBefore = process.memoryUsage();
    const startTime = Date.now();

    await workflowFn();

    const endTime = Date.now();
    const memAfter = process.memoryUsage();

    timings.push(endTime - startTime);
    memorySnapshots.push({
      before: memBefore,
      after: memAfter,
      delta: (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024 // MB
    });
  }

  const avgTime = timings.reduce((sum, t) => sum + t, 0) / timings.length;
  const minTime = Math.min(...timings);
  const maxTime = Math.max(...timings);
  const avgMemory = memorySnapshots.reduce((sum, m) => sum + m.delta, 0) / memorySnapshots.length;

  return {
    iterations,
    timings,
    avgTime,
    minTime,
    maxTime,
    avgMemory,
    target: 10000, // <10s target
    passed: avgTime < 10000,
    measuredAt: new Date().toISOString()
  };
}

/**
 * Measure parallel workflow execution
 *
 * @param {Function} workflowFn - Workflow function to measure
 * @param {object} options - Options with {concurrency, iterations}
 * @returns {Promise<object>} Performance metrics
 */
async function measureParallelWorkflow(workflowFn, options = {}) {
  const {
    concurrency = 10,
    iterations = 1
  } = options;

  if (typeof workflowFn !== 'function') {
    throw new Error('workflowFn must be a function');
  }

  const results = [];
  const memBefore = process.memoryUsage();

  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();

    // Execute workflows in parallel
    const promises = Array(concurrency).fill(0).map(() => workflowFn());
    await Promise.all(promises);

    const endTime = Date.now();
    results.push(endTime - startTime);
  }

  const memAfter = process.memoryUsage();
  const avgTime = results.reduce((sum, t) => sum + t, 0) / results.length;
  const memoryUsage = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024; // MB

  return {
    concurrency,
    iterations,
    results,
    avgTime,
    memoryUsage,
    target: {
      time: concurrency * 1000, // Rough estimate: concurrency * 1s
      memory: 300 // <300MB target
    },
    passed: avgTime < concurrency * 1000 && memoryUsage < 300,
    measuredAt: new Date().toISOString()
  };
}

/**
 * Measure component performance (individual SPEC)
 *
 * @param {string} specId - SPEC identifier (e.g., 'SPEC-001')
 * @param {Function} componentFn - Component function to measure
 * @param {object} options - Options with {iterations, warmup}
 * @returns {Promise<object>} Performance metrics
 */
async function measureComponentPerformance(specId, componentFn, options = {}) {
  const {
    iterations = 100,
    warmup = 10
  } = options;

  if (!specId || typeof specId !== 'string') {
    throw new Error('specId must be a non-empty string');
  }

  if (typeof componentFn !== 'function') {
    throw new Error('componentFn must be a function');
  }

  // Warmup
  for (let i = 0; i < warmup; i++) {
    await componentFn();
  }

  const timings = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    await componentFn();
    const endTime = Date.now();
    timings.push(endTime - startTime);
  }

  const avgTime = timings.reduce((sum, t) => sum + t, 0) / timings.length;
  const p50 = calculatePercentile(timings, 50);
  const p95 = calculatePercentile(timings, 95);
  const p99 = calculatePercentile(timings, 99);

  // Get target for this SPEC
  const target = getComponentTarget(specId);

  return {
    specId,
    iterations,
    avgTime,
    p50,
    p95,
    p99,
    target,
    passed: avgTime < target,
    measuredAt: new Date().toISOString()
  };
}

/**
 * Calculate percentile from timing array
 *
 * @param {Array<number>} timings - Array of timing measurements
 * @param {number} percentile - Percentile to calculate (0-100)
 * @returns {number} Percentile value
 * @private
 */
function calculatePercentile(timings, percentile) {
  const sorted = [...timings].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Get performance target for a component
 *
 * @param {string} specId - SPEC identifier
 * @returns {number} Target time in milliseconds
 * @private
 */
function getComponentTarget(specId) {
  const targets = {
    'SPEC-001': 2000,  // spec-init <2s
    'SPEC-002': 50,    // git notes <50ms
    'SPEC-003': 100,   // checkpoint <100ms
    'SPEC-004': 1000,  // phase gate <1s
    'SPEC-005': 5000,  // brownfield <5s
    'SPEC-006': 100,   // styleguides <100ms
    'SPEC-007': 10,    // metadata <10ms
    'SPEC-008': 500,   // analytics <500ms
    'SPEC-009': 1000,  // adaptive <1s
    'SPEC-010': 2000   // smart revert <2s
  };

  return targets[specId] || 1000; // Default 1s
}

/**
 * Measure memory usage for workflows
 *
 * @param {Function} workflowFn - Workflow function to measure
 * @param {object} options - Options with {count}
 * @returns {Promise<object>} Memory metrics
 */
async function measureMemoryUsage(workflowFn, options = {}) {
  const {
    count = 10
  } = options;

  if (typeof workflowFn !== 'function') {
    throw new Error('workflowFn must be a function');
  }

  const memBefore = process.memoryUsage();
  const snapshots = [];

  for (let i = 0; i < count; i++) {
    await workflowFn();

    const mem = process.memoryUsage();
    snapshots.push({
      iteration: i + 1,
      heapUsed: mem.heapUsed / 1024 / 1024,
      external: mem.external / 1024 / 1024,
      rss: mem.rss / 1024 / 1024
    });
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  const memAfter = process.memoryUsage();
  const heapGrowth = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

  return {
    count,
    snapshots,
    initialHeap: memBefore.heapUsed / 1024 / 1024,
    finalHeap: memAfter.heapUsed / 1024 / 1024,
    heapGrowth,
    target: 200, // <200MB for single workflow
    passed: heapGrowth < 50, // <50MB growth after count runs
    measuredAt: new Date().toISOString()
  };
}

/**
 * Generate performance report
 *
 * @param {object} metrics - Metrics object with {sequential, parallel, component, memory}
 * @returns {object} Report with summary and recommendations
 */
function generatePerformanceReport(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    throw new Error('metrics must be an object');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTests: 0,
      passed: 0,
      failed: 0
    },
    sequential: {},
    parallel: {},
    components: {},
    memory: {},
    recommendations: []
  };

  // Process sequential metrics
  if (metrics.sequential) {
    report.sequential = {
      avgTime: metrics.sequential.avgTime,
      target: metrics.sequential.target,
      passed: metrics.sequential.passed,
      status: metrics.sequential.passed ? 'PASS' : 'FAIL'
    };
    report.summary.totalTests++;
    if (metrics.sequential.passed) report.summary.passed++;
    else report.summary.failed++;

    if (!metrics.sequential.passed) {
      report.recommendations.push({
        category: 'sequential',
        issue: `Sequential workflow time (${metrics.sequential.avgTime}ms) exceeds target (${metrics.sequential.target}ms)`,
        suggestion: 'Optimize critical path operations or increase parallelism'
      });
    }
  }

  // Process parallel metrics
  if (metrics.parallel) {
    report.parallel = {
      avgTime: metrics.parallel.avgTime,
      target: metrics.parallel.target.time,
      memoryUsage: metrics.parallel.memoryUsage,
      memoryTarget: metrics.parallel.target.memory,
      passed: metrics.parallel.passed,
      status: metrics.parallel.passed ? 'PASS' : 'FAIL'
    };
    report.summary.totalTests++;
    if (metrics.parallel.passed) report.summary.passed++;
    else report.summary.failed++;

    if (!metrics.parallel.passed && metrics.parallel.memoryUsage > metrics.parallel.target.memory) {
      report.recommendations.push({
        category: 'parallel',
        issue: `Memory usage (${metrics.parallel.memoryUsage.toFixed(2)}MB) exceeds target (${metrics.parallel.target.memory}MB)`,
        suggestion: 'Implement lazy loading or reduce concurrent workflow count'
      });
    }
  }

  // Process component metrics
  if (metrics.components && Array.isArray(metrics.components)) {
    const componentResults = [];
    for (const comp of metrics.components) {
      componentResults.push({
        specId: comp.specId,
        avgTime: comp.avgTime,
        p95: comp.p95,
        target: comp.target,
        passed: comp.passed,
        status: comp.passed ? 'PASS' : 'FAIL'
      });
      report.summary.totalTests++;
      if (comp.passed) report.summary.passed++;
      else {
        report.summary.failed++;
        report.recommendations.push({
          category: 'component',
          issue: `${comp.specId} performance (${comp.avgTime.toFixed(2)}ms avg) exceeds target (${comp.target}ms)`,
          suggestion: `Optimize ${comp.specId} implementation or increase target`
        });
      }
    }
    report.components = componentResults;
  }

  // Process memory metrics
  if (metrics.memory) {
    report.memory = {
      heapGrowth: metrics.memory.heapGrowth,
      target: metrics.memory.target,
      passed: metrics.memory.passed,
      status: metrics.memory.passed ? 'PASS' : 'FAIL'
    };
    report.summary.totalTests++;
    if (metrics.memory.passed) report.summary.passed++;
    else {
      report.summary.failed++;
      report.recommendations.push({
        category: 'memory',
        issue: `Heap growth (${metrics.memory.heapGrowth.toFixed(2)}MB) exceeds threshold`,
        suggestion: 'Check for memory leaks or implement garbage collection hints'
      });
    }
  }

  // Add overall recommendation
  if (report.summary.failed > 0) {
    report.recommendations.unshift({
      category: 'overall',
      issue: `${report.summary.failed} performance tests failed`,
      suggestion: 'Address failed tests before production deployment'
    });
  }

  return report;
}

module.exports = {
  measureSequentialWorkflow,
  measureParallelWorkflow,
  measureComponentPerformance,
  measureMemoryUsage,
  generatePerformanceReport
};
