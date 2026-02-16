'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { appendTierEvent } = require('../../../.claude/lib/memory/memory-tier-helpers.cjs');

test('appendTierEvent includes traceId from environment when not provided', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-tier-trace-'));
  const originalTrace = process.env.TRACE_ID;
  process.env.TRACE_ID = 'trace-env-001';

  try {
    appendTierEvent('tier_test', { stage: 'unit' }, tmpDir, dir => {
      fs.mkdirSync(dir, { recursive: true });
    });

    const eventsPath = path.join(
      tmpDir,
      '.claude',
      'context',
      'runtime',
      'memory-tier-events.jsonl'
    );
    const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length >= 1, true);

    const payload = JSON.parse(lines[0]);
    assert.equal(payload.event, 'tier_test');
    assert.equal(payload.traceId, 'trace-env-001');
  } finally {
    if (typeof originalTrace === 'undefined') delete process.env.TRACE_ID;
    else process.env.TRACE_ID = originalTrace;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
