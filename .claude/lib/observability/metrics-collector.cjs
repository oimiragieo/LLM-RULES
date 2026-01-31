/**
 * @file Metrics Collector for Agent-Studio
 * @description Collects and aggregates metrics (counters, gauges, histograms, rates)
 * Part of SPEC-016: Observability & Monitoring Dashboard
 */

class MetricsCollector {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.startTimes = new Map();
  }

  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {number} value - Amount to increment (default: 1)
   * @param {object} labels - Labels for counter (for filtering)
   */
  incrementCounter(name, value = 1, labels = {}) {
    const key = this._makeKey(name, labels);

    if (!this.counters.has(key)) {
      this.counters.set(key, { name, value: 0, labels });
    }

    const counter = this.counters.get(key);
    counter.value += value;
  }

  /**
   * Get counter value
   * @param {string} name - Counter name
   * @param {object} labels - Labels to filter by
   * @returns {number} Counter value
   */
  getCounter(name, labels = {}) {
    const key = this._makeKey(name, labels);
    const counter = this.counters.get(key);
    return counter ? counter.value : 0;
  }

  /**
   * Set gauge value
   * @param {string} name - Gauge name
   * @param {number} value - Gauge value
   * @param {object} labels - Labels for gauge
   */
  setGauge(name, value, labels = {}) {
    const key = this._makeKey(name, labels);
    this.gauges.set(key, { name, value, labels });
  }

  /**
   * Increment gauge
   * @param {string} name - Gauge name
   * @param {number} value - Amount to increment
   * @param {object} labels - Labels
   */
  incrementGauge(name, value = 1, labels = {}) {
    const currentValue = this.getGauge(name, labels);
    this.setGauge(name, currentValue + value, labels);
  }

  /**
   * Decrement gauge
   * @param {string} name - Gauge name
   * @param {number} value - Amount to decrement
   * @param {object} labels - Labels
   */
  decrementGauge(name, value = 1, labels = {}) {
    const currentValue = this.getGauge(name, labels);
    this.setGauge(name, currentValue - value, labels);
  }

  /**
   * Get gauge value
   * @param {string} name - Gauge name
   * @param {object} labels - Labels to filter by
   * @returns {number} Gauge value
   */
  getGauge(name, labels = {}) {
    const key = this._makeKey(name, labels);
    const gauge = this.gauges.get(key);
    return gauge ? gauge.value : 0;
  }

  /**
   * Record histogram value
   * @param {string} name - Histogram name
   * @param {number} value - Value to record
   * @param {object} labels - Labels
   */
  recordHistogram(name, value, labels = {}) {
    const key = this._makeKey(name, labels);

    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        name,
        labels,
        values: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
      });
    }

    const histogram = this.histograms.get(key);
    histogram.values.push(value);
    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);
  }

  /**
   * Get histogram statistics
   * @param {string} name - Histogram name
   * @param {object} labels - Labels to filter by
   * @returns {object} Histogram stats (count, sum, mean, min, max, percentiles)
   */
  getHistogramStats(name, labels = {}) {
    const key = this._makeKey(name, labels);
    const histogram = this.histograms.get(key);

    if (!histogram || histogram.count === 0) {
      return {
        count: 0,
        sum: 0,
        mean: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        values: [],
      };
    }

    const mean = histogram.sum / histogram.count;

    // Calculate percentiles
    const sorted = [...histogram.values].sort((a, b) => a - b);
    const p50 = this._percentile(sorted, 50);
    const p95 = this._percentile(sorted, 95);
    const p99 = this._percentile(sorted, 99);

    return {
      count: histogram.count,
      sum: histogram.sum,
      mean,
      min: histogram.min,
      max: histogram.max,
      p50,
      p95,
      p99,
      values: histogram.values,
    };
  }

  /**
   * Calculate percentile
   * @private
   */
  _percentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * Get rate (events per second)
   * @param {string} name - Counter name
   * @param {number} startTime - Start timestamp (ms)
   * @param {object} labels - Labels to filter by
   * @returns {number} Events per second
   */
  getRate(name, startTime, labels = {}) {
    const value = this.getCounter(name, labels);
    const elapsedSeconds = (Date.now() - startTime) / 1000;

    // Ensure minimum elapsed time to avoid division by zero or unrealistic rates
    const minimumElapsed = Math.max(elapsedSeconds, 0.001);

    return value / minimumElapsed;
  }

  /**
   * Get all metrics
   * @returns {object} All counters, gauges, histograms
   */
  getMetrics() {
    const counters = {};
    const gauges = {};
    const histograms = {};

    // Aggregate counters by name (ignore labels for simple view)
    for (const [key, counter] of this.counters) {
      if (Object.keys(counter.labels).length === 0) {
        counters[counter.name] = counter.value;
      }
    }

    // Aggregate gauges
    for (const [key, gauge] of this.gauges) {
      if (Object.keys(gauge.labels).length === 0) {
        gauges[gauge.name] = gauge.value;
      }
    }

    // Aggregate histograms
    for (const [key, histogram] of this.histograms) {
      if (Object.keys(histogram.labels).length === 0) {
        histograms[histogram.name] = this.getHistogramStats(histogram.name, histogram.labels);
      }
    }

    return {
      counters,
      gauges,
      histograms,
      timestamp: Date.now(),
    };
  }

  /**
   * Get metrics by agent label
   * @param {string} agent - Agent name
   * @returns {object} Metrics filtered by agent
   */
  getMetricsByAgent(agent) {
    const counters = {};
    const gauges = {};
    const histograms = {};

    for (const [key, counter] of this.counters) {
      if (counter.labels.agent === agent) {
        counters[counter.name] = counter.value;
      }
    }

    for (const [key, gauge] of this.gauges) {
      if (gauge.labels.agent === agent) {
        gauges[gauge.name] = gauge.value;
      }
    }

    for (const [key, histogram] of this.histograms) {
      if (histogram.labels.agent === agent) {
        histograms[histogram.name] = this.getHistogramStats(histogram.name, histogram.labels);
      }
    }

    return {
      counters,
      gauges,
      histograms,
      agent,
    };
  }

  /**
   * Get metrics by feature/SPEC label
   * @param {string} specId - SPEC ID (e.g., 'SPEC-001')
   * @returns {object} Metrics filtered by feature
   */
  getMetricsByFeature(specId) {
    const counters = {};
    const gauges = {};
    const histograms = {};

    for (const [key, counter] of this.counters) {
      if (counter.labels.specId === specId) {
        counters[counter.name] = counter.value;
      }
    }

    for (const [key, gauge] of this.gauges) {
      if (gauge.labels.specId === specId) {
        gauges[gauge.name] = gauge.value;
      }
    }

    for (const [key, histogram] of this.histograms) {
      if (histogram.labels.specId === specId) {
        histograms[histogram.name] = this.getHistogramStats(histogram.name, histogram.labels);
      }
    }

    return {
      counters,
      gauges,
      histograms,
      specId,
    };
  }

  /**
   * Create unique key from name and labels
   * @private
   */
  _makeKey(name, labels = {}) {
    if (Object.keys(labels).length === 0) {
      return name;
    }

    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');

    return `${name}{${labelStr}}`;
  }

  /**
   * Clear all metrics (for testing)
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.startTimes.clear();
  }
}

module.exports = { MetricsCollector };
