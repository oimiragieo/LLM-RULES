#!/usr/bin/env node
/* eslint-disable max-lines -- comprehensive test suite covering all LogAggregator behaviors */
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { LogAggregator } = require('../../.claude/lib/monitoring/log-aggregator.cjs');

// Helper to write a JSONL file with given events
function writeJsonl(filePath, events) {
  const content = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

// Base timestamps for test events
const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-01T01:00:00.000Z';
const T3 = '2026-01-01T02:00:00.000Z';
const T4 = '2026-01-01T03:00:00.000Z';
const T5 = '2026-01-01T04:00:00.000Z';

let tmpDir;

describe('LogAggregator', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-aggregator-'));
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      // best-effort cleanup
    }
  });

  describe('constructor', () => {
    it('accepts a custom metricsDir', () => {
      const agg = new LogAggregator(tmpDir);
      assert.strictEqual(agg.metricsDir, tmpDir);
    });

    it('uses default metricsDir when none provided', () => {
      const agg = new LogAggregator();
      assert.ok(typeof agg.metricsDir === 'string');
      assert.ok(agg.metricsDir.length > 0);
    });
  });

  describe('query — empty directory', () => {
    it('returns empty array when metricsDir is empty', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-empty-'));
      try {
        const agg = new LogAggregator(emptyDir);
        const result = agg.query();
        assert.deepEqual(result, []);
      } finally {
        try {
          fs.rmSync(emptyDir, { recursive: true, force: true });
        } catch (_err) {
          // ignore
        }
      }
    });

    it('returns empty array when metricsDir does not exist', () => {
      const agg = new LogAggregator(path.join(os.tmpdir(), 'nonexistent-' + Date.now()));
      const result = agg.query();
      assert.deepEqual(result, []);
    });
  });

  describe('query — reads and merges events from all JSONL streams (VAL-OB-001)', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-merge-'));

      // flight-recorder events
      writeJsonl(path.join(fixtureDir, 'flight-recorder.jsonl'), [
        { timestamp: T1, event: 'spawn_start', component: 'flight-recorder', traceId: 'tr1' },
        { timestamp: T3, event: 'spawn_end', component: 'flight-recorder', traceId: 'tr1' },
      ]);

      // spawn-log events
      writeJsonl(path.join(fixtureDir, 'spawn-log.jsonl'), [
        { timestamp: T2, event: 'spawn_start', task_id: 'task1', session_id: 'sess1' },
        { timestamp: T4, event: 'spawn_end', task_id: 'task1', success: true },
      ]);

      // router-churn events
      writeJsonl(path.join(fixtureDir, 'router-churn.jsonl'), [
        { timestamp: T5, event: 'router_guard_decision', component: 'router', result: 'allow' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('reads events from all matching JSONL files', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query();
      assert.strictEqual(result.length, 5);
    });

    it('returns events sorted by timestamp ascending', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query();
      for (let i = 1; i < result.length; i++) {
        const prev = new Date(result[i - 1].timestamp).getTime();
        const curr = new Date(result[i].timestamp).getTime();
        assert.ok(prev <= curr, `Event at index ${i} is not in ascending order`);
      }
    });

    it('normalizes events to {timestamp, type, component, data}', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query();
      for (const event of result) {
        assert.ok('timestamp' in event, 'Missing timestamp');
        assert.ok('type' in event, 'Missing type');
        assert.ok('component' in event, 'Missing component');
        assert.ok('data' in event, 'Missing data');
        assert.ok(typeof event.data === 'object', 'data must be an object');
      }
    });

    it('maps event.event to type field', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query();
      const types = result.map(e => e.type);
      assert.ok(types.includes('spawn_start'));
      assert.ok(types.includes('spawn_end'));
      assert.ok(types.includes('router_guard_decision'));
    });
  });

  describe('query — time-range filtering (VAL-OB-001)', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-time-'));

      writeJsonl(path.join(fixtureDir, 'flight-recorder.jsonl'), [
        { timestamp: T1, event: 'event_a', component: 'comp1' },
        { timestamp: T2, event: 'event_b', component: 'comp1' },
        { timestamp: T3, event: 'event_c', component: 'comp1' },
        { timestamp: T4, event: 'event_d', component: 'comp1' },
        { timestamp: T5, event: 'event_e', component: 'comp1' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('filters by start timestamp (inclusive)', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ timeRange: { start: T3 } });
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].timestamp, T3);
    });

    it('filters by end timestamp (inclusive)', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ timeRange: { end: T3 } });
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[result.length - 1].timestamp, T3);
    });

    it('filters by both start and end', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ timeRange: { start: T2, end: T4 } });
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].timestamp, T2);
      assert.strictEqual(result[result.length - 1].timestamp, T4);
    });

    it('returns empty array when time range excludes all events', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({
        timeRange: { start: '2030-01-01T00:00:00.000Z', end: '2030-01-02T00:00:00.000Z' },
      });
      assert.strictEqual(result.length, 0);
    });
  });

  describe('query — event type filtering (VAL-OB-001)', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-type-'));

      writeJsonl(path.join(fixtureDir, 'spawn-log.jsonl'), [
        { timestamp: T1, event: 'spawn_start', component: 'spawn' },
        { timestamp: T2, event: 'spawn_end', component: 'spawn' },
        { timestamp: T3, event: 'spawn_start', component: 'spawn' },
      ]);

      writeJsonl(path.join(fixtureDir, 'router-churn.jsonl'), [
        { timestamp: T4, event: 'router_guard_decision', component: 'router' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('filters by single event type', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ eventTypes: ['spawn_start'] });
      assert.strictEqual(result.length, 2);
      assert.ok(result.every(e => e.type === 'spawn_start'));
    });

    it('filters by multiple event types', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ eventTypes: ['spawn_start', 'spawn_end'] });
      assert.strictEqual(result.length, 3);
      assert.ok(result.every(e => e.type === 'spawn_start' || e.type === 'spawn_end'));
    });

    it('returns empty array when no events match event type', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ eventTypes: ['nonexistent_event'] });
      assert.strictEqual(result.length, 0);
    });
  });

  describe('query — component filtering (VAL-OB-001)', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-comp-'));

      writeJsonl(path.join(fixtureDir, 'flight-recorder.jsonl'), [
        { timestamp: T1, event: 'event_a', component: 'comp_A' },
        { timestamp: T2, event: 'event_b', component: 'comp_B' },
        { timestamp: T3, event: 'event_c', component: 'comp_A' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('filters by component name', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ components: ['comp_A'] });
      assert.strictEqual(result.length, 2);
      assert.ok(result.every(e => e.component === 'comp_A'));
    });

    it('filters by multiple components', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ components: ['comp_A', 'comp_B'] });
      assert.strictEqual(result.length, 3);
    });

    it('returns empty array when component not found', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ components: ['comp_C'] });
      assert.strictEqual(result.length, 0);
    });
  });

  describe('query — limit option', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-limit-'));

      writeJsonl(path.join(fixtureDir, 'spawn-log.jsonl'), [
        { timestamp: T1, event: 'ev1', component: 'c1' },
        { timestamp: T2, event: 'ev2', component: 'c1' },
        { timestamp: T3, event: 'ev3', component: 'c1' },
        { timestamp: T4, event: 'ev4', component: 'c1' },
        { timestamp: T5, event: 'ev5', component: 'c1' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('limits result to specified count', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ limit: 3 });
      assert.strictEqual(result.length, 3);
    });

    it('returns all events when limit exceeds total count', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ limit: 100 });
      assert.strictEqual(result.length, 5);
    });

    it('limit is applied after sorting', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query({ limit: 2 });
      assert.strictEqual(result[0].timestamp, T1);
      assert.strictEqual(result[1].timestamp, T2);
    });
  });

  describe('query — combined filters', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-combo-'));

      writeJsonl(path.join(fixtureDir, 'flight-recorder.jsonl'), [
        { timestamp: T1, event: 'spawn_start', component: 'recorder' },
        { timestamp: T2, event: 'spawn_end', component: 'recorder' },
        { timestamp: T3, event: 'spawn_start', component: 'recorder' },
        { timestamp: T4, event: 'spawn_start', component: 'other' },
        { timestamp: T5, event: 'spawn_start', component: 'recorder' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('applies time-range + event type + component + limit together', () => {
      const agg = new LogAggregator(fixtureDir);
      // Time range: T1 to T4, type: spawn_start, component: recorder, limit: 2
      const result = agg.query({
        timeRange: { start: T1, end: T4 },
        eventTypes: ['spawn_start'],
        components: ['recorder'],
        limit: 2,
      });
      assert.strictEqual(result.length, 2);
      assert.ok(result.every(e => e.type === 'spawn_start'));
      assert.ok(result.every(e => e.component === 'recorder'));
      assert.ok(result.every(e => new Date(e.timestamp) <= new Date(T4)));
    });
  });

  describe('invalid JSONL lines silently skipped', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-invalid-'));

      // Mix of valid and invalid lines
      const content = [
        JSON.stringify({ timestamp: T1, event: 'valid_event', component: 'comp1' }),
        'this is not json {{{',
        '',
        JSON.stringify({ timestamp: T2, event: 'another_valid', component: 'comp1' }),
        'null',
        '[1,2,3]',
        JSON.stringify({ timestamp: T3, event: 'third_valid', component: 'comp1' }),
      ].join('\n');
      fs.writeFileSync(path.join(fixtureDir, 'spawn-log.jsonl'), content + '\n', 'utf8');
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('skips invalid JSON lines without throwing', () => {
      const agg = new LogAggregator(fixtureDir);
      let result;
      assert.doesNotThrow(() => {
        result = agg.query();
      });
      assert.ok(Array.isArray(result));
    });

    it('returns only valid events, skipping invalid lines', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query();
      assert.strictEqual(result.length, 3);
    });

    it('skips events without a timestamp field', () => {
      const fixtureDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-notimestamp-'));
      try {
        writeJsonl(path.join(fixtureDir2, 'flight-recorder.jsonl'), [
          { event: 'no_timestamp', component: 'comp1' },
          { timestamp: T1, event: 'has_timestamp', component: 'comp1' },
        ]);
        const agg = new LogAggregator(fixtureDir2);
        const result = agg.query();
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].type, 'has_timestamp');
      } finally {
        try {
          fs.rmSync(fixtureDir2, { recursive: true, force: true });
        } catch (_err) {
          // ignore
        }
      }
    });
  });

  describe('file pattern matching', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-patterns-'));

      // Files that should be included
      writeJsonl(path.join(fixtureDir, 'flight-recorder.jsonl'), [
        { timestamp: T1, event: 'fr_event', component: 'recorder' },
      ]);
      writeJsonl(path.join(fixtureDir, 'spawn-log.jsonl'), [
        { timestamp: T2, event: 'sl_event', component: 'spawn' },
      ]);
      writeJsonl(path.join(fixtureDir, 'router-churn.jsonl'), [
        { timestamp: T3, event: 'rc_event', component: 'router' },
      ]);
      writeJsonl(path.join(fixtureDir, 'runtime-health.jsonl'), [
        { timestamp: T4, event: 'rh_event', component: 'health' },
      ]);
      writeJsonl(path.join(fixtureDir, 'violation-tracker.jsonl'), [
        { timestamp: T5, event: 'vt_event', component: 'violations' },
      ]);

      // File that should NOT be included (wrong pattern)
      writeJsonl(path.join(fixtureDir, 'other-metrics.jsonl'), [
        { timestamp: T1, event: 'ignored_event', component: 'other' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('reads all 5 standard JSONL stream types', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query();
      const types = result.map(e => e.type);
      assert.ok(types.includes('fr_event'), 'Should include flight-recorder events');
      assert.ok(types.includes('sl_event'), 'Should include spawn-log events');
      assert.ok(types.includes('rc_event'), 'Should include router-churn events');
      assert.ok(types.includes('rh_event'), 'Should include runtime-health events');
      assert.ok(types.includes('vt_event'), 'Should include violation-tracker events');
    });

    it('reads rotated/suffixed flight-recorder files (flight-recorder*.jsonl)', () => {
      // Add a rotated file (like .flight-recorder.{timestamp}.jsonl or flight-recorder-2.jsonl)
      const rotatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-rotated-'));
      try {
        writeJsonl(path.join(rotatedDir, 'flight-recorder.jsonl'), [
          { timestamp: T1, event: 'main_fr', component: 'recorder' },
        ]);
        writeJsonl(path.join(rotatedDir, 'flight-recorder-old.jsonl'), [
          { timestamp: T2, event: 'rotated_fr', component: 'recorder' },
        ]);
        const agg = new LogAggregator(rotatedDir);
        const result = agg.query();
        const types = result.map(e => e.type);
        assert.ok(types.includes('main_fr'), 'main flight-recorder should be included');
        assert.ok(types.includes('rotated_fr'), 'rotated flight-recorder should be included');
      } finally {
        try {
          fs.rmSync(rotatedDir, { recursive: true, force: true });
        } catch (_err) {
          // ignore
        }
      }
    });
  });

  describe('getRecentEvents(count)', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-recent-'));

      writeJsonl(path.join(fixtureDir, 'flight-recorder.jsonl'), [
        { timestamp: T1, event: 'ev1', component: 'c1' },
        { timestamp: T2, event: 'ev2', component: 'c1' },
      ]);
      writeJsonl(path.join(fixtureDir, 'spawn-log.jsonl'), [
        { timestamp: T3, event: 'ev3', component: 'c2' },
        { timestamp: T4, event: 'ev4', component: 'c2' },
        { timestamp: T5, event: 'ev5', component: 'c2' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('returns last N events sorted by timestamp', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.getRecentEvents(3);
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].timestamp, T3);
      assert.strictEqual(result[1].timestamp, T4);
      assert.strictEqual(result[2].timestamp, T5);
    });

    it('returns all events when count exceeds total', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.getRecentEvents(100);
      assert.strictEqual(result.length, 5);
    });

    it('returns events across all streams (not just one file)', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.getRecentEvents(5);
      const components = [...new Set(result.map(e => e.component))];
      assert.ok(components.length >= 2, 'Should include events from multiple streams');
    });

    it('returns empty array for count 0', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.getRecentEvents(0);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('getEventsByType(type, timeRange?)', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-bytype-'));

      writeJsonl(path.join(fixtureDir, 'spawn-log.jsonl'), [
        { timestamp: T1, event: 'spawn_start', component: 'spawn' },
        { timestamp: T2, event: 'spawn_end', component: 'spawn' },
        { timestamp: T3, event: 'spawn_start', component: 'spawn' },
        { timestamp: T4, event: 'spawn_end', component: 'spawn' },
        { timestamp: T5, event: 'spawn_start', component: 'spawn' },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('returns all events of the specified type', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.getEventsByType('spawn_start');
      assert.strictEqual(result.length, 3);
      assert.ok(result.every(e => e.type === 'spawn_start'));
    });

    it('filters by type and time range', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.getEventsByType('spawn_start', { start: T2, end: T4 });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].timestamp, T3);
      assert.strictEqual(result[0].type, 'spawn_start');
    });

    it('returns empty array for unknown type', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.getEventsByType('unknown_event_type');
      assert.strictEqual(result.length, 0);
    });

    it('returns sorted results', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.getEventsByType('spawn_start');
      for (let i = 1; i < result.length; i++) {
        const prev = new Date(result[i - 1].timestamp).getTime();
        const curr = new Date(result[i].timestamp).getTime();
        assert.ok(prev <= curr);
      }
    });
  });

  describe('data field normalization', () => {
    let fixtureDir;

    before(() => {
      fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-agg-data-'));

      writeJsonl(path.join(fixtureDir, 'spawn-log.jsonl'), [
        {
          timestamp: T1,
          event: 'spawn_start',
          component: 'spawner',
          task_id: 'task123',
          session_id: 'sess456',
          agent_type: 'worker',
        },
      ]);
    });

    after(() => {
      try {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore
      }
    });

    it('puts extra fields into data object', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query();
      assert.strictEqual(result.length, 1);
      const evt = result[0];
      assert.strictEqual(evt.timestamp, T1);
      assert.strictEqual(evt.type, 'spawn_start');
      assert.strictEqual(evt.component, 'spawner');
      assert.strictEqual(evt.data.task_id, 'task123');
      assert.strictEqual(evt.data.session_id, 'sess456');
      assert.strictEqual(evt.data.agent_type, 'worker');
    });

    it('does not include timestamp, type, component in data', () => {
      const agg = new LogAggregator(fixtureDir);
      const result = agg.query();
      const evt = result[0];
      assert.ok(!('timestamp' in evt.data), 'timestamp should not be in data');
      assert.ok(!('event' in evt.data), 'event should not be in data');
      assert.ok(!('component' in evt.data), 'component should not be in data');
    });
  });
});
