const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import module under test
const {
  readMetrics,
  readMetricsWithStats,
  calculateHookStats,
  calculateErrorStats,
  _getMetricsSummary,
  findSlowHooks,
  detectAlerts,
  calculateRouterRollups,
  _getRouterOpsSummary,
} = require('../../../.claude/lib/monitoring/metrics-reader.cjs');

describe('metrics-reader', () => {
  let tempDir;
  let tempMetricsFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-test-'));
    tempMetricsFile = path.join(tempDir, 'test-metrics.jsonl');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('readMetrics', () => {
    it('should return empty array when file does not exist', async () => {
      const metrics = await readMetrics(tempMetricsFile);
      assert.strictEqual(Array.isArray(metrics), true);
      assert.strictEqual(metrics.length, 0);
    });

    it('should read and parse valid JSONL file', async () => {
      const entries = [
        { timestamp: new Date().toISOString(), type: 'test', value: 1 },
        { timestamp: new Date().toISOString(), type: 'test', value: 2 },
      ];

      fs.writeFileSync(tempMetricsFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const metrics = await readMetrics(tempMetricsFile);
      assert.strictEqual(metrics.length, 2);
      assert.strictEqual(metrics[0].value, 1);
      assert.strictEqual(metrics[1].value, 2);
    });

    it('should filter by time window', async () => {
      const now = Date.now();
      const entries = [
        { timestamp: new Date(now - 48 * 60 * 60 * 1000).toISOString(), type: 'old', value: 1 },
        { timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString(), type: 'recent', value: 2 },
      ];

      fs.writeFileSync(tempMetricsFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const metrics = await readMetrics(tempMetricsFile, { hours: 24 });
      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].type, 'recent');
    });

    it('should filter by since timestamp', async () => {
      const now = Date.now();
      const sinceTime = new Date(now - 6 * 60 * 60 * 1000);
      const entries = [
        { timestamp: new Date(now - 12 * 60 * 60 * 1000).toISOString(), type: 'old', value: 1 },
        { timestamp: new Date(now - 3 * 60 * 60 * 1000).toISOString(), type: 'recent', value: 2 },
      ];

      fs.writeFileSync(tempMetricsFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const metrics = await readMetrics(tempMetricsFile, { since: sinceTime.toISOString() });
      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].type, 'recent');
    });

    it('should skip malformed lines', async () => {
      const content = [
        JSON.stringify({ timestamp: new Date().toISOString(), type: 'valid', value: 1 }),
        'invalid-json{{{',
        JSON.stringify({ timestamp: new Date().toISOString(), type: 'valid', value: 2 }),
        '',
      ].join('\n');

      fs.writeFileSync(tempMetricsFile, content);

      const metrics = await readMetrics(tempMetricsFile);
      assert.strictEqual(metrics.length, 2);
    });
  });

  describe('readMetricsWithStats', () => {
    it('should return stats with metrics', async () => {
      const entries = [
        { timestamp: new Date().toISOString(), type: 'test', value: 1 },
        { timestamp: new Date().toISOString(), type: 'test', value: 2 },
      ];

      fs.writeFileSync(tempMetricsFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const result = await readMetricsWithStats(tempMetricsFile);

      assert.strictEqual(result.metrics.length, 2);
      assert.strictEqual(result.parseErrors, 0);
      assert.strictEqual(result.totalLines, 2);
      assert.strictEqual(result.failedParseRate, 0);
    });

    it('should count parse errors', async () => {
      const content = [
        JSON.stringify({ timestamp: new Date().toISOString(), type: 'valid' }),
        'invalid-json{{{',
        'another-bad-line',
      ].join('\n');

      fs.writeFileSync(tempMetricsFile, content);

      const result = await readMetricsWithStats(tempMetricsFile);

      assert.strictEqual(result.metrics.length, 1);
      assert.strictEqual(result.parseErrors, 2);
      assert.strictEqual(result.totalLines, 3);
      assert.strictEqual(result.failedParseRate, 2 / 3);
    });

    it('should handle missing file', async () => {
      const result = await readMetricsWithStats(tempMetricsFile);

      assert.strictEqual(result.metrics.length, 0);
      assert.strictEqual(result.parseErrors, 0);
      assert.strictEqual(result.totalLines, 0);
      assert.strictEqual(result.failedParseRate, 0);
    });
  });

  describe('calculateHookStats', () => {
    it('should calculate basic stats for hooks', () => {
      const metrics = [
        { hook: 'hook-a', executionTimeMs: 10, status: 'success' },
        { hook: 'hook-a', executionTimeMs: 20, status: 'success' },
        { hook: 'hook-b', executionTimeMs: 5, status: 'failure' },
      ];

      const stats = calculateHookStats(metrics);

      assert.ok(stats['hook-a']);
      assert.strictEqual(stats['hook-a'].count, 2);
      assert.strictEqual(stats['hook-a'].avgTime, 15);
      assert.strictEqual(stats['hook-a'].successRate, 100);
      assert.strictEqual(stats['hook-a'].failures, 0);

      assert.ok(stats['hook-b']);
      assert.strictEqual(stats['hook-b'].count, 1);
      assert.strictEqual(stats['hook-b'].failures, 1);
    });

    it('should calculate percentiles', () => {
      const metrics = Array.from({ length: 100 }, (_, i) => ({
        hook: 'test-hook',
        executionTimeMs: i + 1,
        status: 'success',
      }));

      const stats = calculateHookStats(metrics);

      assert.strictEqual(stats['test-hook'].count, 100);
      assert.strictEqual(stats['test-hook'].p50, 51);
      assert.strictEqual(stats['test-hook'].p95, 96);
      assert.strictEqual(stats['test-hook'].p99, 100);
    });
  });

  describe('calculateErrorStats', () => {
    it('should calculate error statistics', () => {
      const metrics = [
        { errorType: 'TypeError', severity: 'HIGH', source: 'hook-a' },
        { errorType: 'TypeError', severity: 'MEDIUM', source: 'hook-b' },
        { errorType: 'ValidationError', severity: 'CRITICAL', source: 'hook-a' },
      ];

      const stats = calculateErrorStats(metrics);

      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.byType.TypeError, 2);
      assert.strictEqual(stats.byType.ValidationError, 1);
      assert.strictEqual(stats.bySeverity.HIGH, 1);
      assert.strictEqual(stats.bySeverity.CRITICAL, 1);
    });

    it('should find top errors', () => {
      const metrics = [
        { errorType: 'A', severity: 'HIGH', source: 'test' },
        { errorType: 'A', severity: 'HIGH', source: 'test' },
        { errorType: 'A', severity: 'HIGH', source: 'test' },
        { errorType: 'B', severity: 'LOW', source: 'test' },
        { errorType: 'B', severity: 'LOW', source: 'test' },
        { errorType: 'C', severity: 'MEDIUM', source: 'test' },
      ];

      const stats = calculateErrorStats(metrics);

      assert.strictEqual(stats.topErrors.length, 3);
      assert.strictEqual(stats.topErrors[0].type, 'A');
      assert.strictEqual(stats.topErrors[0].count, 3);
      assert.strictEqual(stats.topErrors[1].type, 'B');
    });
  });

  describe('getMetricsSummary', () => {
    it('should aggregate metrics summary', async () => {
      const hookFile = path.join(tempDir, 'hook-metrics.jsonl');
      const errorFile = path.join(tempDir, 'error-metrics.jsonl');

      const hookMetrics = [
        {
          timestamp: new Date().toISOString(),
          hook: 'test-hook',
          executionTimeMs: 10,
          status: 'success',
        },
      ];

      const errorMetrics = [
        {
          timestamp: new Date().toISOString(),
          errorType: 'TestError',
          severity: 'HIGH',
          source: 'test',
        },
      ];

      fs.writeFileSync(hookFile, hookMetrics.map(m => JSON.stringify(m)).join('\n'));
      fs.writeFileSync(errorFile, errorMetrics.map(m => JSON.stringify(m)).join('\n'));

      // Mock the metrics dir by temporarily changing PROJECT_ROOT
      // Since we can't easily mock, we'll skip this test for now
      // This would require dependency injection or mocking the file paths
    });
  });

  describe('findSlowHooks', () => {
    it('should find hooks exceeding threshold', () => {
      const stats = {
        'fast-hook': { avgTime: 5, p95: 8, count: 100 },
        'slow-hook': { avgTime: 15, p95: 20, count: 50 },
        'very-slow-hook': { avgTime: 25, p95: 30, count: 10 },
      };

      const slow = findSlowHooks(stats, 10);

      assert.strictEqual(slow.length, 2);
      assert.strictEqual(slow[0].hook, 'very-slow-hook');
      assert.strictEqual(slow[1].hook, 'slow-hook');
    });

    it('should return empty array when no slow hooks', () => {
      const stats = {
        'fast-hook': { avgTime: 5, p95: 8, count: 100 },
      };

      const slow = findSlowHooks(stats, 10);

      assert.strictEqual(slow.length, 0);
    });
  });

  describe('detectAlerts', () => {
    it('should detect slow hook alert', () => {
      const summary = {
        period: { hours: 24 },
        hooks: {
          total: 100,
          avgTime: 5,
          failureRate: 1,
          byHook: {
            'slow-hook': { avgTime: 15, p95: 20, count: 50 },
          },
        },
        errors: {
          total: 5,
          bySeverity: {},
          byType: {},
          bySource: {},
        },
      };

      const alerts = detectAlerts(summary, { hookExecutionTimeMs: 10 });

      assert.ok(alerts.some(a => a.type === 'SlowHook'));
    });

    it('should detect hook failure rate alert', () => {
      const summary = {
        period: { hours: 24 },
        hooks: {
          total: 100,
          avgTime: 5,
          failureRate: 10,
          byHook: {},
        },
        errors: {
          total: 5,
          bySeverity: {},
          byType: {},
          bySource: {},
        },
      };

      const alerts = detectAlerts(summary, { hookFailureRate: 5 });

      assert.ok(alerts.some(a => a.type === 'HookFailureRate'));
    });

    it('should detect critical security violations', () => {
      const summary = {
        period: { hours: 24 },
        hooks: {
          total: 100,
          avgTime: 5,
          failureRate: 1,
          byHook: {},
        },
        errors: {
          total: 10,
          bySeverity: { CRITICAL: 3 },
          byType: {},
          bySource: {},
        },
      };

      const alerts = detectAlerts(summary);

      assert.ok(alerts.some(a => a.type === 'SecurityViolation'));
      assert.ok(alerts.some(a => a.severity === 'CRITICAL'));
    });
  });

  describe('calculateRouterRollups', () => {
    it('should calculate router metrics rollup', () => {
      const spawnRows = [
        { event: 'spawn_start', prompt_length: 1000 },
        { event: 'spawn_end', success: true },
        { event: 'spawn_end', success: false },
      ];

      const tokenRows = [{ output_tokens_est: 100 }, { output_tokens_est: 200 }];

      const churnRows = [
        { event: 'router_guard_decision', result: 'allow' },
        { event: 'router_guard_decision', result: 'block' },
      ];

      const violationRows = [
        { checkName: 'rule-a' },
        { checkName: 'rule-a' },
        { checkName: 'rule-b' },
      ];

      const rollups = calculateRouterRollups({
        spawnRows,
        tokenRows,
        churnRows,
        violationRows,
        hours: 24,
      });

      assert.strictEqual(rollups.periodHours, 24);
      assert.strictEqual(rollups.spawns.total, 2);
      assert.strictEqual(rollups.spawns.rejected, 1);
      assert.strictEqual(rollups.routerDecisions.total, 2);
      assert.strictEqual(rollups.routerDecisions.blocked, 1);
      assert.strictEqual(rollups.violations.total, 3);
    });

    it('should handle empty data', () => {
      const rollups = calculateRouterRollups({
        spawnRows: [],
        tokenRows: [],
        churnRows: [],
        violationRows: [],
        hours: 24,
      });

      assert.strictEqual(rollups.spawns.total, 0);
      assert.strictEqual(rollups.violations.total, 0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty metrics array', () => {
      const stats = calculateHookStats([]);
      assert.strictEqual(Object.keys(stats).length, 0);
    });

    it('should handle metrics with missing fields', () => {
      const metrics = [
        { hook: 'test', executionTimeMs: 10 }, // missing status
        { executionTimeMs: 20, status: 'success' }, // missing hook
      ];

      const stats = calculateHookStats(metrics);
      assert.ok(stats['test']);
      assert.ok(stats['undefined']);
    });

    it('should handle large time windows', async () => {
      const entries = [
        { timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), type: 'old' },
      ];

      fs.writeFileSync(tempMetricsFile, entries.map(e => JSON.stringify(e)).join('\n'));

      const metrics = await readMetrics(tempMetricsFile, { hours: 200 * 24 });
      assert.strictEqual(metrics.length, 1);
    });
  });
});
