/**
 * Optimization Targets
 *
 * Defines performance targets by tier (critical, important, nice-to-have)
 * and calculates optimization priority based on impact/effort ratio.
 */

/**
 * Set performance targets with tier categorization
 * @returns {Object} Targets organized by tier
 */
function setPerformanceTargets() {
  return {
    tier1: [
      {
        component: 'analytics-query',
        metric: 'Query execution time',
        targetTime: 500,
        unit: 'ms',
        rationale: 'Critical path - analytics queries block user workflows',
      },
      {
        component: 'checkpoint-save',
        metric: 'Checkpoint save time',
        targetTime: 50,
        unit: 'ms',
        rationale: 'Critical path - frequent operation that blocks progress',
      },
      {
        component: 'memory-usage',
        metric: 'Peak memory usage',
        targetTime: 300,
        unit: 'MB',
        rationale: 'Critical resource - prevents OOM in large codebases',
      },
    ],
    tier2: [
      {
        component: 'task-operations',
        metric: 'Task create/update time',
        targetTime: 1000,
        unit: 'ms',
        rationale: 'Important - affects workflow responsiveness',
      },
      {
        component: 'spec-001',
        metric: 'SPEC-001 execution time',
        targetTime: 2000,
        unit: 'ms',
        rationale: 'Important - foundational workflow component',
      },
      {
        component: 'brownfield-analysis',
        metric: 'Brownfield analysis time',
        targetTime: 5000,
        unit: 'ms',
        rationale: 'Important - enables large codebase integration',
      },
    ],
    tier3: [
      {
        component: 'adaptive-questions',
        metric: 'Adaptive question generation',
        targetTime: 1000,
        unit: 'ms',
        rationale: 'Nice-to-have - improves UX but not critical',
      },
      {
        component: 'analytics-reporting',
        metric: 'Analytics report generation',
        targetTime: 500,
        unit: 'ms',
        rationale: 'Nice-to-have - infrequent operation',
      },
    ],
  };
}

/**
 * Calculate optimization priority (impact/effort ratio)
 * @param {Object} bottleneck - Bottleneck object
 * @param {number} targetTime - Target execution time
 * @returns {Object} Priority analysis
 */
function optimizationPriority(bottleneck, targetTime) {
  const currentTime = bottleneck.executionTime;
  const percentage = bottleneck.percentage || 0;
  const complexity = bottleneck.complexity || 'medium';

  // Calculate impact (time savings)
  let impact;
  if (percentage >= 20) {
    impact = 'high';
  } else if (percentage >= 10) {
    impact = 'medium';
  } else {
    impact = 'low';
  }

  // Estimate effort based on complexity
  let effort;
  let effortDays;

  if (complexity === 'high') {
    effort = 'high';
    effortDays = 3;
  } else if (complexity === 'medium') {
    effort = 'medium';
    effortDays = 1;
  } else {
    effort = 'low';
    effortDays = 0.25;
  }

  // Calculate impact/effort score (higher is better)
  const impactScore = {
    high: 3,
    medium: 2,
    low: 1,
  }[impact];

  const effortScore = {
    high: 1,
    medium: 2,
    low: 3,
  }[effort];

  const score = impactScore * effortScore;

  return {
    impact,
    effort,
    effortDays,
    score,
    timeSavings: Math.max(0, currentTime - targetTime),
    percentageSavings: percentage,
  };
}

module.exports = {
  setPerformanceTargets,
  optimizationPriority,
};
