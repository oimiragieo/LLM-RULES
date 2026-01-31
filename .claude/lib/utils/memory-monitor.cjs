#!/usr/bin/env node
/**
 * Memory Monitor
 * ==============
 *
 * Monitors heap memory usage and emits events when thresholds are crossed.
 * Designed to prevent OOM crashes during multi-agent orchestration.
 *
 * Features:
 * - Configurable warning, critical, and shutdown thresholds
 * - Event-based notification system (warning, critical, check)
 * - Memory history tracking for trend analysis
 * - Statistics calculation (min, max, avg, trend)
 * - Integration with routing-guard for spawn throttling
 *
 * Usage:
 *   const MemoryMonitor = require('./memory-monitor.cjs');
 *   const monitor = new MemoryMonitor({ warningThreshold: 0.70 });
 *
 *   monitor.on('warning', (data) => console.log('Warning:', data));
 *   monitor.on('critical', (data) => console.log('Critical:', data));
 *
 *   monitor.start();
 *   // ... later ...
 *   monitor.stop();
 *
 * Environment Variables:
 *   HEAP_WARNING_THRESHOLD=70      - Warning threshold (default: 70%)
 *   HEAP_CRITICAL_THRESHOLD=85     - Critical threshold (default: 85%)
 *   HEAP_SHUTDOWN_THRESHOLD=95     - Shutdown threshold (default: 95%)
 *   MEMORY_MONITOR_INTERVAL_MS=5000 - Check interval (default: 5000ms)
 *   MEMORY_HISTORY_SIZE=100        - History size (default: 100)
 *
 * @module memory-monitor
 */

'use strict';

/**
 * Default configuration values
 */
const DEFAULTS = {
  warningThreshold: 0.7,
  criticalThreshold: 0.85,
  shutdownThreshold: 0.95,
  interval: 5000,
  maxHistorySize: 100,
};

/**
 * Get configuration from environment with defaults
 * @returns {Object} Configuration object
 */
function getConfigFromEnv() {
  return {
    warningThreshold:
      parseFloat(process.env.HEAP_WARNING_THRESHOLD || DEFAULTS.warningThreshold * 100) / 100,
    criticalThreshold:
      parseFloat(process.env.HEAP_CRITICAL_THRESHOLD || DEFAULTS.criticalThreshold * 100) / 100,
    shutdownThreshold:
      parseFloat(process.env.HEAP_SHUTDOWN_THRESHOLD || DEFAULTS.shutdownThreshold * 100) / 100,
    interval: parseInt(process.env.MEMORY_MONITOR_INTERVAL_MS || DEFAULTS.interval, 10),
    maxHistorySize: parseInt(process.env.MEMORY_HISTORY_SIZE || DEFAULTS.maxHistorySize, 10),
  };
}

/**
 * MemoryMonitor class for heap usage monitoring
 *
 * @class MemoryMonitor
 * @example
 * const monitor = new MemoryMonitor();
 * monitor.on('warning', (data) => console.warn('Memory warning:', data));
 * monitor.start();
 */
class MemoryMonitor {
  /**
   * Create a MemoryMonitor instance
   *
   * @param {Object} config - Configuration options
   * @param {number} [config.warningThreshold=0.70] - Warning threshold (0-1)
   * @param {number} [config.criticalThreshold=0.85] - Critical threshold (0-1)
   * @param {number} [config.shutdownThreshold=0.95] - Shutdown threshold (0-1)
   * @param {number} [config.interval=5000] - Check interval in ms
   * @param {number} [config.maxHistorySize=100] - Max history entries to retain
   */
  constructor(config = {}) {
    const envConfig = getConfigFromEnv();

    this.warningThreshold = config.warningThreshold ?? envConfig.warningThreshold;
    this.criticalThreshold = config.criticalThreshold ?? envConfig.criticalThreshold;
    this.shutdownThreshold = config.shutdownThreshold ?? envConfig.shutdownThreshold;
    this.interval = config.interval ?? envConfig.interval;
    this.maxHistorySize = config.maxHistorySize ?? envConfig.maxHistorySize;

    // Internal state
    this.listeners = [];
    this.memoryHistory = [];
    this.monitor = null;
    this.isRunning = false;
    this.lastLevel = null;

    // Validate thresholds
    this._validateThresholds();
  }

  /**
   * Validate threshold configuration
   * @private
   */
  _validateThresholds() {
    if (this.warningThreshold >= this.criticalThreshold) {
      throw new Error('warningThreshold must be less than criticalThreshold');
    }
    if (this.criticalThreshold >= this.shutdownThreshold) {
      throw new Error('criticalThreshold must be less than shutdownThreshold');
    }
    if (this.warningThreshold < 0 || this.shutdownThreshold > 1) {
      throw new Error('Thresholds must be between 0 and 1');
    }
  }

  /**
   * Start the memory monitor
   * @returns {MemoryMonitor} this (for chaining)
   */
  start() {
    if (this.isRunning) {
      return this;
    }

    this.isRunning = true;
    this.monitor = setInterval(() => this.checkHeap(), this.interval);

    // Run an immediate check
    this.checkHeap();

    return this;
  }

  /**
   * Stop the memory monitor
   * @returns {MemoryMonitor} this (for chaining)
   */
  stop() {
    if (this.monitor) {
      clearInterval(this.monitor);
      this.monitor = null;
    }
    this.isRunning = false;
    return this;
  }

  /**
   * Check current heap usage and emit events if thresholds crossed
   * @returns {Object} Current memory entry
   */
  checkHeap() {
    const mem = process.memoryUsage();

    // Calculate heap percentage
    // Note: heapTotal is the current allocated heap, not the max
    // For max heap, we need to use v8.getHeapStatistics() which provides heap_size_limit
    let heapLimit;
    try {
      const v8 = require('v8');
      const heapStats = v8.getHeapStatistics();
      heapLimit = heapStats.heap_size_limit;
    } catch (_err) {
      // Fallback: estimate based on heapTotal with a safety margin
      // This is less accurate but works in environments without v8 module
      heapLimit = mem.heapTotal * 2;
    }

    const heapPercent = mem.heapUsed / heapLimit;

    const entry = {
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      heapLimit: heapLimit,
      heapPercent: heapPercent,
      external: mem.external,
      rss: mem.rss,
    };

    // Add to history with bounded size
    this.memoryHistory.push(entry);
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }

    // Always emit check event
    this.emit('check', entry);

    // Determine threshold level and emit appropriate event
    let level = null;
    if (heapPercent >= this.shutdownThreshold) {
      level = 'SHUTDOWN';
      this.emit('critical', {
        level: 'SHUTDOWN',
        percent: heapPercent,
        heapUsedMB: mem.heapUsed / 1024 / 1024,
        heapLimitMB: heapLimit / 1024 / 1024,
        message: `Heap usage at ${(heapPercent * 100).toFixed(1)}% - SHUTDOWN threshold exceeded`,
        entry,
      });
    } else if (heapPercent >= this.criticalThreshold) {
      level = 'CRITICAL';
      this.emit('critical', {
        level: 'CRITICAL',
        percent: heapPercent,
        heapUsedMB: mem.heapUsed / 1024 / 1024,
        heapLimitMB: heapLimit / 1024 / 1024,
        message: `Heap usage at ${(heapPercent * 100).toFixed(1)}% - CRITICAL threshold exceeded`,
        entry,
      });
    } else if (heapPercent >= this.warningThreshold) {
      level = 'WARNING';
      this.emit('warning', {
        level: 'WARNING',
        percent: heapPercent,
        heapUsedMB: mem.heapUsed / 1024 / 1024,
        heapLimitMB: heapLimit / 1024 / 1024,
        message: `Heap usage at ${(heapPercent * 100).toFixed(1)}% - WARNING threshold exceeded`,
        entry,
      });
    }

    // Emit recovery event if we dropped below a threshold
    if (this.lastLevel && !level) {
      this.emit('recovery', {
        previousLevel: this.lastLevel,
        percent: heapPercent,
        heapUsedMB: mem.heapUsed / 1024 / 1024,
        message: `Heap usage recovered to ${(heapPercent * 100).toFixed(1)}%`,
        entry,
      });
    }

    this.lastLevel = level;
    return entry;
  }

  /**
   * Register an event listener
   *
   * @param {string} event - Event name ('check', 'warning', 'critical', 'recovery')
   * @param {Function} callback - Callback function
   * @returns {MemoryMonitor} this (for chaining)
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
    return this;
  }

  /**
   * Remove an event listener
   *
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   * @returns {MemoryMonitor} this (for chaining)
   */
  off(event, callback) {
    this.listeners = this.listeners.filter(l => !(l.event === event && l.callback === callback));
    return this;
  }

  /**
   * Emit an event to all registered listeners
   *
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => {
        try {
          l.callback(data);
        } catch (err) {
          console.error(`[MemoryMonitor] Error in ${event} listener:`, err.message);
        }
      });
  }

  /**
   * Get memory statistics from history
   *
   * @returns {Object|null} Statistics object or null if no history
   */
  getStats() {
    if (this.memoryHistory.length === 0) {
      return null;
    }

    const current = this.memoryHistory[this.memoryHistory.length - 1];
    const percentages = this.memoryHistory.map(e => e.heapPercent);

    const min = Math.min(...percentages);
    const max = Math.max(...percentages);
    const avg = percentages.reduce((s, p) => s + p, 0) / percentages.length;

    // Calculate trend (positive = increasing, negative = decreasing)
    let trend = 0;
    if (this.memoryHistory.length >= 2) {
      const recent = percentages.slice(-10);
      if (recent.length >= 2) {
        trend = (recent[recent.length - 1] - recent[0]) / recent.length;
      }
    }

    return {
      current: {
        percent: current.heapPercent,
        heapUsedMB: current.heapUsed / 1024 / 1024,
        heapLimitMB: current.heapLimit / 1024 / 1024,
        timestamp: current.timestamp,
      },
      min,
      max,
      avg,
      trend,
      historySize: this.memoryHistory.length,
      level: this.lastLevel,
    };
  }

  /**
   * Check if spawning agents should be paused due to memory pressure
   *
   * @returns {Object} { shouldPause: boolean, reason: string|null, stats: Object|null }
   */
  shouldPauseSpawning() {
    const stats = this.getStats();

    if (!stats) {
      return { shouldPause: false, reason: null, stats: null };
    }

    if (stats.current.percent >= this.criticalThreshold) {
      return {
        shouldPause: true,
        reason: `Heap usage at ${(stats.current.percent * 100).toFixed(1)}% exceeds critical threshold (${this.criticalThreshold * 100}%)`,
        stats,
      };
    }

    // Also pause if trend is strongly increasing and we're above warning
    if (stats.current.percent >= this.warningThreshold && stats.trend > 0.01) {
      return {
        shouldPause: true,
        reason: `Heap usage at ${(stats.current.percent * 100).toFixed(1)}% with increasing trend`,
        stats,
      };
    }

    return { shouldPause: false, reason: null, stats };
  }

  /**
   * Attempt to trigger garbage collection (if exposed)
   * Note: Requires --expose-gc flag to be effective
   *
   * @returns {boolean} True if GC was triggered
   */
  triggerGC() {
    if (typeof global.gc === 'function') {
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * Get current memory status as a formatted string
   *
   * @returns {string} Status string
   */
  getStatusString() {
    const stats = this.getStats();
    if (!stats) {
      return 'No memory data available';
    }

    const { current, min, max, avg, trend, level } = stats;
    const trendStr = trend > 0 ? `+${(trend * 100).toFixed(2)}%` : `${(trend * 100).toFixed(2)}%`;

    return [
      `Heap: ${current.heapUsedMB.toFixed(1)}MB / ${current.heapLimitMB.toFixed(1)}MB (${(current.percent * 100).toFixed(1)}%)`,
      `Range: ${(min * 100).toFixed(1)}% - ${(max * 100).toFixed(1)}%`,
      `Avg: ${(avg * 100).toFixed(1)}%`,
      `Trend: ${trendStr}`,
      level ? `Status: ${level}` : 'Status: OK',
    ].join(' | ');
  }

  /**
   * Clear history and reset state
   * @returns {MemoryMonitor} this (for chaining)
   */
  reset() {
    this.memoryHistory = [];
    this.lastLevel = null;
    return this;
  }
}

// Singleton instance for global monitoring
let globalMonitor = null;

/**
 * Get the global MemoryMonitor instance
 * Creates one if it doesn't exist
 *
 * @param {Object} [config] - Configuration (only used on first call)
 * @returns {MemoryMonitor} Global monitor instance
 */
function getGlobalMonitor(config = {}) {
  if (!globalMonitor) {
    globalMonitor = new MemoryMonitor(config);
  }
  return globalMonitor;
}

/**
 * Reset the global monitor (for testing)
 */
function resetGlobalMonitor() {
  if (globalMonitor) {
    globalMonitor.stop();
    globalMonitor = null;
  }
}

module.exports = MemoryMonitor;
module.exports.MemoryMonitor = MemoryMonitor;
module.exports.getGlobalMonitor = getGlobalMonitor;
module.exports.resetGlobalMonitor = resetGlobalMonitor;
module.exports.DEFAULTS = DEFAULTS;
