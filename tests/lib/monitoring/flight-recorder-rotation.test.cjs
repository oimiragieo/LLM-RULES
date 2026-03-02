#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  record,
  rotateIfNeeded,
  pruneOldFiles,
  listRotatedFiles,
  _logBuffer,
} = require('../../../.claude/lib/monitoring/flight-recorder.cjs');

test('flight recorder rotates oversized log and keeps writing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-rotate-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');

  try {
    fs.writeFileSync(filePath, 'x'.repeat(6 * 1024 * 1024), 'utf8');
    const rotated = rotateIfNeeded(filePath);
    assert.ok(rotated, 'Expected rotated path');
    assert.equal(fs.existsSync(filePath), false, 'Active file should have been renamed');

    record({ event: 'test_event', component: 'test', traceId: 'trace-1' }, filePath);
    _logBuffer.flushSync();
    assert.equal(fs.existsSync(filePath), true, 'New active file should exist');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('flight recorder prune removes stale rotated files', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-prune-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');
  const stalePath = path.join(tempRoot, `.flight-recorder.${Date.now() - 10_000_000}.jsonl`);

  try {
    fs.writeFileSync(stalePath, '{"event":"stale"}\n', 'utf8');
    const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(stalePath, staleDate, staleDate);
    pruneOldFiles(filePath);

    assert.equal(
      listRotatedFiles(filePath).some(p => p === stalePath),
      false,
      'Stale rotated file should be removed'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
