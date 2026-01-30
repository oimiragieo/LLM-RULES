/**
 * Performance Profiler
 *
 * Instruments functions and modules to track execution time, memory usage, tokens, and cache hits.
 * Provides session-based profiling, flame graph generation, and heatmap visualization.
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

class PerformanceProfiler {
  constructor(specsPath) {
    this.specsPath = specsPath;
    this.metrics = new Map();
    this.sessions = new Map();
    this.callCounts = new Map();
  }

  /**
   * Instrument a function to track performance metrics
   * @param {string} name - Function identifier
   * @param {Function} fn - Function to instrument
   * @returns {Function} Instrumented function
   */
  instrumentFunction(name, fn) {
    const self = this;

    // Return a wrapper that works for both sync and async functions
    return function instrumentedWrapper(...args) {
      const startTime = performance.now();
      const startMemory = process.memoryUsage().heapUsed;

      let result;
      let error;

      try {
        result = fn(...args);

        // Check if result is a Promise
        if (result && typeof result.then === 'function') {
          // For async functions, track metrics after promise resolves
          return result.then(
            value => {
              self._recordMetrics(name, startTime, startMemory, value, null);
              return value;
            },
            err => {
              self._recordMetrics(name, startTime, startMemory, null, err);
              throw err;
            }
          );
        }
      } catch (err) {
        error = err;
      }

      // For sync functions, record metrics immediately
      self._recordMetrics(name, startTime, startMemory, result, error);

      if (error) {
        throw error;
      }

      return result;
    };
  }

  /**
   * Record metrics for a function call
   * @private
   */
  _recordMetrics(name, startTime, startMemory, result, _error) {
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const executionTime = endTime - startTime;
    const memoryUsed = Math.max(0, endMemory - startMemory);

    // Track tokens if result contains token info
    let tokensUsed = 0;
    if (result && typeof result === 'object' && 'tokens' in result) {
      tokensUsed = result.tokens;
    }

    // Track cache hits if result contains cache info
    let cacheHits = 0;
    if (result && typeof result === 'object' && 'cacheHit' in result) {
      cacheHits = result.cacheHit ? 1 : 0;
    }

    // Update call count
    const currentCount = this.callCounts.get(name) || 0;
    this.callCounts.set(name, currentCount + 1);

    // Store metrics
    const existingMetrics = this.metrics.get(name);
    if (existingMetrics) {
      // Aggregate metrics for multiple runs
      this.metrics.set(name, {
        executionTime: existingMetrics.executionTime + executionTime,
        memoryUsed: existingMetrics.memoryUsed + memoryUsed,
        tokensUsed: existingMetrics.tokensUsed + tokensUsed,
        cacheHits: existingMetrics.cacheHits + cacheHits,
        callCount: this.callCounts.get(name),
      });
    } else {
      this.metrics.set(name, {
        executionTime,
        memoryUsed,
        tokensUsed,
        cacheHits,
        callCount: 1,
      });
    }
  }

  /**
   * Start a profiling session with a label
   * @param {string} label - Session identifier
   */
  startProfiling(label) {
    this.sessions.set(label, {
      startTime: performance.now(),
      startMemory: process.memoryUsage().heapUsed,
    });
  }

  /**
   * Stop a profiling session and store metrics
   * @param {string} label - Session identifier
   */
  stopProfiling(label) {
    const session = this.sessions.get(label);
    if (!session) {
      return;
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const executionTime = endTime - session.startTime;
    const memoryUsed = Math.max(0, endMemory - session.startMemory);

    this.metrics.set(label, {
      executionTime,
      memoryUsed,
      tokensUsed: 0,
      cacheHits: 0,
      callCount: 1,
    });

    this.sessions.delete(label);
  }

  /**
   * Get metrics for a specific label
   * @param {string} label - Metric identifier
   * @returns {Object|null} Metrics object or null if not found
   */
  getMetrics(label) {
    return this.metrics.get(label) || null;
  }

  /**
   * Profile all SPEC modules (SPEC-001 through SPEC-012)
   * @returns {Promise<Array>} Array of profiling results
   */
  async profileAllSpecs() {
    const results = [];

    // Find all SPEC modules in the specs path
    const specDirs = ['workflow', 'memory', 'testing', 'utils'];

    for (const dir of specDirs) {
      const dirPath = path.join(this.specsPath, dir);
      if (!fs.existsSync(dirPath)) {
        continue;
      }

      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (file.endsWith('.cjs') || file.endsWith('.js')) {
          const modulePath = path.join(dirPath, file);
          const moduleName = path.basename(file, path.extname(file));

          try {
            const startTime = performance.now();
            const startMemory = process.memoryUsage().heapUsed;

            // Require the module to profile its load time
            require(modulePath);

            const endTime = performance.now();
            const endMemory = process.memoryUsage().heapUsed;

            results.push({
              module: moduleName,
              path: modulePath,
              loadTime: endTime - startTime,
              memoryUsed: Math.max(0, endMemory - startMemory),
            });
          } catch (_error) {
            // Skip modules that can't be loaded
          }
        }
      }
    }

    return results;
  }

  /**
   * Generate flame graph data in JSON format
   * @returns {Object} Flame graph data
   */
  generateFlameGraph() {
    const root = {
      name: 'root',
      value: 0,
      children: [],
    };

    // Build hierarchical structure from metrics
    const totalTime = Array.from(this.metrics.values()).reduce(
      (sum, m) => sum + m.executionTime,
      0
    );

    for (const [name, metrics] of this.metrics.entries()) {
      root.children.push({
        name,
        value: metrics.executionTime,
        percentage: totalTime > 0 ? (metrics.executionTime / totalTime) * 100 : 0,
      });
    }

    root.value = totalTime;

    return root;
  }

  /**
   * Generate performance heatmap per function
   * @returns {Object} Heatmap data
   */
  generateHeatmap() {
    const heatmap = {
      functions: [],
      minTime: Infinity,
      maxTime: -Infinity,
    };

    for (const [name, metrics] of this.metrics.entries()) {
      heatmap.functions.push({
        name,
        executionTime: metrics.executionTime,
        memoryUsed: metrics.memoryUsed,
        callCount: metrics.callCount || 1,
      });

      heatmap.minTime = Math.min(heatmap.minTime, metrics.executionTime);
      heatmap.maxTime = Math.max(heatmap.maxTime, metrics.executionTime);
    }

    // Sort by execution time (descending)
    heatmap.functions.sort((a, b) => b.executionTime - a.executionTime);

    return heatmap;
  }

  // ==========================================================================
  // Phase 5: Enhanced Profiling Methods
  // ==========================================================================

  /**
   * Record a metric directly (for external profiling)
   * @param {string} operation - Operation name
   * @param {Object} data - Metric data (duration, memoryUsed, frequency, category, timestamp)
   */
  record(operation, data) {
    const existing = this.metrics.get(operation);
    const records = existing?.records || [];
    records.push({
      ...data,
      timestamp: data.timestamp || Date.now(),
    });

    this.metrics.set(operation, {
      operation,
      executionTime: (existing?.executionTime || 0) + (data.duration || 0),
      memoryUsed: (existing?.memoryUsed || 0) + (data.memoryUsed || 0),
      tokensUsed: (existing?.tokensUsed || 0) + (data.tokensUsed || 0),
      cacheHits: (existing?.cacheHits || 0) + (data.cacheHits || 0),
      callCount: (existing?.callCount || 0) + 1,
      frequency: data.frequency || (existing?.callCount || 0) + 1,
      category: data.category || existing?.category,
      records,
    });
  }

  /**
   * Identify bottlenecks based on threshold
   * @param {number} threshold - Minimum duration to be considered bottleneck
   * @returns {Array} Array of bottleneck operations
   */
  identifyBottlenecks(threshold = 1000) {
    const bottlenecks = [];

    for (const [operation, metrics] of this.metrics.entries()) {
      const avgDuration =
        metrics.callCount > 0 ? metrics.executionTime / metrics.callCount : metrics.executionTime;

      if (avgDuration >= threshold) {
        const totalImpact = avgDuration * (metrics.frequency || metrics.callCount || 1);
        const suggestions = this._generateSuggestions(operation, metrics);

        bottlenecks.push({
          operation,
          avgDuration,
          totalImpact,
          frequency: metrics.frequency || metrics.callCount || 1,
          category: metrics.category,
          suggestions,
        });
      }
    }

    // Sort by total impact descending
    bottlenecks.sort((a, b) => b.totalImpact - a.totalImpact);

    return bottlenecks;
  }

  _generateSuggestions(operation, metrics) {
    const suggestions = [];

    if (
      metrics.category === 'io' ||
      operation.toLowerCase().includes('read') ||
      operation.toLowerCase().includes('write')
    ) {
      suggestions.push('Consider batching I/O operations');
      suggestions.push('Implement caching for repeated reads');
    }

    if (
      metrics.category === 'search' ||
      operation.toLowerCase().includes('grep') ||
      operation.toLowerCase().includes('search')
    ) {
      suggestions.push('Use indexed search for large datasets');
      suggestions.push('Cache search results when possible');
    }

    if (metrics.frequency > 10) {
      suggestions.push('High frequency operation - consider parallelization');
    }

    if (suggestions.length === 0) {
      suggestions.push('Review for optimization opportunities');
    }

    return suggestions;
  }

  /**
   * Get latency statistics for an operation
   * @param {string} operation - Operation name
   * @returns {Object} Latency stats (p50, p95, p99, mean, min, max)
   */
  getLatencyStats(operation) {
    const metrics = this.metrics.get(operation);
    if (!metrics || !metrics.records || metrics.records.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
    }

    const durations = metrics.records
      .map(r => r.duration)
      .filter(d => d !== undefined)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
    }

    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      p50: durations[p50Index] || durations[durations.length - 1],
      p95: durations[p95Index] || durations[durations.length - 1],
      p99: durations[p99Index] || durations[durations.length - 1],
      mean,
      min: durations[0],
      max: durations[durations.length - 1],
    };
  }

  /**
   * Get memory statistics for all operations
   * @returns {Object} Memory stats by operation
   */
  getMemoryStats() {
    const stats = {};

    for (const [operation, metrics] of this.metrics.entries()) {
      if (metrics.memoryUsed > 0 || (metrics.records && metrics.records.some(r => r.memoryUsed))) {
        stats[operation] = {
          totalMemory: metrics.memoryUsed,
          avgMemory: metrics.callCount > 0 ? metrics.memoryUsed / metrics.callCount : 0,
          records: metrics.records?.filter(r => r.memoryUsed !== undefined) || [],
        };
      }
    }

    return stats;
  }

  /**
   * Detect memory usage trend for an operation
   * @param {string} operation - Operation name
   * @returns {Object} Trend analysis {direction, slope}
   */
  detectMemoryTrend(operation) {
    const metrics = this.metrics.get(operation);
    if (!metrics || !metrics.records || metrics.records.length < 2) {
      return { direction: 'stable', slope: 0 };
    }

    const records = metrics.records
      .filter(r => r.memoryUsed !== undefined)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    if (records.length < 2) {
      return { direction: 'stable', slope: 0 };
    }

    // Simple linear regression
    const n = records.length;
    const xMean = (n - 1) / 2;
    const yMean = records.reduce((sum, r) => sum + r.memoryUsed, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (records[i].memoryUsed - yMean);
      denominator += (i - xMean) * (i - xMean);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;

    let direction = 'stable';
    if (slope > yMean * 0.1) direction = 'increasing';
    else if (slope < -yMean * 0.1) direction = 'decreasing';

    return { direction, slope };
  }

  /**
   * Get average memory for an operation
   * @param {string} operation - Operation name
   * @returns {number} Average memory used
   */
  getAverageMemory(operation) {
    const metrics = this.metrics.get(operation);
    if (!metrics || !metrics.records || metrics.records.length === 0) {
      return 0;
    }

    const memoryRecords = metrics.records.filter(r => r.memoryUsed !== undefined);
    if (memoryRecords.length === 0) return 0;

    return memoryRecords.reduce((sum, r) => sum + r.memoryUsed, 0) / memoryRecords.length;
  }

  /**
   * Generate optimization recommendations
   * @returns {Array} Array of recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    for (const [operation, metrics] of this.metrics.entries()) {
      const avgDuration =
        metrics.callCount > 0 ? metrics.executionTime / metrics.callCount : metrics.executionTime;

      const totalImpact = avgDuration * (metrics.frequency || metrics.callCount || 1);

      if (totalImpact > 0) {
        // Estimate potential savings (assume 30% improvement possible)
        const estimatedSavings = totalImpact * 0.3;

        recommendations.push({
          operation,
          avgDuration,
          totalImpact,
          frequency: metrics.frequency || metrics.callCount || 1,
          estimatedSavings,
          suggestions: this._generateSuggestions(operation, metrics),
        });
      }
    }

    // Sort by total impact descending
    recommendations.sort((a, b) => b.totalImpact - a.totalImpact);

    return recommendations;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
    this.sessions.clear();
    this.callCounts.clear();
  }
}

module.exports = { PerformanceProfiler };
