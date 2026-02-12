'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const summaryCli = require('../../../.claude/tools/cli/memory-cache-stability-summary.cjs');

function createTempJsonl(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-cache-stability-summary-'));
  const file = path.join(dir, 'memory-cache-stability.jsonl');
  fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return { dir, file };
}

function cleanup(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('summarize computes churn and stable rates', () => {
  const summary = summaryCli.summarize(
    [
      { timestamp: '2026-02-12T00:00:00.000Z', memory_block_hash: 'a', churned: false },
      { timestamp: '2026-02-12T00:01:00.000Z', memory_block_hash: 'a', churned: false },
      { timestamp: '2026-02-12T00:02:00.000Z', memory_block_hash: 'b', churned: true },
    ],
    24
  );

  assert.equal(summary.total, 3);
  assert.equal(summary.churned, 1);
  assert.equal(summary.stable, 2);
  assert.equal(summary.churnRate, Number((1 / 3).toFixed(6)));
  assert.equal(summary.stableRate, Number((2 / 3).toFixed(6)));
  assert.equal(summary.latestHash, 'b');
});

test('evaluate fails when thresholds are violated', () => {
  const failures = summaryCli.evaluate(
    {
      total: 10,
      churnRate: 0.6,
      stableRate: 0.4,
    },
    {
      requireData: true,
      assertMaxChurnRate: 0.5,
      assertMinStableRate: 0.5,
    }
  );

  assert.equal(failures.length, 2);
  assert.match(failures[0], /churn rate/i);
  assert.match(failures[1], /stable rate/i);
});

test('evaluate requireData fails when no rows are present', () => {
  const failures = summaryCli.evaluate(
    {
      total: 0,
      churnRate: 0,
      stableRate: 0,
    },
    {
      requireData: true,
    }
  );

  assert.equal(failures.length, 1);
  assert.match(failures[0], /no memory cache stability rows found/i);
});

test('evaluate requireData passes when rows exist and no thresholds set', () => {
  const failures = summaryCli.evaluate(
    {
      total: 2,
      churnRate: 0.5,
      stableRate: 0.5,
    },
    {
      requireData: true,
    }
  );

  assert.equal(failures.length, 0);
});

test('readRows filters malformed lines and old timestamps', () => {
  const now = Date.now();
  const oldTs = new Date(now - 30 * 60 * 60 * 1000).toISOString(); // 30h ago
  const freshTs = new Date(now - 60 * 60 * 1000).toISOString(); // 1h ago

  const { dir, file } = createTempJsonl([
    { timestamp: oldTs, memory_block_hash: 'old', churned: false },
    { timestamp: freshTs, memory_block_hash: 'new', churned: true },
  ]);

  try {
    fs.appendFileSync(file, '{ malformed json\n', 'utf8');
    const rows = summaryCli.readRows(file, now - 24 * 60 * 60 * 1000);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].memory_block_hash, 'new');
  } finally {
    cleanup(dir);
  }
});
