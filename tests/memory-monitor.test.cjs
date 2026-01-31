/**
 * Memory Monitor Test Suite
 *
 * Tests for the MemoryMonitor class that provides heap usage monitoring
 * and threshold-based event emission for memory safeguards.
 *
 * Test Categories:
 * 1. Configuration (5 tests) - Constructor, environment variables, validation
 * 2. Heap Checking (6 tests) - Memory measurement, history tracking
 * 3. Threshold Events (8 tests) - Warning, critical, shutdown, recovery events
 * 4. Statistics (4 tests) - Min, max, avg, trend calculation
 * 5. Spawn Throttling (4 tests) - Integration with routing guard
 * 6. Lifecycle (3 tests) - Start, stop, reset
 *
 * Total: 30 tests
 */

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');

const MemoryMonitor = require('../.claude/lib/utils/memory-monitor.cjs');
const { getGlobalMonitor, resetGlobalMonitor, DEFAULTS } = MemoryMonitor;

describe('MemoryMonitor - Category 1: Configuration (5 tests)', () => {
  afterEach(() => {
    // Clean up any running monitors
    resetGlobalMonitor();
    // Reset environment variables
    delete process.env.HEAP_WARNING_THRESHOLD;
    delete process.env.HEAP_CRITICAL_THRESHOLD;
    delete process.env.HEAP_SHUTDOWN_THRESHOLD;
    delete process.env.MEMORY_MONITOR_INTERVAL_MS;
    delete process.env.MEMORY_HISTORY_SIZE;
  });

  it('should create with default configuration', () => {
    const monitor = new MemoryMonitor();

    assert.strictEqual(monitor.warningThreshold, DEFAULTS.warningThreshold);
    assert.strictEqual(monitor.criticalThreshold, DEFAULTS.criticalThreshold);
    assert.strictEqual(monitor.shutdownThreshold, DEFAULTS.shutdownThreshold);
    assert.strictEqual(monitor.interval, DEFAULTS.interval);
    assert.strictEqual(monitor.maxHistorySize, DEFAULTS.maxHistorySize);
  });

  it('should accept custom configuration', () => {
    const monitor = new MemoryMonitor({
      warningThreshold: 0.6,
      criticalThreshold: 0.75,
      shutdownThreshold: 0.9,
      interval: 1000,
      maxHistorySize: 50,
    });

    assert.strictEqual(monitor.warningThreshold, 0.6);
    assert.strictEqual(monitor.criticalThreshold, 0.75);
    assert.strictEqual(monitor.shutdownThreshold, 0.9);
    assert.strictEqual(monitor.interval, 1000);
    assert.strictEqual(monitor.maxHistorySize, 50);
  });

  it('should read configuration from environment variables', () => {
    process.env.HEAP_WARNING_THRESHOLD = '60';
    process.env.HEAP_CRITICAL_THRESHOLD = '80';
    process.env.HEAP_SHUTDOWN_THRESHOLD = '92';
    process.env.MEMORY_MONITOR_INTERVAL_MS = '2000';
    process.env.MEMORY_HISTORY_SIZE = '200';

    const monitor = new MemoryMonitor();

    assert.strictEqual(monitor.warningThreshold, 0.6);
    assert.strictEqual(monitor.criticalThreshold, 0.8);
    assert.strictEqual(monitor.shutdownThreshold, 0.92);
    assert.strictEqual(monitor.interval, 2000);
    assert.strictEqual(monitor.maxHistorySize, 200);
  });

  it('should throw error for invalid threshold order', () => {
    assert.throws(() => {
      new MemoryMonitor({
        warningThreshold: 0.9,
        criticalThreshold: 0.8,
        shutdownThreshold: 0.95,
      });
    }, /warningThreshold must be less than criticalThreshold/);

    assert.throws(() => {
      new MemoryMonitor({
        warningThreshold: 0.7,
        criticalThreshold: 0.95,
        shutdownThreshold: 0.85,
      });
    }, /criticalThreshold must be less than shutdownThreshold/);
  });

  it('should throw error for out-of-range thresholds', () => {
    assert.throws(() => {
      new MemoryMonitor({
        warningThreshold: -0.1,
        criticalThreshold: 0.85,
        shutdownThreshold: 0.95,
      });
    }, /Thresholds must be between 0 and 1/);

    assert.throws(() => {
      new MemoryMonitor({
        warningThreshold: 0.7,
        criticalThreshold: 0.85,
        shutdownThreshold: 1.1,
      });
    }, /Thresholds must be between 0 and 1/);
  });
});

describe('MemoryMonitor - Category 2: Heap Checking (6 tests)', () => {
  let monitor;

  beforeEach(() => {
    monitor = new MemoryMonitor({ interval: 100, maxHistorySize: 10 });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  it('should check heap and return entry with all fields', () => {
    const entry = monitor.checkHeap();

    assert.ok(entry.timestamp > 0, 'Should have timestamp');
    assert.ok(entry.heapUsed > 0, 'Should have heapUsed');
    assert.ok(entry.heapTotal > 0, 'Should have heapTotal');
    assert.ok(entry.heapLimit > 0, 'Should have heapLimit');
    assert.ok(entry.heapPercent >= 0 && entry.heapPercent <= 1, 'heapPercent should be 0-1');
    assert.ok(entry.external >= 0, 'Should have external');
    assert.ok(entry.rss > 0, 'Should have rss');
  });

  it('should add entries to history', () => {
    assert.strictEqual(monitor.memoryHistory.length, 0);

    monitor.checkHeap();
    assert.strictEqual(monitor.memoryHistory.length, 1);

    monitor.checkHeap();
    assert.strictEqual(monitor.memoryHistory.length, 2);
  });

  it('should bound history to maxHistorySize', () => {
    // Fill history to max
    for (let i = 0; i < 15; i++) {
      monitor.checkHeap();
    }

    // History should be capped at maxHistorySize (10)
    assert.strictEqual(monitor.memoryHistory.length, 10);
  });

  it('should emit check event on every check', async () => {
    let checkCount = 0;
    let lastEntry = null;

    monitor.on('check', entry => {
      checkCount++;
      lastEntry = entry;
    });

    monitor.checkHeap();
    monitor.checkHeap();

    assert.strictEqual(checkCount, 2);
    assert.ok(lastEntry.heapUsed > 0);
  });

  it('should calculate heapPercent correctly', () => {
    const entry = monitor.checkHeap();

    // heapPercent should be heapUsed / heapLimit
    const expectedPercent = entry.heapUsed / entry.heapLimit;
    assert.strictEqual(entry.heapPercent, expectedPercent);
  });

  it('should use v8 heap limit when available', () => {
    const entry = monitor.checkHeap();

    // heapLimit should be larger than heapTotal in most cases
    // (v8 heap_size_limit is typically larger than current heapTotal)
    assert.ok(entry.heapLimit >= entry.heapTotal);
  });
});

describe('MemoryMonitor - Category 3: Threshold Events (8 tests)', () => {
  let monitor;

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  it('should not emit warning/critical when below thresholds', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.99,
      criticalThreshold: 0.995,
      shutdownThreshold: 0.999,
    });

    let warningEmitted = false;
    let criticalEmitted = false;

    monitor.on('warning', () => {
      warningEmitted = true;
    });
    monitor.on('critical', () => {
      criticalEmitted = true;
    });

    // With thresholds at 99%+, normal heap usage won't trigger events
    monitor.checkHeap();

    assert.strictEqual(warningEmitted, false);
    assert.strictEqual(criticalEmitted, false);
  });

  it('should emit warning event when warning threshold exceeded', async () => {
    // Use very low thresholds to ensure we trigger them
    monitor = new MemoryMonitor({
      warningThreshold: 0.001, // 0.1% - any normal usage exceeds this
      criticalThreshold: 0.99,
      shutdownThreshold: 0.999,
    });

    let warningData = null;

    monitor.on('warning', data => {
      warningData = data;
    });

    monitor.checkHeap();

    assert.ok(warningData !== null, 'Should emit warning');
    assert.strictEqual(warningData.level, 'WARNING');
    assert.ok(warningData.percent > 0);
    assert.ok(warningData.heapUsedMB > 0);
    assert.ok(warningData.message.includes('WARNING'));
  });

  it('should emit critical event when critical threshold exceeded', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.0001,
      criticalThreshold: 0.001, // 0.1% - any normal usage exceeds this
      shutdownThreshold: 0.999,
    });

    let criticalData = null;

    monitor.on('critical', data => {
      criticalData = data;
    });

    monitor.checkHeap();

    assert.ok(criticalData !== null, 'Should emit critical');
    assert.strictEqual(criticalData.level, 'CRITICAL');
    assert.ok(criticalData.message.includes('CRITICAL'));
  });

  it('should emit shutdown event when shutdown threshold exceeded', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.00001,
      criticalThreshold: 0.0001,
      shutdownThreshold: 0.001, // 0.1% - any normal usage exceeds this
    });

    let shutdownData = null;

    monitor.on('critical', data => {
      if (data.level === 'SHUTDOWN') {
        shutdownData = data;
      }
    });

    monitor.checkHeap();

    assert.ok(shutdownData !== null, 'Should emit shutdown');
    assert.strictEqual(shutdownData.level, 'SHUTDOWN');
    assert.ok(shutdownData.message.includes('SHUTDOWN'));
  });

  it('should track lastLevel correctly', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.001,
      criticalThreshold: 0.99,
      shutdownThreshold: 0.999,
    });

    // Initially null
    assert.strictEqual(monitor.lastLevel, null);

    // After check (should trigger warning)
    monitor.checkHeap();
    assert.strictEqual(monitor.lastLevel, 'WARNING');
  });

  it('should emit recovery event when dropping below thresholds', () => {
    // Start with low thresholds to trigger warning
    monitor = new MemoryMonitor({
      warningThreshold: 0.001,
      criticalThreshold: 0.99,
      shutdownThreshold: 0.999,
    });

    monitor.checkHeap(); // Triggers warning
    assert.strictEqual(monitor.lastLevel, 'WARNING');

    // Now set high thresholds and check again
    // We can't easily lower heap usage, so we'll simulate by changing thresholds
    monitor.warningThreshold = 0.99;

    let recoveryData = null;
    monitor.on('recovery', data => {
      recoveryData = data;
    });

    monitor.checkHeap();

    assert.ok(recoveryData !== null, 'Should emit recovery');
    assert.strictEqual(recoveryData.previousLevel, 'WARNING');
    assert.ok(recoveryData.message.includes('recovered'));
  });

  it('should handle multiple listeners for same event', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.001,
      criticalThreshold: 0.99,
      shutdownThreshold: 0.999,
    });

    let count = 0;

    monitor.on('warning', () => {
      count++;
    });
    monitor.on('warning', () => {
      count++;
    });

    monitor.checkHeap();

    assert.strictEqual(count, 2);
  });

  it('should allow removing listeners with off()', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.001,
      criticalThreshold: 0.99,
      shutdownThreshold: 0.999,
    });

    let count = 0;
    const listener = () => {
      count++;
    };

    monitor.on('warning', listener);
    monitor.checkHeap();
    assert.strictEqual(count, 1);

    monitor.off('warning', listener);
    monitor.checkHeap();
    assert.strictEqual(count, 1); // Should not increment
  });
});

describe('MemoryMonitor - Category 4: Statistics (4 tests)', () => {
  let monitor;

  beforeEach(() => {
    monitor = new MemoryMonitor({ interval: 100, maxHistorySize: 100 });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  it('should return null stats when no history', () => {
    const stats = monitor.getStats();
    assert.strictEqual(stats, null);
  });

  it('should calculate min, max, avg correctly', () => {
    // Add multiple entries
    for (let i = 0; i < 5; i++) {
      monitor.checkHeap();
    }

    const stats = monitor.getStats();

    assert.ok(stats !== null);
    assert.ok(stats.min >= 0 && stats.min <= 1);
    assert.ok(stats.max >= stats.min);
    assert.ok(stats.avg >= stats.min && stats.avg <= stats.max);
    assert.strictEqual(stats.historySize, 5);
  });

  it('should include current entry details', () => {
    monitor.checkHeap();

    const stats = monitor.getStats();

    assert.ok(stats.current);
    assert.ok(stats.current.percent >= 0);
    assert.ok(stats.current.heapUsedMB > 0);
    assert.ok(stats.current.heapLimitMB > 0);
    assert.ok(stats.current.timestamp > 0);
  });

  it('should calculate trend from recent entries', () => {
    // Add entries
    for (let i = 0; i < 10; i++) {
      monitor.checkHeap();
    }

    const stats = monitor.getStats();

    // Trend should be a number (can be positive, negative, or near zero)
    assert.ok(typeof stats.trend === 'number');
    assert.ok(!Number.isNaN(stats.trend));
  });
});

describe('MemoryMonitor - Category 5: Spawn Throttling (4 tests)', () => {
  let monitor;

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  it('should not pause spawning when below warning threshold', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.99,
      criticalThreshold: 0.995,
      shutdownThreshold: 0.999,
    });

    monitor.checkHeap();
    const result = monitor.shouldPauseSpawning();

    assert.strictEqual(result.shouldPause, false);
    assert.strictEqual(result.reason, null);
    assert.ok(result.stats);
  });

  it('should pause spawning when above critical threshold', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.00001,
      criticalThreshold: 0.0001,
      shutdownThreshold: 0.999,
    });

    monitor.checkHeap();
    const result = monitor.shouldPauseSpawning();

    assert.strictEqual(result.shouldPause, true);
    assert.ok(result.reason.includes('critical'));
    assert.ok(result.stats);
  });

  it('should return shouldPause false when no stats available', () => {
    monitor = new MemoryMonitor();

    const result = monitor.shouldPauseSpawning();

    assert.strictEqual(result.shouldPause, false);
    assert.strictEqual(result.stats, null);
  });

  it('should provide detailed stats in response', () => {
    monitor = new MemoryMonitor({
      warningThreshold: 0.001,
      criticalThreshold: 0.99,
      shutdownThreshold: 0.999,
    });

    monitor.checkHeap();
    const result = monitor.shouldPauseSpawning();

    assert.ok(result.stats);
    assert.ok(result.stats.current);
    assert.ok(typeof result.stats.min === 'number');
    assert.ok(typeof result.stats.max === 'number');
    assert.ok(typeof result.stats.avg === 'number');
  });
});

describe('MemoryMonitor - Category 6: Lifecycle (3 tests)', () => {
  let monitor;

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
    resetGlobalMonitor();
  });

  it('should start and stop correctly', async () => {
    monitor = new MemoryMonitor({ interval: 50 });

    assert.strictEqual(monitor.isRunning, false);

    monitor.start();
    assert.strictEqual(monitor.isRunning, true);

    // Wait for a few checks
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.ok(monitor.memoryHistory.length >= 2);

    monitor.stop();
    assert.strictEqual(monitor.isRunning, false);

    const historyBefore = monitor.memoryHistory.length;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(monitor.memoryHistory.length, historyBefore);
  });

  it('should reset history and state', () => {
    monitor = new MemoryMonitor();

    monitor.checkHeap();
    monitor.checkHeap();
    assert.ok(monitor.memoryHistory.length > 0);

    monitor.reset();

    assert.strictEqual(monitor.memoryHistory.length, 0);
    assert.strictEqual(monitor.lastLevel, null);
  });

  it('should support global singleton pattern', () => {
    const monitor1 = getGlobalMonitor({ interval: 100 });
    const monitor2 = getGlobalMonitor({ interval: 200 }); // Config ignored

    assert.strictEqual(monitor1, monitor2);
    assert.strictEqual(monitor1.interval, 100);

    resetGlobalMonitor();

    const monitor3 = getGlobalMonitor({ interval: 300 });
    assert.notStrictEqual(monitor1, monitor3);
    assert.strictEqual(monitor3.interval, 300);
  });
});

describe('MemoryMonitor - Additional Utilities', () => {
  let monitor;

  beforeEach(() => {
    monitor = new MemoryMonitor();
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  it('should generate status string', () => {
    monitor.checkHeap();

    const status = monitor.getStatusString();

    assert.ok(typeof status === 'string');
    assert.ok(status.includes('Heap:'));
    assert.ok(status.includes('MB'));
    assert.ok(status.includes('Range:'));
    assert.ok(status.includes('Status:'));
  });

  it('should handle status string when no data', () => {
    const status = monitor.getStatusString();
    assert.strictEqual(status, 'No memory data available');
  });

  it('should attempt GC trigger', () => {
    // triggerGC returns false if global.gc is not available
    // (which is the case unless --expose-gc flag is used)
    const result = monitor.triggerGC();
    assert.strictEqual(typeof result, 'boolean');
  });

  it('should support method chaining', () => {
    const result = monitor
      .on('check', () => {})
      .on('warning', () => {})
      .start()
      .stop()
      .reset();

    assert.strictEqual(result, monitor);
  });
});
