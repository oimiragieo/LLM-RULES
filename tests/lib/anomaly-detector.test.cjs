'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ANOMALY_KEYWORDS,
  isAnomalyLine,
  getAnomalySeverity,
  filterPreservingAnomalies,
} = require('../../.claude/lib/utils/anomaly-detector.cjs');

describe('isAnomalyLine', () => {
  it('detects FATAL', () => {
    assert.equal(isAnomalyLine('2026-01-01 FATAL: process exited'), true);
  });

  it('detects ERROR', () => {
    assert.equal(isAnomalyLine('[ERROR] connection refused'), true);
  });

  it('detects WARNING', () => {
    assert.equal(isAnomalyLine('WARNING: disk usage above 90%'), true);
  });

  it('detects CRITICAL', () => {
    assert.equal(isAnomalyLine('CRITICAL memory pressure detected'), true);
  });

  it('detects EXCEPTION', () => {
    assert.equal(isAnomalyLine('Unhandled EXCEPTION in worker thread'), true);
  });

  it('detects PANIC', () => {
    assert.equal(isAnomalyLine('PANIC: nil pointer dereference'), true);
  });

  it('detects OOM', () => {
    assert.equal(isAnomalyLine('OOM killer invoked for pid 12345'), true);
  });

  it('detects segfault', () => {
    assert.equal(isAnomalyLine('Segmentation fault (segfault) at 0x0000'), true);
  });

  it('detects deadlock', () => {
    assert.equal(isAnomalyLine('potential deadlock detected in mutex'), true);
  });

  it('is case-insensitive for keywords', () => {
    assert.equal(isAnomalyLine('fatal error occurred'), true);
    assert.equal(isAnomalyLine('error: file not found'), true);
  });

  it('returns false for normal lines', () => {
    assert.equal(isAnomalyLine('Starting server on port 3000'), false);
    assert.equal(isAnomalyLine('Request completed in 42ms'), false);
    assert.equal(isAnomalyLine('Loaded 10 configuration entries'), false);
    assert.equal(isAnomalyLine(''), false);
  });

  it('returns false for non-string input', () => {
    assert.equal(isAnomalyLine(null), false);
    assert.equal(isAnomalyLine(undefined), false);
    assert.equal(isAnomalyLine(42), false);
  });
});

describe('getAnomalySeverity', () => {
  it('returns FATAL for a fatal line', () => {
    assert.equal(getAnomalySeverity('FATAL: crash'), 'FATAL');
  });

  it('returns ERROR for an error line', () => {
    assert.equal(getAnomalySeverity('[ERROR] something broke'), 'ERROR');
  });

  it('returns null for normal line', () => {
    assert.equal(getAnomalySeverity('All systems nominal'), null);
  });

  it('returns null for non-string', () => {
    assert.equal(getAnomalySeverity(null), null);
  });

  it('returns highest severity when multiple keywords present', () => {
    // FATAL comes before ERROR in ANOMALY_KEYWORDS array → FATAL wins
    const severity = getAnomalySeverity('FATAL ERROR: catastrophic failure');
    assert.equal(severity, 'FATAL');
  });
});

describe('filterPreservingAnomalies', () => {
  it('returns all lines when count <= maxLines', () => {
    const lines = ['ok', 'ok2', 'ERROR: bad'];
    const result = filterPreservingAnomalies(lines, 10);
    assert.deepEqual(result, lines);
  });

  it('preserves anomaly lines when trimming', () => {
    const lines = ['line1', 'line2', 'FATAL: crash', 'line3', 'line4', 'ERROR: oops', 'line5'];
    // maxLines=3 → 2 anomaly lines + 1 normal (most recent)
    const result = filterPreservingAnomalies(lines, 3);
    assert.ok(result.includes('FATAL: crash'), 'FATAL line must be preserved');
    assert.ok(result.includes('ERROR: oops'), 'ERROR line must be preserved');
    assert.equal(result.length, 3);
  });

  it('preserves original order of kept lines', () => {
    const lines = ['normal1', 'ERROR: first', 'normal2', 'normal3', 'FATAL: second', 'normal4'];
    const result = filterPreservingAnomalies(lines, 4);
    // Both anomaly lines kept; 2 normal slots → last 2 normals = normal3, normal4
    const errorIdx = result.indexOf('ERROR: first');
    const fatalIdx = result.indexOf('FATAL: second');
    assert.ok(errorIdx < fatalIdx, 'original order must be preserved');
  });

  it('drops anomaly lines beyond budget when only anomalies exist', () => {
    const lines = ['ERROR: a', 'FATAL: b', 'CRITICAL: c', 'WARNING: d'];
    const result = filterPreservingAnomalies(lines, 2);
    assert.equal(result.length, 2);
    // Should keep the last 2 anomaly lines (recency)
    assert.ok(result.includes('CRITICAL: c'));
    assert.ok(result.includes('WARNING: d'));
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(filterPreservingAnomalies([], 10), []);
  });

  it('returns empty array for invalid maxLines', () => {
    assert.deepEqual(filterPreservingAnomalies(['ERROR: x'], 0), []);
    assert.deepEqual(filterPreservingAnomalies(['ERROR: x'], -1), []);
  });

  it('returns empty array for non-array input', () => {
    assert.deepEqual(filterPreservingAnomalies(null, 10), []);
    assert.deepEqual(filterPreservingAnomalies('text', 10), []);
  });
});

describe('ANOMALY_KEYWORDS constant', () => {
  it('exports an array of strings', () => {
    assert.ok(Array.isArray(ANOMALY_KEYWORDS));
    assert.ok(ANOMALY_KEYWORDS.length > 0);
    for (const kw of ANOMALY_KEYWORDS) {
      assert.equal(typeof kw, 'string');
    }
  });

  it('includes the mandatory severity levels', () => {
    const upper = ANOMALY_KEYWORDS.map(k => k.toUpperCase());
    for (const required of ['FATAL', 'ERROR', 'WARNING', 'CRITICAL', 'OOM']) {
      assert.ok(upper.includes(required), `${required} must be in ANOMALY_KEYWORDS`);
    }
  });
});
