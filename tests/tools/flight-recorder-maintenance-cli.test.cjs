#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../../.claude/tools/cli/flight-recorder-maintenance.cjs');

test('flight-recorder-maintenance rotates oversized active file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-maint-'));
  const filePath = path.join(tempDir, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(filePath, 'x'.repeat(1024), 'utf8');
    const result = spawnSync(
      process.execPath,
      [CLI, '--file', filePath, '--max-bytes', '128', '--json', 'true'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.rotated, 1);
    assert.ok(parsed.rotatedPath);
    assert.equal(fs.existsSync(filePath), false);
    assert.equal(fs.existsSync(parsed.rotatedPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('flight-recorder-maintenance dry-run does not mutate files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flight-maint-dry-'));
  const filePath = path.join(tempDir, 'flight-recorder.jsonl');
  try {
    fs.writeFileSync(filePath, 'x'.repeat(1024), 'utf8');
    const result = spawnSync(
      process.execPath,
      [CLI, '--file', filePath, '--max-bytes', '128', '--dry-run', 'true', '--json', 'true'],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.rotated, 1);
    assert.equal(parsed.dryRun, true);
    assert.equal(fs.existsSync(filePath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
