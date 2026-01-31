/**
 * ML Performance Benchmark Script
 * Measures latency for Pattern Detector, Cost Predictor, and Adaptive Executor
 */

const { PatternDetector } = require('./.claude/lib/ml/pattern-detector.cjs');
const { CostPredictor } = require('./.claude/lib/ml/cost-predictor.cjs');
const { AdaptiveExecutor } = require('./.claude/lib/ml/adaptive-executor.cjs');

function benchmarkPatternDetector() {
  const pd = new PatternDetector();
  const workflows = Array.from({ length: 100 }, (_, i) => ({
    id: `wf-${i}`,
    taskSequence: [{ agentType: 'developer' }, { agentType: 'qa' }, { agentType: 'developer' }],
  }));

  const start = Date.now();
  const patterns = pd.detectFrequentSequences(workflows);
  const duration = Date.now() - start;

  return {
    module: 'PatternDetector',
    duration,
    patternCount: patterns.length,
    averagePerWorkflow: duration / workflows.length,
    target: 100, // <100ms target
    status: duration < 100 ? 'PASS' : 'FAIL',
  };
}

function benchmarkCostPredictor() {
  const cp = new CostPredictor();
  const text = 'Hello, world! This is a test message for cost prediction.';
  const iterations = 1000;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    cp.calculateCost({
      input: text,
      output: text,
      model: 'claude-sonnet-4-20250514',
    });
  }
  const duration = Date.now() - start;

  return {
    module: 'CostPredictor',
    duration,
    iterations,
    averageLatency: duration / iterations,
    target: 50, // <50ms per estimation target
    status: duration / iterations < 50 ? 'PASS' : 'FAIL',
  };
}

function benchmarkAdaptiveExecutor() {
  const ae = new AdaptiveExecutor();
  const pattern = {
    type: 'independent',
    tasks: [{ id: 1 }, { id: 2 }, { id: 3 }],
  };
  const iterations = 1000;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    ae.selectStrategy(pattern);
  }
  const duration = Date.now() - start;

  return {
    module: 'AdaptiveExecutor',
    duration,
    iterations,
    averageLatency: duration / iterations,
    target: 200, // <200ms per optimization target
    status: duration / iterations < 200 ? 'PASS' : 'FAIL',
  };
}

function measureMemoryOverhead() {
  const baseline = process.memoryUsage().heapUsed;

  // Load all ML modules
  const pd = new PatternDetector();
  const cp = new CostPredictor();
  const _ae = new AdaptiveExecutor();

  // Populate with sample data
  const workflows = Array.from({ length: 100 }, (_, i) => ({
    id: `wf-${i}`,
    taskSequence: [{ agentType: 'developer' }, { agentType: 'qa' }],
  }));
  pd.detectFrequentSequences(workflows);

  for (let i = 0; i < 100; i++) {
    cp.calculateCost({
      input: 'test message',
      output: 'test message',
      model: 'claude-sonnet-4-20250514',
    });
  }

  const current = process.memoryUsage().heapUsed;
  const overheadBytes = current - baseline;
  const overheadMB = overheadBytes / 1024 / 1024;

  return {
    metric: 'ML Module Memory Overhead',
    baselineBytes: baseline,
    currentBytes: current,
    overheadBytes,
    overheadMB: overheadMB.toFixed(2),
    targetMB: 500,
    status: overheadMB < 500 ? 'PASS' : 'FAIL',
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('Phase 5 ML Performance Benchmark');
  console.log('='.repeat(60));
  console.log('');

  const results = [];

  // 1. Pattern Detector
  console.log('1. Pattern Detector (100 workflows)...');
  const pdResult = await benchmarkPatternDetector();
  results.push(pdResult);
  console.log(`   Duration: ${pdResult.duration}ms`);
  console.log(`   Patterns: ${pdResult.patternCount}`);
  console.log(`   Avg/workflow: ${pdResult.averagePerWorkflow.toFixed(2)}ms`);
  console.log(`   Status: ${pdResult.status} (target: <${pdResult.target}ms)`);
  console.log('');

  // 2. Cost Predictor
  console.log('2. Cost Predictor (1000 iterations)...');
  const cpResult = await benchmarkCostPredictor();
  results.push(cpResult);
  console.log(`   Duration: ${cpResult.duration}ms`);
  console.log(`   Avg latency: ${cpResult.averageLatency.toFixed(2)}ms`);
  console.log(`   Status: ${cpResult.status} (target: <${cpResult.target}ms)`);
  console.log('');

  // 3. Adaptive Executor
  console.log('3. Adaptive Executor (1000 iterations)...');
  const aeResult = await benchmarkAdaptiveExecutor();
  results.push(aeResult);
  console.log(`   Duration: ${aeResult.duration}ms`);
  console.log(`   Avg latency: ${aeResult.averageLatency.toFixed(2)}ms`);
  console.log(`   Status: ${aeResult.status} (target: <${aeResult.target}ms)`);
  console.log('');

  // 4. Memory Overhead
  console.log('4. Memory Overhead Measurement...');
  const memResult = await measureMemoryOverhead();
  results.push(memResult);
  console.log(`   Baseline: ${(memResult.baselineBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Current: ${(memResult.currentBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Overhead: ${memResult.overheadMB} MB`);
  console.log(`   Status: ${memResult.status} (target: <${memResult.targetMB}MB)`);
  console.log('');

  // Summary
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  const passed = results.filter(r => r.status === 'PASS').length;
  const total = results.length;
  console.log(`Tests Passed: ${passed}/${total}`);
  console.log(`Overall Status: ${passed === total ? '✅ ALL PASS' : '❌ SOME FAILED'}`);
  console.log('');

  // Output JSON for parsing
  console.log('JSON_RESULTS:');
  console.log(JSON.stringify({ results, summary: { passed, total } }, null, 2));

  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
