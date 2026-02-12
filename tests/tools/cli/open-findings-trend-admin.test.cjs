'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseArgs, runAdmin } = require('../../../.claude/tools/cli/open-findings-trend-admin.cjs');
const { resolveFindingsTrendPath } = require('../../../.claude/lib/memory/findings-registry.cjs');

test('parseArgs reads reset and baseline flags', () => {
  const opts = parseArgs([
    'node',
    'open-findings-trend-admin.cjs',
    '--json',
    '--reset',
    'true',
    '--baseline',
    'true',
  ]);

  assert.equal(opts.json, true);
  assert.equal(opts.reset, true);
  assert.equal(opts.baseline, true);
});

test('runAdmin resets trend file and records baseline snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'findings-trend-admin-'));
  try {
    const trendPath = resolveFindingsTrendPath(root);
    fs.mkdirSync(path.dirname(trendPath), { recursive: true });
    fs.writeFileSync(trendPath, '{"old":true}\n', 'utf8');

    const result = runAdmin({
      projectRoot: root,
      reset: true,
      baseline: true,
    });

    assert.equal(result.reset, true);
    assert.equal(result.baselineRecorded, true);
    const contents = fs.readFileSync(trendPath, 'utf8');
    assert.equal(contents.trim().length > 0, true);
    assert.equal(contents.includes('manual-baseline'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
