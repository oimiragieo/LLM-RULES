'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { normalizeTaskUpdatePayload, MAX_METADATA_FIELD_CHARS, MAX_METADATA_TOTAL_CHARS } = require(
  path.join(__dirname, '..', '..', '..', '.claude', 'lib', 'routing', 'task-update-contract.cjs')
);

describe('TaskUpdate metadata size caps', () => {
  it('short metadata passes through unchanged', () => {
    const result = normalizeTaskUpdatePayload({
      taskId: '1',
      status: 'completed',
      metadata: { summary: 'Fixed the bug', filesModified: ['a.cjs'] },
    });
    assert.equal(result.metadata.summary, 'Fixed the bug');
    assert.deepEqual(result.metadata.filesModified, ['a.cjs']);
    assert.equal(result.metadata._truncated, undefined);
  });

  it('summary longer than MAX_METADATA_FIELD_CHARS is truncated', () => {
    const longSummary = 'x'.repeat(5000);
    const result = normalizeTaskUpdatePayload({
      taskId: '1',
      status: 'completed',
      metadata: { summary: longSummary },
    });
    assert.ok(
      result.metadata.summary.length <= MAX_METADATA_FIELD_CHARS,
      `Summary should be <= ${MAX_METADATA_FIELD_CHARS} chars, got ${result.metadata.summary.length}`
    );
    assert.ok(result.metadata.summary.endsWith('[TRUNCATED]'));
    assert.equal(result.metadata._truncated, true);
  });

  it('total serialized metadata capped at MAX_METADATA_TOTAL_CHARS', () => {
    const metadata = {};
    // Add many fields to exceed total cap
    for (let i = 0; i < 10; i++) {
      metadata[`field${i}`] = 'data '.repeat(200);
    }
    const result = normalizeTaskUpdatePayload({
      taskId: '1',
      status: 'completed',
      metadata,
    });
    const serialized = JSON.stringify(result.metadata);
    assert.ok(
      serialized.length <= MAX_METADATA_TOTAL_CHARS + 100, // small buffer for truncation markers
      `Total metadata should be <= ${MAX_METADATA_TOTAL_CHARS} chars, got ${serialized.length}`
    );
  });

  it('array fields (filesModified) preserved, not truncated as strings', () => {
    const result = normalizeTaskUpdatePayload({
      taskId: '1',
      status: 'completed',
      metadata: { filesModified: ['a.cjs', 'b.cjs', 'c.cjs'] },
    });
    assert.ok(Array.isArray(result.metadata.filesModified));
    assert.equal(result.metadata.filesModified.length, 3);
  });

  it('_truncated flag set only when truncation occurs', () => {
    const short = normalizeTaskUpdatePayload({
      taskId: '1',
      status: 'completed',
      metadata: { summary: 'ok' },
    });
    assert.equal(short.metadata._truncated, undefined);

    const long = normalizeTaskUpdatePayload({
      taskId: '1',
      status: 'completed',
      metadata: { summary: 'z'.repeat(3000) },
    });
    assert.equal(long.metadata._truncated, true);
  });

  it('exports constants for validation', () => {
    assert.ok(typeof MAX_METADATA_FIELD_CHARS === 'number');
    assert.ok(typeof MAX_METADATA_TOTAL_CHARS === 'number');
    assert.ok(MAX_METADATA_FIELD_CHARS > 0);
    assert.ok(MAX_METADATA_TOTAL_CHARS > MAX_METADATA_FIELD_CHARS);
  });
});
