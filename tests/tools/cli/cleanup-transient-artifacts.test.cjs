'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  parseArgs,
  cleanupTransientArtifacts,
} = require('../../../.claude/tools/cli/cleanup-transient-artifacts.cjs');

test('parseArgs reads retention and dry-run flags', () => {
  const opts = parseArgs([
    'node',
    'cleanup-transient-artifacts.cjs',
    '--retention-days',
    '7',
    '--dry-run',
    'false',
    '--json',
  ]);

  assert.equal(opts.retentionDays, 7);
  assert.equal(opts.dryRun, false);
  assert.equal(opts.json, true);
});

test('cleanupTransientArtifacts removes stale staging directories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-transient-'));
  try {
    const stagingDir = path.join(root, '.claude', 'staging', 'spawn-memory-mode-abc');
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'x.txt'), 'x', 'utf8');

    const oldTs = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(stagingDir, oldTs, oldTs);

    const dry = cleanupTransientArtifacts(root, { retentionDays: 2, dryRun: true });
    assert.equal(dry.removed, 1);
    assert.equal(fs.existsSync(stagingDir), true);

    const real = cleanupTransientArtifacts(root, { retentionDays: 2, dryRun: false });
    assert.equal(real.removed, 1);
    assert.equal(fs.existsSync(stagingDir), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
