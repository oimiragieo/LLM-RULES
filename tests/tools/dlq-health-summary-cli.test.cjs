#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../../.claude/tools/cli/dlq-health-summary.cjs');

test('dlq-health-summary reports totals in JSON mode', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlq-health-'));
  const filePath = path.join(tempDir, 'tasks-dlq.jsonl');
  try {
    const now = new Date().toISOString();
    fs.writeFileSync(
      filePath,
      [
        JSON.stringify({ id: 't1', status: 'failed', archivedAt: now }),
        JSON.stringify({ id: 't2', status: 'cancelled', archivedAt: now }),
      ].join('\n') + '\n',
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [CLI, '--file', filePath, '--hours', '24', '--json', 'true'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.summary.total, 2);
    assert.equal(parsed.summary.failed, 1);
    assert.equal(parsed.summary.cancelled, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('dlq-health-summary exits non-zero when threshold exceeded', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlq-health-threshold-'));
  const filePath = path.join(tempDir, 'tasks-dlq.jsonl');
  try {
    const now = new Date().toISOString();
    fs.writeFileSync(
      filePath,
      [JSON.stringify({ id: 't1', status: 'failed', archivedAt: now })].join('\n') + '\n',
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [CLI, '--file', filePath, '--hours', '24', '--assert-max-total', '0', '--json', 'true'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
