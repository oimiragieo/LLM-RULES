/**
 * Bottleneck Analyzer
 *
 * Analyzes performance metrics to identify bottlenecks, memory-heavy operations,
 * slow queries, and provides optimization suggestions.
 */

class BottleneckAnalyzer {
  constructor(profilerMetrics) {
    this.metrics = profilerMetrics || {};
  }

  /**
   * Find functions taking more than threshold% of total time
   * @param {number} threshold - Percentage threshold (default 10%)
   * @returns {Array} Bottleneck functions sorted by impact
   */
  findBottlenecks(threshold = 10) {
    const entries = Object.entries(this.metrics);
    if (entries.length === 0) {
      return [];
    }

    // Calculate total execution time
    const totalTime = entries.reduce((sum, [, metrics]) => {
      return sum + (metrics.executionTime || 0);
    }, 0);

    if (totalTime === 0) {
      return [];
    }

    // Find functions exceeding threshold
    const bottlenecks = [];
    for (const [name, metrics] of entries) {
      const percentage = (metrics.executionTime / totalTime) * 100;
      if (percentage >= threshold) {
        bottlenecks.push({
          name,
          executionTime: metrics.executionTime,
          percentage: parseFloat(percentage.toFixed(2)),
          callCount: metrics.callCount || 1,
          memoryUsed: metrics.memoryUsed || 0,
        });
      }
    }

    // Sort by execution time (descending)
    bottlenecks.sort((a, b) => b.executionTime - a.executionTime);

    return bottlenecks;
  }

  /**
   * Analyze memory-heavy operations sorted by size
   * @returns {Array} Memory-heavy operations
   */
  analyzeMemory() {
    const entries = Object.entries(this.metrics);
    const memoryHeavy = [];

    for (const [name, metrics] of entries) {
      if (metrics.memoryUsed > 0) {
        memoryHeavy.push({
          name,
          memoryUsed: metrics.memoryUsed,
          executionTime: metrics.executionTime || 0,
        });
      }
    }

    // Sort by memory usage (descending)
    memoryHeavy.sort((a, b) => b.memoryUsed - a.memoryUsed);

    return memoryHeavy;
  }

  /**
   * Analyze slow query functions
   * @returns {Array} Slow query functions sorted by time
   */
  analyzeQueries() {
    const entries = Object.entries(this.metrics);
    const slowQueries = [];

    for (const [name, metrics] of entries) {
      // Identify query-related functions by name patterns
      if (
        name.toLowerCase().includes('query') ||
        name.toLowerCase().includes('find') ||
        name.toLowerCase().includes('search') ||
        name.toLowerCase().includes('fetch')
      ) {
        slowQueries.push({
          name,
          executionTime: metrics.executionTime || 0,
          callCount: metrics.callCount || 1,
        });
      }
    }

    // Sort by execution time (descending)
    slowQueries.sort((a, b) => b.executionTime - a.executionTime);

    return slowQueries;
  }

  /**
   * Analyze checkpointing overhead
   * @returns {Object} Checkpoint overhead analysis
   */
  analyzeCheckpointing() {
    let totalTime = 0;
    let saveTime = 0;
    let loadTime = 0;

    for (const [name, metrics] of Object.entries(this.metrics)) {
      if (name.toLowerCase().includes('checkpoint')) {
        totalTime += metrics.executionTime || 0;

        if (name.toLowerCase().includes('save')) {
          saveTime += metrics.executionTime || 0;
        } else if (name.toLowerCase().includes('load')) {
          loadTime += metrics.executionTime || 0;
        }
      }
    }

    return {
      totalTime,
      saveTime,
      loadTime,
      percentage: 0, // Would need total app time to calculate
    };
  }

  /**
   * Detect memory growth pattern from samples
   * @param {Array} samples - Array of { timestamp, memoryUsed } objects
   * @returns {Object} Memory growth analysis
   */
  getMemoryGrowthPattern(samples) {
    if (!samples || samples.length < 2) {
      return {
        trend: 'unknown',
        growthRate: 0,
      };
    }

    // Calculate linear regression to determine trend
    const n = samples.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = samples[i].memoryUsed;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const growthRate = slope / (sumY / n); // Normalized growth rate

    let trend;
    if (Math.abs(growthRate) < 0.05) {
      trend = 'stable';
    } else if (growthRate > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    return {
      trend,
      growthRate,
      sampleCount: n,
    };
  }

  /**
   * Suggest optimizations for a bottleneck
   * @param {Object} bottleneck - Bottleneck object
   * @returns {Array<string>} Optimization suggestions
   */
  suggestOptimizations(bottleneck) {
    const suggestions = [];

    // Suggest caching for repeated operations
    if (bottleneck.callCount && bottleneck.callCount > 10) {
      suggestions.push('Add caching to reduce repeated computations');
    }

    // Suggest async for I/O operations
    if (bottleneck.type === 'io' || bottleneck.name.toLowerCase().includes('save')) {
      suggestions.push('Use async/await to avoid blocking operations');
    }

    // Suggest batching for multiple calls
    if (bottleneck.callCount && bottleneck.callCount > 20) {
      suggestions.push('Batch operations to reduce overhead');
    }

    // Suggest parallel processing
    if (bottleneck.parallelizable || bottleneck.executionTime > 500) {
      suggestions.push('Use parallel processing for independent operations');
    }

    // Suggest indexing for queries
    if (
      bottleneck.name.toLowerCase().includes('query') ||
      bottleneck.name.toLowerCase().includes('search')
    ) {
      suggestions.push('Add indexing to speed up queries');
    }

    // Generic suggestion for high execution time
    if (bottleneck.executionTime > 1000) {
      suggestions.push('Profile this function in detail to identify specific bottlenecks');
    }

    return suggestions;
  }
}

module.exports = { BottleneckAnalyzer };
