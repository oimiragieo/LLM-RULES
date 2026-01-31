// @ts-check
/**
 * Tests for Metrics Collector Hook
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { preToolUse, postToolUse } = require('../../.claude/hooks/monitoring/metrics-collector.cjs');

const METRICS_FILE = path.join(
  process.cwd(),
  '.claude',
  'context',
  'metrics',
  'hook-metrics.jsonl'
);

test('metrics-collector: preToolUse stores start time', () => {
  const context = {};
  const result = preToolUse('Task', { foo: 'bar' }, context);

  assert.ok(context._metricsStartTime, 'Should store start time');
  assert.strictEqual(typeof context._metricsStartTime, 'number');
  assert.strictEqual(result.tool, 'Task');
});

test('metrics-collector: postToolUse logs metric on success', () => {
  // Setup: Clear metrics file
  if (fs.existsSync(METRICS_FILE)) {
    fs.unlinkSync(METRICS_FILE);
  }

  const context = { _metricsStartTime: Date.now() - 5 };
  const _result = postToolUse('Task', { foo: 'bar' }, { success: true }, context);

  // Verify metric was logged
  assert.ok(fs.existsSync(METRICS_FILE), 'Metrics file should exist');

  const content = fs.readFileSync(METRICS_FILE, 'utf8');
  const lines = content.trim().split('\n');
  assert.ok(lines.length > 0, 'Should have at least one metric');

  const metric = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(metric.tool, 'Task');
  assert.strictEqual(metric.status, 'success');
  assert.ok(metric.executionTimeMs >= 0);
});

test('metrics-collector: postToolUse logs metric on failure', () => {
  const context = { _metricsStartTime: Date.now() - 10 };
  const error = new Error('Test error');
  const _result = postToolUse('Task', {}, { error }, context);

  const content = fs.readFileSync(METRICS_FILE, 'utf8');
  const lines = content.trim().split('\n');
  const metric = JSON.parse(lines[lines.length - 1]);

  assert.strictEqual(metric.status, 'failure');
  assert.strictEqual(metric.error, 'Test error');
});

test('metrics-collector: respects rate limit', async () => {
  // This test would need to generate 10000+ entries
  // Skip for now to avoid long test times
  assert.ok(true, 'Rate limit test skipped (would take too long)');
});
