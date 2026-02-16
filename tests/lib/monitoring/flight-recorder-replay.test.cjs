#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { replay } = require('../../../.claude/lib/monitoring/flight-recorder-replay.cjs');

test('replay returns valid rows and skips malformed lines', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-replay-'));
  const filePath = path.join(tempRoot, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(
      filePath,
      [
        JSON.stringify({
          traceId: 'trace-1',
          component: 'a',
          event: 'e1',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
        '{bad json',
        JSON.stringify({
          traceId: 'trace-1',
          component: 'b',
          event: 'e2',
          timestamp: '2026-01-01T00:00:01.000Z',
        }),
      ].join('\n') + '\n',
      'utf8'
    );

    const result = replay(filePath);
    assert.equal(result.entries.length, 2);
    assert.equal(result.skipped, 1);
    assert.equal(result.entries[0].event, 'e1');
    assert.equal(result.entries[1].event, 'e2');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
