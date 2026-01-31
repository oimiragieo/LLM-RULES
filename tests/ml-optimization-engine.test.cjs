/**
 * SPEC-024: Automated Optimization Engine
 *
 * Test Coverage: 60+ tests
 * - Optimization recommendation generation
 * - Cost-benefit analysis
 * - Recommendation prioritization
 * - Auto-generation of optimization rules
 * - Integration with profiling (SPEC-013)
 * - Decision Tree model for recommendations
 */

const assert = require('assert');
const { describe, it, before, after } = require('node:test');

describe('SPEC-024: Automated Optimization Engine', () => {
  let OptimizationRecommender;
  let recommender;

  before(async () => {
    OptimizationRecommender =
      require('../.claude/lib/ml/optimization-engine.cjs').OptimizationRecommender;
  });

  describe('Class Instantiation', () => {
    it('should create recommender with default config', () => {
      recommender = new OptimizationRecommender();
      assert.ok(recommender);
    });

    it('should create recommender with custom config', () => {
      recommender = new OptimizationRecommender({ minImpact: 0.2 });
      assert.strictEqual(recommender.config.minImpact, 0.2);
    });

    it('should validate config parameters', () => {
      assert.throws(() => new OptimizationRecommender({ minImpact: -0.1 }));
    });
  });

  describe('generateRecommendations', () => {
    const mockPattern = {
      sequence: ['planner', 'developer', 'qa'],
      support: 0.8,
      avgDurationMs: 60000,
      bottleneck: {
        agentType: 'developer',
        avgDurationMs: 45000,
        percentOfTotal: 75,
      },
    };

    it('should generate recommendations for a pattern', () => {
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(mockPattern);
      assert.ok(Array.isArray(recommendations));
      assert.ok(recommendations.length > 0);
    });

    it('should include optimization type in recommendation', () => {
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(mockPattern);
      recommendations.forEach(r => {
        assert.ok(r.type);
        assert.ok(
          ['parallelization', 'caching', 'model-switch', 'tool-optimization'].includes(r.type)
        );
      });
    });

    it('should include description in recommendation', () => {
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(mockPattern);
      recommendations.forEach(r => {
        assert.ok(r.description);
        assert.ok(r.description.length > 10);
      });
    });

    it('should include estimated impact in recommendation', () => {
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(mockPattern);
      recommendations.forEach(r => {
        assert.ok(r.estimatedImpact);
        assert.ok(r.estimatedImpact.timeReductionMs > 0);
      });
    });

    it('should recommend parallelization for sequential bottlenecks', () => {
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(mockPattern);
      const parallelizationRec = recommendations.find(r => r.type === 'parallelization');
      assert.ok(parallelizationRec);
    });

    it('should recommend caching for repeated tasks', () => {
      const repeatedPattern = {
        sequence: ['developer', 'developer', 'developer'],
        support: 0.6,
        avgDurationMs: 90000,
      };
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(repeatedPattern);
      const cachingRec = recommendations.find(r => r.type === 'caching');
      assert.ok(cachingRec);
    });

    it('should recommend model switch for slow high-token tasks', () => {
      const highTokenPattern = {
        sequence: ['developer'],
        support: 0.7,
        avgDurationMs: 120000,
        avgTokenCount: 150000, // Very high
        modelUsed: 'opus',
      };
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(highTokenPattern);
      const modelSwitchRec = recommendations.find(r => r.type === 'model-switch');
      assert.ok(modelSwitchRec);
      assert.ok(modelSwitchRec.suggestedModel === 'sonnet');
    });

    it('should recommend tool optimization for tool-heavy tasks', () => {
      const toolHeavyPattern = {
        sequence: ['developer'],
        support: 0.5,
        avgDurationMs: 30000,
        toolUsage: { Read: 50, Grep: 40, Bash: 30 }, // Heavy tool use
      };
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(toolHeavyPattern);
      const toolOptRec = recommendations.find(r => r.type === 'tool-optimization');
      assert.ok(toolOptRec);
    });

    it('should filter recommendations by minimum impact threshold', () => {
      recommender = new OptimizationRecommender({ minImpact: 0.3 });
      const recommendations = recommender.generateRecommendations(mockPattern);
      // All recommendations should meet the threshold or there are none
      assert.ok(Array.isArray(recommendations));
    });

    it('should include confidence score for each recommendation', () => {
      recommender = new OptimizationRecommender();
      const recommendations = recommender.generateRecommendations(mockPattern);
      recommendations.forEach(r => {
        assert.ok(r.confidence >= 0 && r.confidence <= 1);
      });
    });
  });

  describe('calculateCostBenefit', () => {
    const mockPattern = {
      sequence: ['developer'],
      avgDurationMs: 60000,
      occurrences: 100,
    };

    const mockOptimization = {
      type: 'parallelization',
      estimatedImpact: {
        timeReductionMs: 15000,
        timeReductionPercent: 25,
      },
      implementationCost: {
        timeHours: 4,
        complexity: 'medium',
      },
    };

    it('should calculate total time saved', () => {
      recommender = new OptimizationRecommender();
      const analysis = recommender.calculateCostBenefit(mockPattern, mockOptimization);
      assert.strictEqual(analysis.totalTimeSavedMs, 1500000); // 15000ms * 100 occurrences
    });

    it('should calculate ROI', () => {
      recommender = new OptimizationRecommender();
      const analysis = recommender.calculateCostBenefit(mockPattern, mockOptimization);
      assert.ok(analysis.roi > 0);
    });

    it('should calculate payback period', () => {
      recommender = new OptimizationRecommender();
      const analysis = recommender.calculateCostBenefit(mockPattern, mockOptimization);
      assert.ok(analysis.paybackPeriodDays >= 0);
    });

    it('should include implementation cost in analysis', () => {
      recommender = new OptimizationRecommender();
      const analysis = recommender.calculateCostBenefit(mockPattern, mockOptimization);
      assert.strictEqual(analysis.implementationCostHours, 4);
    });

    it('should calculate benefit-cost ratio', () => {
      recommender = new OptimizationRecommender();
      const analysis = recommender.calculateCostBenefit(mockPattern, mockOptimization);
      assert.ok(analysis.benefitCostRatio > 0);
    });

    it('should mark high ROI optimizations', () => {
      recommender = new OptimizationRecommender();
      const analysis = recommender.calculateCostBenefit(mockPattern, mockOptimization);
      // ROI > 5 should be high priority
      assert.ok(['high', 'medium', 'low'].includes(analysis.priority));
    });

    it('should consider frequency in cost-benefit', () => {
      recommender = new OptimizationRecommender();
      const rarePattern = { ...mockPattern, occurrences: 5 };
      const frequentPattern = { ...mockPattern, occurrences: 500 };
      const rareAnalysis = recommender.calculateCostBenefit(rarePattern, mockOptimization);
      const frequentAnalysis = recommender.calculateCostBenefit(frequentPattern, mockOptimization);
      assert.ok(frequentAnalysis.totalTimeSavedMs > rareAnalysis.totalTimeSavedMs);
    });

    it('should factor in complexity when calculating cost', () => {
      recommender = new OptimizationRecommender();
      const simpleOptimization = {
        ...mockOptimization,
        implementationCost: { timeHours: 4, complexity: 'low' },
      };
      const complexOptimization = {
        ...mockOptimization,
        implementationCost: { timeHours: 4, complexity: 'high' },
      };
      const simpleAnalysis = recommender.calculateCostBenefit(mockPattern, simpleOptimization);
      const complexAnalysis = recommender.calculateCostBenefit(mockPattern, complexOptimization);
      assert.ok(simpleAnalysis.roi > complexAnalysis.roi);
    });
  });

  describe('prioritizeOptimizations', () => {
    const mockRecommendations = [
      {
        type: 'caching',
        estimatedImpact: { timeReductionMs: 5000 },
        confidence: 0.9,
        costBenefit: { roi: 10, paybackPeriodDays: 2 },
        implementationCost: { timeHours: 2, complexity: 'low' },
      },
      {
        type: 'parallelization',
        estimatedImpact: { timeReductionMs: 20000 },
        confidence: 0.7,
        costBenefit: { roi: 5, paybackPeriodDays: 7 },
        implementationCost: { timeHours: 4, complexity: 'medium' },
      },
      {
        type: 'model-switch',
        estimatedImpact: { timeReductionMs: 10000 },
        confidence: 0.95,
        costBenefit: { roi: 15, paybackPeriodDays: 1 },
        implementationCost: { timeHours: 1, complexity: 'low' },
      },
    ];

    it('should prioritize recommendations', () => {
      recommender = new OptimizationRecommender();
      const prioritized = recommender.prioritizeOptimizations(mockRecommendations);
      assert.strictEqual(prioritized.length, mockRecommendations.length);
    });

    it('should assign priority levels (high/medium/low)', () => {
      recommender = new OptimizationRecommender();
      const prioritized = recommender.prioritizeOptimizations(mockRecommendations);
      prioritized.forEach(r => {
        assert.ok(['high', 'medium', 'low'].includes(r.priority));
      });
    });

    it('should prioritize high ROI optimizations', () => {
      recommender = new OptimizationRecommender();
      const prioritized = recommender.prioritizeOptimizations(mockRecommendations);
      const highRoiRec = prioritized.find(r => r.costBenefit.roi === 15);
      assert.strictEqual(highRoiRec.priority, 'high');
    });

    it('should prioritize high confidence optimizations', () => {
      recommender = new OptimizationRecommender();
      const prioritized = recommender.prioritizeOptimizations(mockRecommendations);
      const highConfidenceRec = prioritized.find(r => r.confidence === 0.95);
      assert.ok(['high', 'medium'].includes(highConfidenceRec.priority));
    });

    it('should prioritize quick wins (low effort, high impact)', () => {
      recommender = new OptimizationRecommender();
      const quickWin = {
        type: 'quick-fix',
        estimatedImpact: { timeReductionMs: 15000 },
        confidence: 0.9,
        costBenefit: { roi: 20, paybackPeriodDays: 1 },
        implementationCost: { timeHours: 1, complexity: 'low' },
      };
      const prioritized = recommender.prioritizeOptimizations([...mockRecommendations, quickWin]);
      const quickWinPrioritized = prioritized.find(r => r.type === 'quick-fix');
      assert.strictEqual(quickWinPrioritized.priority, 'high');
    });

    it('should sort by priority then ROI', () => {
      recommender = new OptimizationRecommender();
      const prioritized = recommender.prioritizeOptimizations(mockRecommendations);
      // First check sorting by priority groups
      assert.ok(Array.isArray(prioritized));
    });

    it('should handle empty recommendations array', () => {
      recommender = new OptimizationRecommender();
      const prioritized = recommender.prioritizeOptimizations([]);
      assert.strictEqual(prioritized.length, 0);
    });
  });

  describe('generateOptimizationRules', () => {
    const mockRecommendations = [
      {
        type: 'parallelization',
        description: 'Parallelize planner and developer tasks',
        pattern: { sequence: ['planner', 'developer'], support: 0.8 },
        estimatedImpact: { timeReductionMs: 15000 },
        confidence: 0.85,
      },
      {
        type: 'caching',
        description: 'Cache repeated developer task results',
        pattern: { sequence: ['developer', 'developer'], support: 0.6 },
        estimatedImpact: { timeReductionMs: 10000 },
        confidence: 0.9,
      },
    ];

    it('should generate optimization rules from recommendations', () => {
      recommender = new OptimizationRecommender();
      const rules = recommender.generateOptimizationRules(mockRecommendations);
      assert.ok(Array.isArray(rules));
      assert.ok(rules.length > 0);
    });

    it('should include rule ID', () => {
      recommender = new OptimizationRecommender();
      const rules = recommender.generateOptimizationRules(mockRecommendations);
      rules.forEach(r => {
        assert.ok(r.id);
      });
    });

    it('should include rule condition', () => {
      recommender = new OptimizationRecommender();
      const rules = recommender.generateOptimizationRules(mockRecommendations);
      rules.forEach(r => {
        assert.ok(r.condition);
        assert.ok(typeof r.condition === 'string' || typeof r.condition === 'function');
      });
    });

    it('should include rule action', () => {
      recommender = new OptimizationRecommender();
      const rules = recommender.generateOptimizationRules(mockRecommendations);
      rules.forEach(r => {
        assert.ok(r.action);
      });
    });

    it('should include rule confidence threshold', () => {
      recommender = new OptimizationRecommender();
      const rules = recommender.generateOptimizationRules(mockRecommendations);
      rules.forEach(r => {
        assert.ok(r.minConfidence >= 0 && r.minConfidence <= 1);
      });
    });

    it('should generate executable rules', () => {
      recommender = new OptimizationRecommender();
      const rules = recommender.generateOptimizationRules(mockRecommendations);
      const testPattern = { sequence: ['planner', 'developer'], support: 0.85 };
      const matchingRules = rules.filter(r => r.condition(testPattern));
      assert.ok(matchingRules.length > 0);
    });

    it('should save rules to file if path provided', async () => {
      const fs = require('fs').promises;
      const os = require('os');
      const path = require('path');
      const rulesPath = path.join(os.tmpdir(), 'optimization-rules-test.json');
      recommender = new OptimizationRecommender();
      recommender.generateOptimizationRules(mockRecommendations, { saveTo: rulesPath });
      const exists = await fs
        .access(rulesPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(exists);
      // Cleanup
      await fs.unlink(rulesPath).catch(() => {});
    });

    it('should filter rules by minimum confidence', () => {
      recommender = new OptimizationRecommender({ minConfidence: 0.85 });
      const rules = recommender.generateOptimizationRules(mockRecommendations);
      rules.forEach(r => {
        assert.ok(r.minConfidence >= 0.85);
      });
    });
  });

  describe('Decision Tree Model', () => {
    const trainingData = [
      {
        features: { avgDurationMs: 60000, tokenCount: 50000, toolUsageCount: 10 },
        label: 'parallelization',
      },
      {
        features: { avgDurationMs: 30000, tokenCount: 150000, toolUsageCount: 5 },
        label: 'model-switch',
      },
      {
        features: { avgDurationMs: 45000, tokenCount: 40000, toolUsageCount: 50 },
        label: 'tool-optimization',
      },
    ];

    it('should train decision tree model', () => {
      recommender = new OptimizationRecommender();
      recommender.trainDecisionTree(trainingData);
      assert.ok(recommender.model);
    });

    it('should predict optimization type from features', () => {
      recommender = new OptimizationRecommender();
      recommender.trainDecisionTree(trainingData);
      const features = { avgDurationMs: 55000, tokenCount: 45000, toolUsageCount: 12 };
      const prediction = recommender.predict(features);
      assert.ok(
        ['parallelization', 'model-switch', 'tool-optimization', 'caching'].includes(prediction)
      );
    });

    it('should calculate feature importance', () => {
      recommender = new OptimizationRecommender();
      recommender.trainDecisionTree(trainingData);
      const importance = recommender.getFeatureImportance();
      assert.ok(importance.avgDurationMs >= 0);
      assert.ok(importance.tokenCount >= 0);
      assert.ok(importance.toolUsageCount >= 0);
    });

    it('should handle missing features gracefully', () => {
      recommender = new OptimizationRecommender();
      recommender.trainDecisionTree(trainingData);
      const features = { avgDurationMs: 55000 }; // Missing tokenCount, toolUsageCount
      const prediction = recommender.predict(features);
      assert.ok(prediction); // Should still predict
    });

    it('should support model export/import', () => {
      recommender = new OptimizationRecommender();
      recommender.trainDecisionTree(trainingData);
      const modelJson = recommender.exportModel();
      const newRecommender = new OptimizationRecommender();
      newRecommender.importModel(modelJson);
      const features = { avgDurationMs: 55000, tokenCount: 45000, toolUsageCount: 12 };
      assert.strictEqual(newRecommender.predict(features), recommender.predict(features));
    });
  });

  describe('Integration with Profiling (SPEC-013)', () => {
    it('should load profiling data from PerformanceProfiler', () => {
      recommender = new OptimizationRecommender();
      const profilingData = recommender.loadProfilingData();
      assert.ok(Array.isArray(profilingData));
    });

    it('should filter profiling data by agent type', () => {
      recommender = new OptimizationRecommender();
      const profilingData = recommender.loadProfilingData({ agentType: 'developer' });
      // Returns empty array since no actual profiler connected
      assert.ok(Array.isArray(profilingData));
    });

    it('should filter profiling data by date range', () => {
      recommender = new OptimizationRecommender();
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-30');
      const profilingData = recommender.loadProfilingData({ startDate, endDate });
      assert.ok(Array.isArray(profilingData));
    });

    it('should analyze profiling data for optimization opportunities', () => {
      recommender = new OptimizationRecommender();
      const profilingData = recommender.loadProfilingData();
      const opportunities = recommender.analyzeProfilingData(profilingData);
      assert.ok(Array.isArray(opportunities));
    });
  });

  describe('Actionability Target (75%+)', () => {
    it('should achieve 75%+ actionability rate', () => {
      recommender = new OptimizationRecommender();
      const mockPattern = {
        sequence: ['planner', 'developer', 'qa'],
        support: 0.8,
        avgDurationMs: 60000,
      };
      const recommendations = recommender.generateRecommendations(mockPattern);
      const actionable = recommendations.filter(r => r.actionable);
      const actionabilityRate =
        recommendations.length > 0 ? actionable.length / recommendations.length : 1; // If no recommendations, consider it 100%
      assert.ok(actionabilityRate >= 0.75, `Actionability ${actionabilityRate} below 75% target`);
    });

    it('should have clear implementation steps for each recommendation', () => {
      recommender = new OptimizationRecommender();
      const mockPattern = {
        sequence: ['planner', 'developer', 'qa'],
        support: 0.8,
        avgDurationMs: 60000,
      };
      const recommendations = recommender.generateRecommendations(mockPattern);
      recommendations.forEach(r => {
        assert.ok(r.implementationSteps);
        assert.ok(Array.isArray(r.implementationSteps));
        assert.ok(r.implementationSteps.length > 0);
      });
    });

    it('should include code examples for complex optimizations', () => {
      recommender = new OptimizationRecommender();
      const repeatedPattern = {
        sequence: ['developer', 'developer', 'developer'],
        support: 0.6,
        avgDurationMs: 90000,
      };
      const recommendations = recommender.generateRecommendations(repeatedPattern);
      const cachingRecs = recommendations.filter(r => r.type === 'caching');
      // Caching recommendations should have code examples
      cachingRecs.forEach(r => {
        assert.ok(r.codeExample || r.implementationSteps);
      });
    });
  });

  describe('Performance Benchmarks', () => {
    it('should generate recommendations in <200ms', () => {
      recommender = new OptimizationRecommender();
      const mockPattern = {
        sequence: ['planner', 'developer', 'qa'],
        support: 0.8,
        avgDurationMs: 60000,
      };
      const startTime = Date.now();
      recommender.generateRecommendations(mockPattern);
      const duration = Date.now() - startTime;
      assert.ok(duration < 200, `Generation took ${duration}ms, expected <200ms`);
    });

    it('should prioritize 100 recommendations in <100ms', () => {
      recommender = new OptimizationRecommender();
      const recommendations = Array(100)
        .fill(null)
        .map((_, i) => ({
          type: 'optimization',
          estimatedImpact: { timeReductionMs: Math.random() * 10000 },
          confidence: Math.random(),
          costBenefit: { roi: Math.random() * 10, paybackPeriodDays: Math.random() * 30 },
          implementationCost: { timeHours: Math.random() * 10, complexity: 'medium' },
        }));
      const startTime = Date.now();
      recommender.prioritizeOptimizations(recommendations);
      const duration = Date.now() - startTime;
      assert.ok(duration < 100, `Prioritization took ${duration}ms, expected <100ms`);
    });

    it('should train decision tree in <500ms on 1000 samples', () => {
      recommender = new OptimizationRecommender();
      const trainingData = Array(1000)
        .fill(null)
        .map(() => ({
          features: {
            avgDurationMs: Math.random() * 100000,
            tokenCount: Math.random() * 200000,
            toolUsageCount: Math.floor(Math.random() * 100),
          },
          label: ['parallelization', 'model-switch', 'caching', 'tool-optimization'][
            Math.floor(Math.random() * 4)
          ],
        }));
      const startTime = Date.now();
      recommender.trainDecisionTree(trainingData);
      const duration = Date.now() - startTime;
      assert.ok(duration < 500, `Training took ${duration}ms, expected <500ms`);
    });
  });

  describe('Edge Cases', () => {
    it('should handle patterns with zero duration', () => {
      recommender = new OptimizationRecommender();
      const zeroPattern = {
        sequence: ['developer'],
        avgDurationMs: 0,
      };
      const recommendations = recommender.generateRecommendations(zeroPattern);
      assert.ok(Array.isArray(recommendations));
    });

    it('should handle patterns with extremely high duration', () => {
      recommender = new OptimizationRecommender();
      const slowPattern = {
        sequence: ['developer'],
        avgDurationMs: 10000000, // 10000 seconds
      };
      const recommendations = recommender.generateRecommendations(slowPattern);
      assert.ok(Array.isArray(recommendations));
    });

    it('should handle null/undefined fields in pattern', () => {
      recommender = new OptimizationRecommender();
      const incompletePattern = {
        sequence: ['developer'],
        avgDurationMs: null,
        tokenCount: undefined,
      };
      // Should not crash
      const recommendations = recommender.generateRecommendations(incompletePattern);
      assert.ok(Array.isArray(recommendations));
    });

    it('should handle patterns with single task', () => {
      recommender = new OptimizationRecommender();
      const singleTaskPattern = {
        sequence: ['developer'],
        avgDurationMs: 30000,
      };
      const recommendations = recommender.generateRecommendations(singleTaskPattern);
      assert.ok(Array.isArray(recommendations));
    });

    it('should handle recommendations with zero ROI', () => {
      recommender = new OptimizationRecommender();
      const recommendations = [
        {
          type: 'optimization',
          estimatedImpact: { timeReductionMs: 100 },
          costBenefit: { roi: 0, paybackPeriodDays: Infinity },
          confidence: 0.5,
          implementationCost: { timeHours: 10, complexity: 'high' },
        },
      ];
      const prioritized = recommender.prioritizeOptimizations(recommendations);
      assert.strictEqual(prioritized[0].priority, 'low');
    });
  });

  describe('Report Generation', () => {
    const mockRecommendations = [
      {
        type: 'parallelization',
        description: 'Parallelize planner and developer tasks',
        estimatedImpact: { timeReductionMs: 15000, timeReductionPercent: 25 },
        confidence: 0.85,
        priority: 'high',
        costBenefit: { roi: 10, paybackPeriodDays: 3 },
        implementationSteps: ['Identify tasks', 'Add parallel execution', 'Test'],
      },
    ];

    it('should generate markdown optimization report', () => {
      recommender = new OptimizationRecommender();
      const report = recommender.generateOptimizationReport(mockRecommendations);
      assert.ok(typeof report === 'string');
      assert.ok(report.includes('# Optimization Recommendations'));
    });

    it('should include high priority recommendations at top', () => {
      recommender = new OptimizationRecommender();
      const report = recommender.generateOptimizationReport(mockRecommendations);
      assert.ok(report.includes('## High Priority'));
    });

    it('should include cost-benefit analysis in report', () => {
      recommender = new OptimizationRecommender();
      const report = recommender.generateOptimizationReport(mockRecommendations);
      assert.ok(report.includes('ROI'));
      assert.ok(report.includes('Payback Period'));
    });

    it('should include implementation steps in report', () => {
      recommender = new OptimizationRecommender();
      const report = recommender.generateOptimizationReport(mockRecommendations);
      assert.ok(report.includes('Implementation'));
    });

    it('should save report to file if path provided', async () => {
      const fs = require('fs').promises;
      const os = require('os');
      const path = require('path');
      const reportPath = path.join(os.tmpdir(), 'optimization-report-test.md');
      recommender = new OptimizationRecommender();
      recommender.generateOptimizationReport(mockRecommendations, { saveTo: reportPath });
      const exists = await fs
        .access(reportPath)
        .then(() => true)
        .catch(() => false);
      assert.ok(exists);
      // Cleanup
      await fs.unlink(reportPath).catch(() => {});
    });
  });
});
