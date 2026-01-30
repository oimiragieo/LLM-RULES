/**
 * Phase 5: ML Pattern Recognition & Optimization
 *
 * Test Coverage: 66 tests across 5 categories
 * - Category 1: Pattern Detection (15 tests)
 * - Category 2: Cost Prediction (15 tests)
 * - Category 3: Adaptive Execution (14 tests)
 * - Category 4: Performance Profiling (12 tests)
 * - Category 5: Pattern Library (10 tests)
 */

const assert = require('assert');
const { describe, it, before, beforeEach, after } = require('node:test');

// =============================================================================
// Category 1: Pattern Detection (15 tests)
// =============================================================================
describe('Category 1: Pattern Detection', () => {
  let PatternDetector;
  let detector;

  before(async () => {
    const module = require('../.claude/lib/ml/pattern-detector.cjs');
    PatternDetector = module.PatternDetector || module.WorkflowPatternDetector;
  });

  beforeEach(() => {
    detector = new PatternDetector();
  });

  describe('Sequence Pattern Extraction', () => {
    it('should extract N-gram patterns from execution logs', () => {
      const logs = [
        { events: ['Read', 'Grep', 'Write', 'Bash'] },
        { events: ['Read', 'Grep', 'Edit', 'Bash'] },
        { events: ['Read', 'Grep', 'Write', 'Bash'] },
      ];
      const ngrams = detector.extractNgrams(logs, 2);
      assert.ok(Array.isArray(ngrams));
      assert.ok(ngrams.some(p => p.pattern.includes('Read') && p.pattern.includes('Grep')));
    });

    it('should detect sliding window patterns', () => {
      const events = ['A', 'B', 'C', 'A', 'B', 'D', 'A', 'B', 'C'];
      const patterns = detector.slidingWindowPatterns(events, 3);
      assert.ok(Array.isArray(patterns));
      const abcPattern = patterns.find(p => p.pattern.join(',') === 'A,B,C');
      assert.ok(abcPattern);
      assert.strictEqual(abcPattern.frequency, 2);
    });

    it('should handle empty event sequences', () => {
      const patterns = detector.slidingWindowPatterns([], 3);
      assert.strictEqual(patterns.length, 0);
    });

    it('should respect minimum frequency threshold', () => {
      const events = ['A', 'B', 'A', 'B', 'A', 'B', 'C', 'D'];
      const patterns = detector.slidingWindowPatterns(events, 2, { minFrequency: 2 });
      patterns.forEach(p => {
        assert.ok(p.frequency >= 2);
      });
    });
  });

  describe('Frequency Analysis', () => {
    it('should count pattern occurrences accurately', () => {
      const data = [
        { type: 'task', agent: 'developer' },
        { type: 'task', agent: 'developer' },
        { type: 'task', agent: 'qa' },
        { type: 'task', agent: 'developer' },
      ];
      const freq = detector.analyzeFrequency(data, 'agent');
      assert.strictEqual(freq.developer, 3);
      assert.strictEqual(freq.qa, 1);
    });

    it('should calculate frequency percentages', () => {
      const data = [{ type: 'A' }, { type: 'A' }, { type: 'B' }, { type: 'B' }];
      const freq = detector.analyzeFrequency(data, 'type', { asPercentage: true });
      assert.strictEqual(freq.A, 50);
      assert.strictEqual(freq.B, 50);
    });

    it('should sort by frequency descending', () => {
      const data = [
        { type: 'C' },
        { type: 'A' },
        { type: 'A' },
        { type: 'A' },
        { type: 'B' },
        { type: 'B' },
      ];
      const sorted = detector.topPatterns(data, 'type', 3);
      assert.strictEqual(sorted[0].value, 'A');
      assert.strictEqual(sorted[0].count, 3);
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect statistical outliers using Z-score', () => {
      const values = [10, 12, 11, 13, 10, 12, 100, 11, 12, 10];
      const anomalies = detector.detectAnomalies(values, { method: 'zscore', threshold: 2 });
      assert.ok(anomalies.includes(6)); // Index of 100
    });

    it('should detect anomalies using IQR method', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
      const anomalies = detector.detectAnomalies(values, { method: 'iqr', multiplier: 1.5 });
      assert.ok(anomalies.length > 0);
    });

    it('should return empty array for uniform data', () => {
      const values = [5, 5, 5, 5, 5];
      const anomalies = detector.detectAnomalies(values, { method: 'zscore', threshold: 2 });
      assert.strictEqual(anomalies.length, 0);
    });
  });

  describe('Pattern Clustering', () => {
    it('should cluster similar patterns together (k-means)', () => {
      const patterns = [
        { duration: 100, tokens: 1000 },
        { duration: 110, tokens: 1100 },
        { duration: 500, tokens: 5000 },
        { duration: 520, tokens: 5200 },
      ];
      const clusters = detector.clusterPatterns(patterns, 2);
      assert.strictEqual(clusters.length, 2);
    });

    it('should assign cluster labels to each pattern', () => {
      const patterns = [
        { duration: 100, tokens: 1000 },
        { duration: 110, tokens: 1100 },
        { duration: 500, tokens: 5000 },
      ];
      const labeled = detector.labelPatterns(patterns, 2);
      labeled.forEach(p => {
        assert.ok(typeof p.cluster === 'number');
      });
    });

    it('should calculate cluster centroids', () => {
      const patterns = [
        { duration: 100, tokens: 1000 },
        { duration: 200, tokens: 2000 },
      ];
      const clusters = detector.clusterPatterns(patterns, 1);
      assert.ok(clusters[0].centroid);
      assert.strictEqual(clusters[0].centroid.duration, 150);
      assert.strictEqual(clusters[0].centroid.tokens, 1500);
    });
  });
});

// =============================================================================
// Category 2: Cost Prediction (15 tests)
// =============================================================================
describe('Category 2: Cost Prediction', () => {
  let CostPredictor;
  let predictor;

  before(async () => {
    CostPredictor = require('../.claude/lib/ml/cost-predictor.cjs').CostPredictor;
  });

  beforeEach(() => {
    predictor = new CostPredictor();
  });

  describe('Token Estimation', () => {
    it('should estimate tokens from character count', () => {
      const text = 'Hello, this is a test message with some content.';
      const tokens = predictor.estimateTokens(text);
      // Approximate: ~4 chars per token
      assert.ok(tokens >= 10 && tokens <= 20);
    });

    it('should handle code with special characters', () => {
      const code = 'const x = { a: 1, b: [2, 3] };\nconsole.log(x);';
      const tokens = predictor.estimateTokens(code);
      assert.ok(tokens > 0);
    });

    it('should estimate tokens for array of messages', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const tokens = predictor.estimateConversationTokens(messages);
      assert.ok(tokens > 0);
    });

    it('should include overhead for system prompts', () => {
      const base = predictor.estimateTokens('Hello');
      const withSystem = predictor.estimateTokens('Hello', { includeSystemOverhead: true });
      assert.ok(withSystem > base);
    });
  });

  describe('Model Pricing Lookup', () => {
    it('should return pricing for known models', () => {
      const pricing = predictor.getModelPricing('claude-opus-4-5-20251101');
      assert.ok(pricing.inputPer1k);
      assert.ok(pricing.outputPer1k);
    });

    it('should return default pricing for unknown models', () => {
      const pricing = predictor.getModelPricing('unknown-model-xyz');
      assert.ok(pricing.inputPer1k);
      assert.ok(pricing.outputPer1k);
    });

    it('should list all available model pricings', () => {
      const models = predictor.listModelPricings();
      assert.ok(Array.isArray(models));
      assert.ok(models.length >= 3); // At least haiku, sonnet, opus
    });
  });

  describe('Cost Accumulation', () => {
    it('should calculate cost for single request', () => {
      const cost = predictor.calculateCost({
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
      });
      assert.ok(cost > 0);
      assert.ok(typeof cost === 'number');
    });

    it('should accumulate costs across multiple requests', () => {
      predictor.resetSession();
      predictor.addRequest({
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
      });
      predictor.addRequest({
        model: 'claude-sonnet-4-20250514',
        inputTokens: 2000,
        outputTokens: 1000,
      });
      const total = predictor.getSessionTotal();
      assert.ok(total > 0);
    });

    it('should track costs by model', () => {
      predictor.resetSession();
      predictor.addRequest({
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
      });
      predictor.addRequest({
        model: 'claude-haiku-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
      });
      const breakdown = predictor.getCostBreakdown();
      assert.ok(breakdown['claude-sonnet-4-20250514']);
      assert.ok(breakdown['claude-haiku-4-20250514']);
    });

    it('should forecast costs based on historical data', () => {
      const history = [
        { date: '2026-01-28', cost: 10 },
        { date: '2026-01-29', cost: 12 },
        { date: '2026-01-30', cost: 11 },
      ];
      const forecast = predictor.forecastCost(history, 7);
      assert.ok(forecast.predicted > 0);
      assert.ok(forecast.confidence >= 0 && forecast.confidence <= 1);
    });
  });

  describe('Accuracy Validation', () => {
    it('should validate prediction accuracy against actual', () => {
      const predicted = 1500;
      const actual = 1600;
      const accuracy = predictor.calculateAccuracy(predicted, actual);
      assert.ok(accuracy >= 0.9); // Within 10%
    });

    it('should track historical accuracy', () => {
      predictor.recordPrediction(1000, 1050);
      predictor.recordPrediction(2000, 1900);
      predictor.recordPrediction(500, 520);
      const avgAccuracy = predictor.getAverageAccuracy();
      assert.ok(avgAccuracy >= 0.9); // 90%+ accuracy
    });

    it('should warn when accuracy drops below threshold', () => {
      predictor.resetAccuracyTracking();
      predictor.recordPrediction(1000, 500); // 50% off
      predictor.recordPrediction(1000, 400); // 60% off
      const warnings = predictor.getAccuracyWarnings(0.8);
      assert.ok(warnings.length > 0);
    });
  });
});

// =============================================================================
// Category 3: Adaptive Execution (14 tests)
// =============================================================================
describe('Category 3: Adaptive Execution', () => {
  let AdaptiveExecutor;
  let executor;

  before(async () => {
    AdaptiveExecutor = require('../.claude/lib/ml/adaptive-executor.cjs').AdaptiveExecutor;
  });

  beforeEach(() => {
    executor = new AdaptiveExecutor();
  });

  describe('Pattern-Based Optimization', () => {
    it('should select optimization strategy based on pattern', () => {
      const pattern = { type: 'sequential', tasks: ['A', 'B', 'C'] };
      const strategy = executor.selectStrategy(pattern);
      assert.ok(strategy);
      assert.ok(['parallel', 'batch', 'cache', 'none'].includes(strategy.type));
    });

    it('should recommend parallelization for independent tasks', () => {
      const pattern = {
        type: 'independent',
        tasks: [
          { id: 'A', dependencies: [] },
          { id: 'B', dependencies: [] },
          { id: 'C', dependencies: [] },
        ],
      };
      const strategy = executor.selectStrategy(pattern);
      assert.strictEqual(strategy.type, 'parallel');
    });

    it('should recommend batching for repeated similar tasks', () => {
      const pattern = {
        type: 'repeated',
        tasks: [
          { id: 'Read1', operation: 'Read' },
          { id: 'Read2', operation: 'Read' },
          { id: 'Read3', operation: 'Read' },
        ],
      };
      const strategy = executor.selectStrategy(pattern);
      assert.strictEqual(strategy.type, 'batch');
    });

    it('should recommend caching for idempotent operations', () => {
      const pattern = {
        type: 'idempotent',
        operation: 'Grep',
        frequency: 10,
      };
      const strategy = executor.selectStrategy(pattern);
      assert.strictEqual(strategy.type, 'cache');
    });
  });

  describe('Model Selection Based on Patterns', () => {
    it('should recommend haiku for simple tasks', () => {
      const task = { complexity: 'low', tokenEstimate: 500, criticalPath: false };
      const model = executor.recommendModel(task);
      assert.ok(model.includes('haiku'));
    });

    it('should recommend sonnet for standard tasks', () => {
      const task = { complexity: 'medium', tokenEstimate: 5000, criticalPath: false };
      const model = executor.recommendModel(task);
      assert.ok(model.includes('sonnet'));
    });

    it('should recommend opus for complex reasoning', () => {
      const task = { complexity: 'high', tokenEstimate: 10000, criticalPath: true };
      const model = executor.recommendModel(task);
      assert.ok(model.includes('opus'));
    });

    it('should override based on historical success rate', () => {
      executor.recordOutcome('haiku', 'complex-task', false);
      executor.recordOutcome('haiku', 'complex-task', false);
      executor.recordOutcome('sonnet', 'complex-task', true);
      const model = executor.recommendModel({ complexity: 'low', taskType: 'complex-task' });
      assert.ok(!model.includes('haiku')); // Should avoid haiku for this task type
    });
  });

  describe('Parameter Adjustment', () => {
    it('should adjust timeout based on historical duration', () => {
      const history = [{ duration: 5000 }, { duration: 6000 }, { duration: 5500 }];
      const timeout = executor.adjustTimeout(history);
      assert.ok(timeout >= 5500 && timeout <= 12000); // Some buffer above average
    });

    it('should adjust concurrency based on resource usage', () => {
      const metrics = { cpuUsage: 0.3, memoryUsage: 0.4, activeConnections: 5 };
      const concurrency = executor.adjustConcurrency(metrics);
      assert.ok(concurrency >= 1 && concurrency <= 20);
    });

    it('should reduce parameters under high load', () => {
      const lowLoadConcurrency = executor.adjustConcurrency({ cpuUsage: 0.2, memoryUsage: 0.3 });
      const highLoadConcurrency = executor.adjustConcurrency({ cpuUsage: 0.9, memoryUsage: 0.8 });
      assert.ok(highLoadConcurrency < lowLoadConcurrency);
    });
  });

  describe('Learning Feedback Loop', () => {
    it('should record execution outcomes', () => {
      executor.recordExecution({
        taskId: '1',
        strategy: 'parallel',
        success: true,
        duration: 1000,
        cost: 0.05,
      });
      const history = executor.getExecutionHistory();
      assert.strictEqual(history.length, 1);
    });

    it('should update strategy weights based on outcomes', () => {
      executor.recordExecution({ strategy: 'parallel', success: true, duration: 500 });
      executor.recordExecution({ strategy: 'parallel', success: true, duration: 600 });
      executor.recordExecution({ strategy: 'batch', success: false, duration: 5000 });
      const weights = executor.getStrategyWeights();
      assert.ok(weights.parallel > weights.batch);
    });

    it('should recommend based on learned patterns', () => {
      // Train with positive outcomes for parallel
      for (let i = 0; i < 10; i++) {
        executor.recordExecution({
          patternType: 'multi-file',
          strategy: 'parallel',
          success: true,
          duration: 500,
        });
      }
      const recommendation = executor.recommendForPattern({ type: 'multi-file' });
      assert.strictEqual(recommendation.strategy, 'parallel');
    });
  });
});

// =============================================================================
// Category 4: Performance Profiling (12 tests)
// =============================================================================
describe('Category 4: Performance Profiling', () => {
  let PerformanceProfiler;
  let profiler;

  before(async () => {
    // Use the existing performance profiler or create extended version
    try {
      PerformanceProfiler =
        require('../.claude/lib/utils/performance-profiler.cjs').PerformanceProfiler;
    } catch (_e) {
      // Fallback to ML-specific profiler
      PerformanceProfiler =
        require('../.claude/lib/ml/performance-profiler.cjs').PerformanceProfiler;
    }
  });

  beforeEach(() => {
    profiler = new PerformanceProfiler();
  });

  describe('Bottleneck Identification', () => {
    it('should identify slow operations', () => {
      profiler.record('op1', { duration: 100 });
      profiler.record('op2', { duration: 5000 }); // Slow
      profiler.record('op3', { duration: 200 });
      const bottlenecks = profiler.identifyBottlenecks(1000);
      assert.ok(bottlenecks.some(b => b.operation === 'op2'));
    });

    it('should rank bottlenecks by impact', () => {
      profiler.record('op1', { duration: 2000, frequency: 10 });
      profiler.record('op2', { duration: 5000, frequency: 2 });
      profiler.record('op3', { duration: 1000, frequency: 50 });
      const bottlenecks = profiler.identifyBottlenecks(500);
      // op3 has highest total impact: 1000 * 50 = 50000
      assert.strictEqual(bottlenecks[0].operation, 'op3');
    });

    it('should suggest optimizations for bottlenecks', () => {
      profiler.record('Read', { duration: 3000, frequency: 20, category: 'io' });
      const bottlenecks = profiler.identifyBottlenecks(1000);
      const readBottleneck = bottlenecks.find(b => b.operation === 'Read');
      assert.ok(readBottleneck.suggestions);
      assert.ok(readBottleneck.suggestions.length > 0);
    });
  });

  describe('Latency Measurement', () => {
    it('should track p50 latency', () => {
      for (let i = 0; i < 100; i++) {
        profiler.record('op', { duration: i * 10 });
      }
      const stats = profiler.getLatencyStats('op');
      assert.ok(stats.p50 >= 400 && stats.p50 <= 600);
    });

    it('should track p95 latency', () => {
      for (let i = 0; i < 100; i++) {
        profiler.record('op', { duration: i * 10 });
      }
      const stats = profiler.getLatencyStats('op');
      assert.ok(stats.p95 >= 900);
    });

    it('should track p99 latency', () => {
      const values = Array(99).fill(100).concat([10000]); // One outlier
      values.forEach(v => profiler.record('op', { duration: v }));
      const stats = profiler.getLatencyStats('op');
      assert.ok(stats.p99 >= 9000);
    });
  });

  describe('Memory Tracking', () => {
    it('should track memory usage per operation', () => {
      profiler.record('op1', { memoryUsed: 1000000 });
      profiler.record('op2', { memoryUsed: 5000000 });
      const memory = profiler.getMemoryStats();
      assert.ok(memory.op1);
      assert.ok(memory.op2);
    });

    it('should detect memory growth trends', () => {
      for (let i = 0; i < 10; i++) {
        profiler.record('leaky-op', {
          memoryUsed: 1000000 * (i + 1),
          timestamp: Date.now() + i * 1000,
        });
      }
      const trend = profiler.detectMemoryTrend('leaky-op');
      assert.strictEqual(trend.direction, 'increasing');
    });

    it('should calculate average memory per operation', () => {
      profiler.record('op', { memoryUsed: 1000 });
      profiler.record('op', { memoryUsed: 2000 });
      profiler.record('op', { memoryUsed: 3000 });
      const avg = profiler.getAverageMemory('op');
      assert.strictEqual(avg, 2000);
    });
  });

  describe('Optimization Recommendations', () => {
    it('should generate recommendations based on profile', () => {
      profiler.record('Read', { duration: 5000, frequency: 100, category: 'io' });
      profiler.record('Grep', { duration: 3000, frequency: 50, category: 'search' });
      const recommendations = profiler.generateRecommendations();
      assert.ok(Array.isArray(recommendations));
      assert.ok(recommendations.length > 0);
    });

    it('should prioritize high-impact recommendations', () => {
      profiler.record('expensive-op', { duration: 10000, frequency: 100 });
      profiler.record('cheap-op', { duration: 10, frequency: 10 });
      const recommendations = profiler.generateRecommendations();
      assert.strictEqual(recommendations[0].operation, 'expensive-op');
    });

    it('should estimate potential savings', () => {
      profiler.record('op', { duration: 5000, frequency: 100 });
      const recommendations = profiler.generateRecommendations();
      assert.ok(recommendations[0].estimatedSavings);
      assert.ok(recommendations[0].estimatedSavings > 0);
    });
  });
});

// =============================================================================
// Category 5: Pattern Library (10 tests)
// =============================================================================
describe('Category 5: Pattern Library', () => {
  let PatternLibrary;
  let library;

  before(async () => {
    PatternLibrary = require('../.claude/lib/utils/pattern-library.cjs').PatternLibrary;
  });

  beforeEach(() => {
    library = new PatternLibrary({ persistence: false }); // In-memory for tests
  });

  describe('Pattern Storage and Retrieval', () => {
    it('should store new patterns', () => {
      const pattern = {
        name: 'parallel-reads',
        type: 'optimization',
        pattern: ['Read', 'Read', 'Read'],
        optimization: 'batch',
      };
      const id = library.store(pattern);
      assert.ok(id);
    });

    it('should retrieve stored patterns by ID', () => {
      const original = { name: 'test-pattern', type: 'workflow' };
      const id = library.store(original);
      const retrieved = library.get(id);
      assert.strictEqual(retrieved.name, original.name);
    });

    it('should search patterns by type', () => {
      library.store({ name: 'p1', type: 'workflow' });
      library.store({ name: 'p2', type: 'optimization' });
      library.store({ name: 'p3', type: 'workflow' });
      const workflows = library.findByType('workflow');
      assert.strictEqual(workflows.length, 2);
    });

    it('should search patterns by name', () => {
      library.store({ name: 'parallel-reads', type: 'optimization' });
      library.store({ name: 'parallel-writes', type: 'optimization' });
      library.store({ name: 'sequential-tasks', type: 'workflow' });
      const parallels = library.search('parallel');
      assert.strictEqual(parallels.length, 2);
    });
  });

  describe('Metadata Management', () => {
    it('should track pattern creation time', () => {
      const id = library.store({ name: 'test' });
      const pattern = library.get(id);
      assert.ok(pattern.metadata);
      assert.ok(pattern.metadata.createdAt);
    });

    it('should track pattern usage count', () => {
      const id = library.store({ name: 'test' });
      library.recordUsage(id);
      library.recordUsage(id);
      library.recordUsage(id);
      const pattern = library.get(id);
      assert.strictEqual(pattern.metadata.usageCount, 3);
    });

    it('should track success rate', () => {
      const id = library.store({ name: 'test' });
      library.recordOutcome(id, true);
      library.recordOutcome(id, true);
      library.recordOutcome(id, false);
      const pattern = library.get(id);
      assert.ok(pattern.metadata.successRate >= 0.6 && pattern.metadata.successRate <= 0.7);
    });
  });

  describe('Reusability Scoring', () => {
    it('should calculate reusability score', () => {
      const id = library.store({ name: 'popular-pattern', type: 'workflow' });
      for (let i = 0; i < 50; i++) {
        library.recordUsage(id);
        library.recordOutcome(id, Math.random() > 0.2);
      }
      const score = library.getReusabilityScore(id);
      assert.ok(score >= 0 && score <= 1);
    });

    it('should rank patterns by reusability', () => {
      const id1 = library.store({ name: 'popular' });
      const id2 = library.store({ name: 'unpopular' });
      for (let i = 0; i < 100; i++) library.recordUsage(id1);
      for (let i = 0; i < 5; i++) library.recordUsage(id2);
      const ranked = library.rankByReusability();
      assert.strictEqual(ranked[0].name, 'popular');
    });
  });

  describe('Library Statistics', () => {
    it('should return total pattern count', () => {
      library.store({ name: 'p1' });
      library.store({ name: 'p2' });
      library.store({ name: 'p3' });
      const stats = library.getStats();
      assert.strictEqual(stats.totalPatterns, 3);
    });

    it('should return patterns by type distribution', () => {
      library.store({ name: 'p1', type: 'workflow' });
      library.store({ name: 'p2', type: 'workflow' });
      library.store({ name: 'p3', type: 'optimization' });
      const stats = library.getStats();
      assert.strictEqual(stats.byType.workflow, 2);
      assert.strictEqual(stats.byType.optimization, 1);
    });
  });
});
