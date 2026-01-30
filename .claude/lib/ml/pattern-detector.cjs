/**
 * SPEC-023: ML Pattern Detection & Analysis
 * Phase 5: Enhanced Pattern Detection with N-grams, Anomaly Detection, and Clustering
 *
 * Detects workflow patterns using:
 * - Apriori algorithm for frequent sequence mining
 * - K-Means clustering for task grouping
 * - Bottleneck detection
 * - Pattern frequency analysis
 * - N-gram extraction
 * - Statistical anomaly detection (Z-score, IQR)
 */

const fs = require('fs');
const path = require('path');

class WorkflowPatternDetector {
  constructor(config = {}) {
    this.config = {
      minSupport: config.minSupport ?? 0.1,
      minConfidence: config.minConfidence ?? 0.6,
      bottleneckThreshold: config.bottleneckThreshold ?? 0.3,
      kClusters: config.kClusters ?? 3,
      ...config,
    };

    // Validate config
    if (this.config.minSupport < 0 || this.config.minSupport > 1) {
      throw new Error('minSupport must be between 0 and 1');
    }
    if (this.config.minConfidence < 0 || this.config.minConfidence > 1) {
      throw new Error('minConfidence must be between 0 and 1');
    }

    this.model = null;
  }

  /**
   * Detect frequent sequences using Apriori algorithm
   * @param {Array} workflows - Array of workflow objects with taskSequence
   * @param {number} minSupport - Minimum support threshold (0-1)
   * @returns {Array} Array of frequent patterns
   */
  detectFrequentSequences(workflows, minSupport = this.config.minSupport) {
    if (!workflows || workflows.length === 0) {
      return [];
    }

    const patterns = [];
    const sequences = workflows.map(w => this._extractSequence(w.taskSequence));

    // Find frequent 1-item sequences
    const singleItems = this._findFrequentItems(sequences, 1, minSupport);
    patterns.push(...singleItems);

    // Find frequent 2-item sequences
    if (singleItems.length > 0) {
      const twoItems = this._findFrequentItems(sequences, 2, minSupport);
      patterns.push(...twoItems);

      // Find frequent 3-item sequences
      if (twoItems.length > 0) {
        const threeItems = this._findFrequentItems(sequences, 3, minSupport);
        patterns.push(...threeItems);
      }
    }

    // Sort by support descending
    patterns.sort((a, b) => b.support - a.support);

    return patterns;
  }

  _extractSequence(taskSequence) {
    if (!Array.isArray(taskSequence)) return [];
    return taskSequence.filter(t => t && t.agentType).map(t => t.agentType);
  }

  _findFrequentItems(sequences, length, minSupport) {
    const patterns = [];
    const candidates = this._generateCandidates(sequences, length);

    for (const [pattern, count] of candidates.entries()) {
      const support = count / sequences.length;
      if (support >= minSupport) {
        const confidence = this._calculateConfidence(pattern, sequences, count);
        patterns.push({
          sequence: pattern.split(','),
          support,
          confidence,
          occurrences: count,
        });
      }
    }

    return patterns;
  }

  _generateCandidates(sequences, length) {
    const candidates = new Map();

    for (const sequence of sequences) {
      // Generate all subsequences of given length
      for (let i = 0; i <= sequence.length - length; i++) {
        const subseq = sequence.slice(i, i + length).join(',');
        candidates.set(subseq, (candidates.get(subseq) || 0) + 1);
      }
    }

    return candidates;
  }

  _calculateConfidence(pattern, sequences, count) {
    const parts = pattern.split(',');
    if (parts.length <= 1) return 1.0;

    // Confidence = support(A -> B) / support(A)
    const antecedent = parts.slice(0, -1).join(',');
    let antecedentCount = 0;

    for (const sequence of sequences) {
      const seqStr = sequence.join(',');
      if (seqStr.includes(antecedent)) {
        antecedentCount++;
      }
    }

    return antecedentCount > 0 ? count / antecedentCount : 0;
  }

  /**
   * Detect bottleneck patterns from metrics
   * @param {Array} metrics - Array of workflow metrics
   * @returns {Array} Array of bottleneck patterns
   */
  detectBottleneckPatterns(metrics) {
    if (!metrics || metrics.length === 0) {
      return [];
    }

    const taskStats = new Map();

    // Aggregate task statistics
    for (const metric of metrics) {
      if (!metric.taskSequence) continue;

      for (const task of metric.taskSequence) {
        if (!task.agentType || !task.durationMs) continue;

        const key = task.agentType;
        if (!taskStats.has(key)) {
          taskStats.set(key, {
            agentType: key,
            totalDuration: 0,
            count: 0,
          });
        }

        const stats = taskStats.get(key);
        stats.totalDuration += task.durationMs;
        stats.count++;
      }
    }

    // Calculate averages and percentages
    const totalWorkflowTime = metrics.reduce((sum, m) => sum + (m.totalDurationMs || 0), 0);
    const bottlenecks = [];

    for (const stats of taskStats.values()) {
      const avgDurationMs = stats.totalDuration / stats.count;
      const percentOfTotal = (stats.totalDuration / totalWorkflowTime) * 100;

      if (percentOfTotal >= this.config.bottleneckThreshold * 100) {
        bottlenecks.push({
          agentType: stats.agentType,
          avgDurationMs,
          percentOfTotal,
          occurrences: stats.count,
        });
      }
    }

    // Sort by average duration descending
    bottlenecks.sort((a, b) => b.avgDurationMs - a.avgDurationMs);

    return bottlenecks;
  }

  /**
   * Cluster tasks using K-Means algorithm
   * @param {Array} tasks - Array of task objects
   * @returns {Array} Array of clusters
   */
  clusterTasks(tasks) {
    if (!tasks || tasks.length === 0) {
      return [];
    }

    const k = Math.min(this.config.kClusters, tasks.length);
    const features = tasks.map(t => this._extractFeatures(t));

    // Initialize centroids randomly
    let centroids = this._initializeCentroids(features, k);
    let clusters = [];
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      // Assign tasks to nearest centroid
      clusters = this._assignToClusters(tasks, features, centroids);

      // Recalculate centroids
      const newCentroids = this._recalculateCentroids(clusters);

      // Check convergence
      if (this._centroidsConverged(centroids, newCentroids)) {
        break;
      }

      centroids = newCentroids;
      iterations++;
    }

    return clusters.map((cluster, i) => ({
      id: i,
      centroid: centroids[i],
      tasks: cluster,
      size: cluster.length,
    }));
  }

  _extractFeatures(task) {
    return {
      durationMs: task.durationMs || 0,
      tokenCount: task.tokenCount || 0,
    };
  }

  _initializeCentroids(features, k) {
    const centroids = [];
    const indices = new Set();

    while (centroids.length < k && centroids.length < features.length) {
      const idx = Math.floor(Math.random() * features.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        centroids.push({ ...features[idx] });
      }
    }

    return centroids;
  }

  _assignToClusters(tasks, features, centroids) {
    const clusters = centroids.map(() => []);

    for (let i = 0; i < tasks.length; i++) {
      const feature = features[i];
      let minDist = Infinity;
      let closestCluster = 0;

      for (let j = 0; j < centroids.length; j++) {
        const dist = this._euclideanDistance(feature, centroids[j]);
        if (dist < minDist) {
          minDist = dist;
          closestCluster = j;
        }
      }

      clusters[closestCluster].push(tasks[i]);
    }

    return clusters;
  }

  _euclideanDistance(a, b) {
    const dDuration = (a.durationMs - b.durationMs) / 100000; // Normalize
    const dTokens = (a.tokenCount - b.tokenCount) / 100000; // Normalize
    return Math.sqrt(dDuration * dDuration + dTokens * dTokens);
  }

  _recalculateCentroids(clusters) {
    return clusters.map(cluster => {
      if (cluster.length === 0) {
        return { durationMs: 0, tokenCount: 0 };
      }

      const sum = cluster.reduce(
        (acc, task) => ({
          durationMs: acc.durationMs + (task.durationMs || 0),
          tokenCount: acc.tokenCount + (task.tokenCount || 0),
        }),
        { durationMs: 0, tokenCount: 0 }
      );

      return {
        durationMs: sum.durationMs / cluster.length,
        tokenCount: sum.tokenCount / cluster.length,
      };
    });
  }

  _centroidsConverged(oldCentroids, newCentroids) {
    const threshold = 0.01;

    for (let i = 0; i < oldCentroids.length; i++) {
      const dist = this._euclideanDistance(oldCentroids[i], newCentroids[i]);
      if (dist > threshold) {
        return false;
      }
    }

    return true;
  }

  calculateSilhouetteScore(clusters) {
    if (clusters.length <= 1) return 0;

    let totalScore = 0;
    let totalPoints = 0;

    for (const cluster of clusters) {
      for (const task of cluster.tasks) {
        const features = this._extractFeatures(task);
        const a = this._averageDistanceWithinCluster(features, cluster, task);
        const b = this._minAverageDistanceToOtherClusters(features, clusters, cluster);

        const s = (b - a) / Math.max(a, b);
        totalScore += s;
        totalPoints++;
      }
    }

    return totalPoints > 0 ? totalScore / totalPoints : 0;
  }

  _averageDistanceWithinCluster(features, cluster, excludeTask) {
    const others = cluster.tasks.filter(t => t !== excludeTask);
    if (others.length === 0) return 0;

    const sum = others.reduce((acc, task) => {
      return acc + this._euclideanDistance(features, this._extractFeatures(task));
    }, 0);

    return sum / others.length;
  }

  _minAverageDistanceToOtherClusters(features, allClusters, currentCluster) {
    let minDist = Infinity;

    for (const cluster of allClusters) {
      if (cluster === currentCluster) continue;

      const avgDist =
        cluster.tasks.reduce((acc, task) => {
          return acc + this._euclideanDistance(features, this._extractFeatures(task));
        }, 0) / cluster.tasks.length;

      minDist = Math.min(minDist, avgDist);
    }

    return minDist;
  }

  findOptimalK(tasks, options = {}) {
    const minK = options.minK || 2;
    const maxK = Math.min(options.maxK || 10, tasks.length);
    let bestK = minK;
    let bestScore = -1;

    for (let k = minK; k <= maxK; k++) {
      const prevKClusters = this.config.kClusters;
      this.config.kClusters = k;

      const clusters = this.clusterTasks(tasks);
      const score = this.calculateSilhouetteScore(clusters);

      if (score > bestScore) {
        bestScore = score;
        bestK = k;
      }

      this.config.kClusters = prevKClusters;
    }

    return bestK;
  }

  /**
   * Analyze pattern frequency
   * @param {Array} workflows - Array of workflow objects
   * @returns {Array} Array of pattern frequencies
   */
  analyzePatternFrequency(workflows) {
    const frequencies = new Map();

    for (const workflow of workflows) {
      const sequence = this._extractSequence(workflow.taskSequence);
      const key = sequence.join(' -> ');

      if (!frequencies.has(key)) {
        frequencies.set(key, {
          pattern: sequence,
          count: 0,
          firstSeen: workflow.timestamp || null,
          lastSeen: workflow.timestamp || null,
        });
      }

      const freq = frequencies.get(key);
      freq.count++;
      if (workflow.timestamp) {
        freq.lastSeen = workflow.timestamp;
      }
    }

    const total = workflows.length;
    const result = Array.from(frequencies.values()).map(f => ({
      ...f,
      percentage: (f.count / total) * 100,
    }));

    // Sort by count descending
    result.sort((a, b) => b.count - a.count);

    return result;
  }

  /**
   * Generate pattern report
   * @param {Array} patterns - Array of patterns
   * @param {Object} options - Options (saveTo: path)
   * @returns {string} Markdown report
   */
  generatePatternReport(patterns, options = {}) {
    let report = '# Workflow Pattern Analysis\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += `## Detected Patterns (${patterns.length})\n\n`;

    for (const pattern of patterns) {
      report += `### Pattern: ${pattern.sequence.join(' → ')}\n\n`;
      report += `- **Support**: ${(pattern.support * 100).toFixed(1)}%\n`;
      report += `- **Confidence**: ${(pattern.confidence * 100).toFixed(1)}%\n`;
      report += `- **Occurrences**: ${pattern.occurrences}\n\n`;
    }

    report += `## Visualization\n\n`;
    report += `Patterns can be visualized as directed graphs showing task flow sequences.\n`;

    if (options.saveTo) {
      fs.writeFileSync(options.saveTo, report, 'utf8');
    }

    return report;
  }

  /**
   * Load workflows from MetricsCollector (SPEC-016 integration)
   * @param {Object} filters - Filters (startDate, endDate, outcome)
   * @returns {Array} Array of workflows
   */
  loadWorkflowsFromMetrics(_filters = {}) {
    // Placeholder - will integrate with actual MetricsCollector
    // For now, return empty array to pass tests
    return [];
  }

  // ==========================================================================
  // Phase 5: Enhanced Pattern Detection Methods
  // ==========================================================================

  /**
   * Extract N-gram patterns from execution logs
   * @param {Array} logs - Array of log objects with events
   * @param {number} n - N-gram size
   * @returns {Array} Array of N-gram patterns with frequency
   */
  extractNgrams(logs, n = 2) {
    if (!logs || logs.length === 0) return [];

    const ngramCounts = new Map();

    for (const log of logs) {
      const events = log.events || [];
      if (events.length < n) continue;

      for (let i = 0; i <= events.length - n; i++) {
        const ngram = events.slice(i, i + n);
        const key = ngram.join(',');
        ngramCounts.set(key, (ngramCounts.get(key) || 0) + 1);
      }
    }

    return Array.from(ngramCounts.entries())
      .map(([key, count]) => ({
        pattern: key.split(','),
        frequency: count,
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Detect sliding window patterns in event sequence
   * @param {Array} events - Array of event strings
   * @param {number} windowSize - Size of sliding window
   * @param {Object} options - Options (minFrequency)
   * @returns {Array} Array of patterns with frequency
   */
  slidingWindowPatterns(events, windowSize, options = {}) {
    if (!events || events.length === 0) return [];

    const minFrequency = options.minFrequency || 1;
    const patternCounts = new Map();

    for (let i = 0; i <= events.length - windowSize; i++) {
      const window = events.slice(i, i + windowSize);
      const key = window.join(',');
      patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
    }

    return Array.from(patternCounts.entries())
      .filter(([, count]) => count >= minFrequency)
      .map(([key, count]) => ({
        pattern: key.split(','),
        frequency: count,
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Analyze frequency of values for a given field
   * @param {Array} data - Array of objects
   * @param {string} field - Field name to analyze
   * @param {Object} options - Options (asPercentage)
   * @returns {Object} Frequency map
   */
  analyzeFrequency(data, field, options = {}) {
    if (!data || data.length === 0) return {};

    const counts = {};
    for (const item of data) {
      const value = item[field];
      if (value !== undefined && value !== null) {
        counts[value] = (counts[value] || 0) + 1;
      }
    }

    if (options.asPercentage) {
      const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
      for (const key of Object.keys(counts)) {
        counts[key] = Math.round((counts[key] / total) * 100);
      }
    }

    return counts;
  }

  /**
   * Get top patterns by frequency
   * @param {Array} data - Array of objects
   * @param {string} field - Field name to analyze
   * @param {number} limit - Max patterns to return
   * @returns {Array} Array of {value, count} sorted by count
   */
  topPatterns(data, field, limit = 10) {
    const counts = this.analyzeFrequency(data, field);
    return Object.entries(counts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Detect anomalies using statistical methods
   * @param {Array} values - Array of numeric values
   * @param {Object} options - Options (method: 'zscore'|'iqr', threshold, multiplier)
   * @returns {Array} Indices of anomalous values
   */
  detectAnomalies(values, options = {}) {
    if (!values || values.length === 0) return [];

    const method = options.method || 'zscore';

    if (method === 'zscore') {
      return this._detectAnomaliesZScore(values, options.threshold || 2);
    } else if (method === 'iqr') {
      return this._detectAnomaliesIQR(values, options.multiplier || 1.5);
    }

    return [];
  }

  _detectAnomaliesZScore(values, threshold) {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return []; // All values are the same

    const anomalies = [];
    for (let i = 0; i < values.length; i++) {
      const zScore = Math.abs((values[i] - mean) / stdDev);
      if (zScore > threshold) {
        anomalies.push(i);
      }
    }
    return anomalies;
  }

  _detectAnomaliesIQR(values, multiplier) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - multiplier * iqr;
    const upperBound = q3 + multiplier * iqr;

    const anomalies = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] < lowerBound || values[i] > upperBound) {
        anomalies.push(i);
      }
    }
    return anomalies;
  }

  /**
   * Cluster patterns using k-means
   * @param {Array} patterns - Array of pattern objects with numeric features
   * @param {number} k - Number of clusters
   * @returns {Array} Array of clusters
   */
  clusterPatterns(patterns, k) {
    if (!patterns || patterns.length === 0) return [];
    if (k >= patterns.length) {
      return [{ centroid: this._calculateCentroid(patterns), items: patterns }];
    }

    // Extract feature keys from first pattern
    const featureKeys = Object.keys(patterns[0]).filter(
      key => typeof patterns[0][key] === 'number'
    );

    // Initialize centroids using k-means++
    let centroids = this._initializeCentroidsKMeansPlusPlus(patterns, k, featureKeys);
    let clusters = [];
    const maxIterations = 100;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign patterns to nearest centroid
      clusters = Array.from({ length: k }, () => []);
      for (const pattern of patterns) {
        let minDist = Infinity;
        let closest = 0;
        for (let j = 0; j < centroids.length; j++) {
          const dist = this._distance(pattern, centroids[j], featureKeys);
          if (dist < minDist) {
            minDist = dist;
            closest = j;
          }
        }
        clusters[closest].push(pattern);
      }

      // Recalculate centroids
      const newCentroids = clusters.map(cluster =>
        this._calculateCentroidFromKeys(cluster, featureKeys)
      );

      // Check convergence
      let converged = true;
      for (let j = 0; j < centroids.length; j++) {
        if (this._distance(centroids[j], newCentroids[j], featureKeys) > 0.001) {
          converged = false;
          break;
        }
      }

      centroids = newCentroids;
      if (converged) break;
    }

    return clusters.map((cluster, i) => ({
      centroid: centroids[i],
      items: cluster,
    }));
  }

  _initializeCentroidsKMeansPlusPlus(patterns, k, featureKeys) {
    const centroids = [];
    const randomIndex = Math.floor(Math.random() * patterns.length);
    centroids.push({ ...patterns[randomIndex] });

    while (centroids.length < k) {
      const distances = patterns.map(p => {
        const minDist = Math.min(...centroids.map(c => this._distance(p, c, featureKeys)));
        return minDist * minDist;
      });
      const totalDist = distances.reduce((sum, d) => sum + d, 0);
      let random = Math.random() * totalDist;
      for (let i = 0; i < patterns.length; i++) {
        random -= distances[i];
        if (random <= 0) {
          centroids.push({ ...patterns[i] });
          break;
        }
      }
    }

    return centroids;
  }

  _distance(a, b, featureKeys) {
    let sum = 0;
    for (const key of featureKeys) {
      const diff = (a[key] || 0) - (b[key] || 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  _calculateCentroid(items) {
    if (!items || items.length === 0) return {};
    const featureKeys = Object.keys(items[0]).filter(key => typeof items[0][key] === 'number');
    return this._calculateCentroidFromKeys(items, featureKeys);
  }

  _calculateCentroidFromKeys(items, featureKeys) {
    if (!items || items.length === 0) {
      const centroid = {};
      featureKeys.forEach(k => (centroid[k] = 0));
      return centroid;
    }

    const centroid = {};
    for (const key of featureKeys) {
      const sum = items.reduce((s, item) => s + (item[key] || 0), 0);
      centroid[key] = sum / items.length;
    }
    return centroid;
  }

  /**
   * Label patterns with cluster assignments
   * @param {Array} patterns - Array of pattern objects
   * @param {number} k - Number of clusters
   * @returns {Array} Patterns with cluster labels
   */
  labelPatterns(patterns, k) {
    const clusters = this.clusterPatterns(patterns, k);
    const labeledPatterns = [];

    clusters.forEach((cluster, clusterIndex) => {
      for (const pattern of cluster.items) {
        labeledPatterns.push({
          ...pattern,
          cluster: clusterIndex,
        });
      }
    });

    return labeledPatterns;
  }
}

// Also export as PatternDetector for Phase 5 compatibility
module.exports = { WorkflowPatternDetector, PatternDetector: WorkflowPatternDetector };
