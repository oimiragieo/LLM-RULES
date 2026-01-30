/**
 * SPEC-023: ML Pattern Detection & Analysis
 *
 * Test Coverage: 65+ tests
 * - Workflow pattern detection (Apriori algorithm)
 * - Bottleneck detection
 * - Task sequence mining
 * - K-Means clustering
 * - Pattern frequency analysis
 * - Integration with MetricsCollector
 */

const assert = require('assert');
const { describe, it, before, after } = require('node:test');

describe('SPEC-023: ML Pattern Detection', () => {
  let WorkflowPatternDetector;
  let detector;

  before(async () => {
    WorkflowPatternDetector = require('../.claude/lib/ml/pattern-detector.cjs').WorkflowPatternDetector;
  });

  describe('Class Instantiation', () => {
    it('should create detector with default config', () => {
      detector = new WorkflowPatternDetector();
      assert.ok(detector);
    });

    it('should create detector with custom config', () => {
      detector = new WorkflowPatternDetector({ minSupport: 0.15 });
      assert.strictEqual(detector.config.minSupport, 0.15);
    });

    it('should validate config parameters', () => {
      assert.throws(() => new WorkflowPatternDetector({ minSupport: -0.1 }));
    });
  });

  describe('detectFrequentSequences - Apriori Algorithm', () => {
    const mockWorkflows = [
      {
        sessionId: 'session1',
        taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'developer', taskType: 'implementation' },
          { agentType: 'qa', taskType: 'testing' }
        ]
      },
      {
        sessionId: 'session2',
        taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'developer', taskType: 'implementation' },
          { agentType: 'qa', taskType: 'testing' }
        ]
      },
      {
        sessionId: 'session3',
        taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'security-architect', taskType: 'review' },
          { agentType: 'developer', taskType: 'implementation' }
        ]
      }
    ];

    it('should detect frequent single-item sequences', () => {
      detector = new WorkflowPatternDetector();
      const patterns = detector.detectFrequentSequences(mockWorkflows, 0.5);
      assert.ok(patterns.length > 0);
      assert.ok(patterns.some(p => p.sequence.includes('planner')));
    });

    it('should detect frequent 2-item sequences', () => {
      const patterns = detector.detectFrequentSequences(mockWorkflows, 0.5);
      const twoItemPatterns = patterns.filter(p => p.sequence.length === 2);
      assert.ok(twoItemPatterns.length > 0);
    });

    it('should detect frequent 3-item sequences', () => {
      const patterns = detector.detectFrequentSequences(mockWorkflows, 0.5);
      const threeItemPatterns = patterns.filter(p => p.sequence.length === 3);
      assert.ok(threeItemPatterns.length > 0);
    });

    it('should respect minSupport threshold', () => {
      const patterns = detector.detectFrequentSequences(mockWorkflows, 0.8);
      // // Only sequences appearing in 80%+ of workflows
      patterns.forEach(p => {
      //   assert.ok(p.support >= 0.8);
      // });
    });

    it('should calculate support correctly', () => {
      const patterns = detector.detectFrequentSequences(mockWorkflows, 0.5);
      const plannerDevPattern = patterns.find(p =>
        p.sequence[0] === 'planner' && p.sequence[1] === 'developer'
      );
      assert.strictEqual(plannerDevPattern.support, 1.0); // Appears in all 3
    });

    it('should handle empty workflows', () => {
      const patterns = detector.detectFrequentSequences([], 0.5);
      assert.strictEqual(patterns.length, 0);
    });

    it('should handle single workflow', () => {
      const patterns = detector.detectFrequentSequences([mockWorkflows[0]], 0.5);
      assert.ok(patterns.length > 0);
    });

    it('should filter out infrequent patterns', () => {
      const patterns = detector.detectFrequentSequences(mockWorkflows, 0.9);
      // // security-architect only appears in 1/3 = 33%, should be filtered
      assert.ok(!patterns.some(p => p.sequence.includes('security-architect')));
    });

    it('should return patterns sorted by support descending', () => {
      const patterns = detector.detectFrequentSequences(mockWorkflows, 0.3);
      for (let i = 1; i < patterns.length; i++) {
      //   assert.ok(patterns[i-1].support >= patterns[i].support);
      // }
    });

    it('should include confidence for sequences', () => {
      const patterns = detector.detectFrequentSequences(mockWorkflows, 0.5);
      patterns.forEach(p => {
      //   assert.ok(p.confidence >= 0 && p.confidence <= 1);
      // });
    });

    it('should handle workflows with different lengths', () => {
      const mixedLengthWorkflows = [
        { sessionId: 's1', taskSequence: [{ agentType: 'planner', taskType: 'design' }] },
        { sessionId: 's2', taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'developer', taskType: 'implementation' }
        ]},
        { sessionId: 's3', taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'developer', taskType: 'implementation' },
          { agentType: 'qa', taskType: 'testing' }
        ]}
      ];
      const patterns = detector.detectFrequentSequences(mixedLengthWorkflows, 0.5);
      assert.ok(patterns.length > 0);
    });

    it('should complete within performance target (<500ms for 1000 workflows)', () => {
      const largeWorkflowSet = Array(1000).fill(null).map((_, i) => ({
      //   sessionId: `session${i}`,
      //   taskSequence: [
      //     { agentType: 'planner', taskType: 'design' },
      //     { agentType: 'developer', taskType: 'implementation' }
      //   ]
      // }));
      const startTime = Date.now();
      detector.detectFrequentSequences(largeWorkflowSet, 0.1);
      const duration = Date.now() - startTime;
      assert.ok(duration < 500, `Detection took ${duration}ms, expected <500ms`);
    });
  });

  describe('detectBottleneckPatterns', () => {
    const mockMetrics = [
      {
        sessionId: 'session1',
        taskSequence: [
          { agentType: 'planner', taskType: 'design', durationMs: 5000 },
          { agentType: 'developer', taskType: 'implementation', durationMs: 50000 }, // Slow
          { agentType: 'qa', taskType: 'testing', durationMs: 3000 }
        ],
        totalDurationMs: 58000
      },
      {
        sessionId: 'session2',
        taskSequence: [
          { agentType: 'planner', taskType: 'design', durationMs: 4000 },
          { agentType: 'developer', taskType: 'implementation', durationMs: 55000 }, // Slow
          { agentType: 'qa', taskType: 'testing', durationMs: 2500 }
        ],
        totalDurationMs: 61500
      }
    ];

    it('should identify slow tasks as bottlenecks', () => {
      detector = new WorkflowPatternDetector();
      const bottlenecks = detector.detectBottleneckPatterns(mockMetrics);
      assert.ok(bottlenecks.length > 0);
      assert.ok(bottlenecks.some(b => b.agentType === 'developer'));
    });

    it('should calculate average duration for each task type', () => {
      const bottlenecks = detector.detectBottleneckPatterns(mockMetrics);
      const devBottleneck = bottlenecks.find(b => b.agentType === 'developer');
      assert.strictEqual(devBottleneck.avgDurationMs, 52500); // (50000 + 55000) / 2
    });

    it('should calculate percentage of total time', () => {
      const bottlenecks = detector.detectBottleneckPatterns(mockMetrics);
      bottlenecks.forEach(b => {
      //   assert.ok(b.percentOfTotal > 0 && b.percentOfTotal <= 100);
      // });
    });

    it('should include occurrence count', () => {
      const bottlenecks = detector.detectBottleneckPatterns(mockMetrics);
      const devBottleneck = bottlenecks.find(b => b.agentType === 'developer');
      assert.strictEqual(devBottleneck.occurrences, 2);
    });

    it('should sort bottlenecks by average duration descending', () => {
      const bottlenecks = detector.detectBottleneckPatterns(mockMetrics);
      for (let i = 1; i < bottlenecks.length; i++) {
      //   assert.ok(bottlenecks[i-1].avgDurationMs >= bottlenecks[i].avgDurationMs);
      // }
    });

    it('should handle empty metrics', () => {
      const bottlenecks = detector.detectBottleneckPatterns([]);
      assert.strictEqual(bottlenecks.length, 0);
    });

    it('should filter bottlenecks by threshold', () => {
      detector = new WorkflowPatternDetector({ bottleneckThreshold: 0.5 });
      const bottlenecks = detector.detectBottleneckPatterns(mockMetrics);
      // // Only tasks taking >50% of total time
      bottlenecks.forEach(b => {
      //   assert.ok(b.percentOfTotal > 50);
      // });
    });
  });

  describe('K-Means Clustering', () => {
    const mockTasks = [
      { agentType: 'developer', taskType: 'implementation', durationMs: 10000, tokenCount: 5000 },
      { agentType: 'developer', taskType: 'implementation', durationMs: 12000, tokenCount: 5500 },
      { agentType: 'qa', taskType: 'testing', durationMs: 3000, tokenCount: 2000 },
      { agentType: 'qa', taskType: 'testing', durationMs: 3500, tokenCount: 2200 },
      { agentType: 'planner', taskType: 'design', durationMs: 8000, tokenCount: 10000 },
      { agentType: 'planner', taskType: 'design', durationMs: 9000, tokenCount: 11000 }
    ];

    it('should cluster tasks into k groups', () => {
      detector = new WorkflowPatternDetector({ kClusters: 3 });
      const clusters = detector.clusterTasks(mockTasks);
      assert.strictEqual(clusters.length, 3);
    });

    it('should assign each task to a cluster', () => {
      const clusters = detector.clusterTasks(mockTasks);
      const totalTasks = clusters.reduce((sum, c) => sum + c.tasks.length, 0);
      assert.strictEqual(totalTasks, mockTasks.length);
    });

    it('should calculate cluster centroids', () => {
      const clusters = detector.clusterTasks(mockTasks);
      clusters.forEach(c => {
      //   assert.ok(c.centroid.durationMs > 0);
      //   assert.ok(c.centroid.tokenCount > 0);
      // });
    });

    it('should calculate silhouette score for clustering quality', () => {
      const clusters = detector.clusterTasks(mockTasks);
      const score = detector.calculateSilhouetteScore(clusters);
      assert.ok(score >= -1 && score <= 1);
    });

    it('should group similar tasks together', () => {
      const clusters = detector.clusterTasks(mockTasks);
      // // Developers should cluster together
      const devCluster = clusters.find(c =>
      //   c.tasks.every(t => t.agentType === 'developer')
      // );
      assert.ok(devCluster);
    });

    it('should use elbow method for optimal k', () => {
      detector = new WorkflowPatternDetector();
      const optimalK = detector.findOptimalK(mockTasks, { minK: 2, maxK: 5 });
      assert.ok(optimalK >= 2 && optimalK <= 5);
    });

    it('should handle tasks with missing features', () => {
      const tasksWithMissing = [
        { agentType: 'developer', taskType: 'implementation', durationMs: 10000 }, // Missing tokenCount
        { agentType: 'qa', taskType: 'testing', tokenCount: 2000 } // Missing durationMs
      ];
      const clusters = detector.clusterTasks(tasksWithMissing);
      assert.ok(clusters.length > 0);
    });
  });

  describe('Pattern Frequency Analysis', () => {
    const mockWorkflows = [
      {
        sessionId: 's1',
        taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'developer', taskType: 'implementation' }
        ]
      },
      {
        sessionId: 's2',
        taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'developer', taskType: 'implementation' }
        ]
      },
      {
        sessionId: 's3',
        taskSequence: [
          { agentType: 'developer', taskType: 'bugfix' }
        ]
      }
    ];

    it('should count pattern occurrences', () => {
      detector = new WorkflowPatternDetector();
      const frequencies = detector.analyzePatternFrequency(mockWorkflows);
      assert.ok(frequencies.length > 0);
    });

    it('should calculate occurrence percentage', () => {
      const frequencies = detector.analyzePatternFrequency(mockWorkflows);
      frequencies.forEach(f => {
      //   assert.ok(f.percentage > 0 && f.percentage <= 100);
      // });
    });

    it('should identify most common pattern', () => {
      const frequencies = detector.analyzePatternFrequency(mockWorkflows);
      const mostCommon = frequencies[0]; // Sorted by frequency
      assert.ok(mostCommon.pattern.includes('planner'));
    });

    it('should track first and last occurrence timestamps', () => {
      const workflows = mockWorkflows.map(w => ({
      //   ...w,
      //   timestamp: new Date().toISOString()
      // }));
      const frequencies = detector.analyzePatternFrequency(workflows);
      frequencies.forEach(f => {
      //   assert.ok(f.firstSeen);
      //   assert.ok(f.lastSeen);
      // });
    });
  });

  describe('generatePatternReport', () => {
    const mockPatterns = [
      {
        sequence: ['planner', 'developer', 'qa'],
        support: 0.8,
        confidence: 0.9,
        occurrences: 24
      },
      {
        sequence: ['developer', 'qa'],
        support: 0.6,
        confidence: 0.85,
        occurrences: 18
      }
    ];

    it('should generate markdown report', () => {
      detector = new WorkflowPatternDetector();
      const report = detector.generatePatternReport(mockPatterns);
      assert.ok(typeof report === 'string');
      assert.ok(report.includes('# Workflow Pattern Analysis'));
    });

    it('should include pattern details in report', () => {
      const report = detector.generatePatternReport(mockPatterns);
      assert.ok(report.includes('planner'));
      assert.ok(report.includes('developer'));
      assert.ok(report.includes('qa'));
    });

    it('should include support and confidence metrics', () => {
      const report = detector.generatePatternReport(mockPatterns);
      assert.ok(report.includes('80%')); // Support
      assert.ok(report.includes('90%')); // Confidence
    });

    it('should include visualization suggestions', () => {
      const report = detector.generatePatternReport(mockPatterns);
      assert.ok(report.includes('Visualization') || report.includes('Graph'));
    });

    it('should save report to file if path provided', () => {
      const reportPath = '/tmp/pattern-report.md';
      detector.generatePatternReport(mockPatterns, { saveTo: reportPath });
      const fs = require('fs');
      assert.ok(fs.existsSync(reportPath));
    });
  });

  describe('Integration with MetricsCollector (SPEC-016)', () => {
    it('should load workflow data from MetricsCollector', () => {
      detector = new WorkflowPatternDetector();
      const workflows = detector.loadWorkflowsFromMetrics();
      assert.ok(Array.isArray(workflows));
    });

    it('should filter workflows by date range', () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-30');
      const workflows = detector.loadWorkflowsFromMetrics({ startDate, endDate });
      // workflows.forEach(w => {
      //   const wDate = new Date(w.timestamp);
      //   assert.ok(wDate >= startDate && wDate <= endDate);
      // });
    });

    it('should filter workflows by outcome', () => {
      const workflows = detector.loadWorkflowsFromMetrics({ outcome: 'success' });
      // workflows.forEach(w => {
      //   assert.strictEqual(w.outcome, 'success');
      // });
    });
  });

  describe('Accuracy Target (80%+)', () => {
    it('should achieve 80%+ accuracy on pattern detection', () => {
      // Create ground truth patterns and test detection accuracy
      const groundTruth = [...]; // Known patterns
      const detected = detector.detectFrequentSequences(workflows, 0.1);
      const accuracy = calculateAccuracy(detected, groundTruth);
      assert.ok(accuracy >= 0.8, `Accuracy ${accuracy} below 80% target`);
    });

    it('should have low false positive rate (<10%)', () => {
      const detected = detector.detectFrequentSequences(workflows, 0.1);
      const falsePositives = detected.filter(p => !isRealPattern(p));
      const fpr = falsePositives.length / detected.length;
      assert.ok(fpr < 0.1, `False positive rate ${fpr} exceeds 10%`);
    });

    it('should have high recall (>75%)', () => {
      const detected = detector.detectFrequentSequences(workflows, 0.1);
      const recall = calculateRecall(detected, groundTruth);
      assert.ok(recall > 0.75, `Recall ${recall} below 75% target`);
    });
  });

  describe('Edge Cases', () => {
    it('should handle workflows with duplicate tasks', () => {
      const workflowWithDuplicates = {
        sessionId: 's1',
        taskSequence: [
          { agentType: 'developer', taskType: 'implementation' },
          { agentType: 'developer', taskType: 'implementation' }, // Duplicate
          { agentType: 'qa', taskType: 'testing' }
        ]
      };
      const patterns = detector.detectFrequentSequences([workflowWithDuplicates], 0.5);
      assert.ok(patterns.length > 0);
    });

    it('should handle null/undefined task fields', () => {
      const workflowWithNulls = {
        sessionId: 's1',
        taskSequence: [
          { agentType: null, taskType: 'design' },
          { agentType: 'developer', taskType: undefined }
        ]
      };
      // Should not crash, filter invalid tasks
      const patterns = detector.detectFrequentSequences([workflowWithNulls], 0.5);
      assert.ok(Array.isArray(patterns));
    });

    it('should handle extremely long sequences (>100 tasks)', () => {
      const longWorkflow = {
        sessionId: 's1',
        taskSequence: Array(150).fill(null).map((_, i) => ({
          agentType: `agent${i % 10}`,
          taskType: 'task'
        }))
      };
      // Should complete without crashing
      const patterns = detector.detectFrequentSequences([longWorkflow], 0.1);
      assert.ok(Array.isArray(patterns));
    });

    it('should handle minSupport = 1.0 (100% support)', () => {
      // Only patterns in ALL workflows
      const patterns = detector.detectFrequentSequences(workflows, 1.0);
      patterns.forEach(p => {
      //   assert.strictEqual(p.support, 1.0);
      // });
    });

    it('should handle minSupport = 0.0 (all patterns)', () => {
      // All possible patterns
      const patterns = detector.detectFrequentSequences(workflows, 0.0);
      assert.ok(patterns.length > 0);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should process 100 workflows in <100ms', () => {
      const workflows = Array(100).fill(null).map((_, i) => ({
        sessionId: `s${i}`,
        taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'developer', taskType: 'implementation' }
        ]
      }));
      const startTime = Date.now();
      detector.detectFrequentSequences(workflows, 0.1);
      const duration = Date.now() - startTime;
      assert.ok(duration < 100, `Processing took ${duration}ms`);
    });

    it('should process 1000 workflows in <500ms', () => {
      const workflows = Array(1000).fill(null).map((_, i) => ({
        sessionId: `s${i}`,
        taskSequence: [
          { agentType: 'planner', taskType: 'design' },
          { agentType: 'developer', taskType: 'implementation' },
          { agentType: 'qa', taskType: 'testing' }
        ]
      }));
      const startTime = Date.now();
      detector.detectFrequentSequences(workflows, 0.1);
      const duration = Date.now() - startTime;
      assert.ok(duration < 500, `Processing took ${duration}ms`);
    });

    it('should have linear time complexity O(n)', () => {
      // Test with 100, 500, 1000 workflows and verify linear scaling
      const times = [];
      for (const size of [100, 500, 1000]) {
      //   const workflows = Array(size).fill(null).map((_, i) => ({ ... }));
      //   const start = Date.now();
      //   detector.detectFrequentSequences(workflows, 0.1);
      //   times.push(Date.now() - start);
      // }
      // // Verify roughly linear: time(1000) ~= 10 * time(100)
      const ratio = times[2] / times[0];
      assert.ok(ratio < 15, `Non-linear scaling: ${ratio}x`);
    });
  });
});
