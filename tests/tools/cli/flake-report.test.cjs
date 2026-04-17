'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { recordFlakeFailure } = require('../../../.claude/lib/ci/flake-ledger.cjs');
const { parseArgs } = require('../../../.claude/tools/cli/flake-report.cjs');

const CLI = path.join(process.cwd(), '.claude', 'tools', 'cli', 'flake-report.cjs');

function makeProjectRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function cleanupProjectRoot(projectRoot) {
  fs.rmSync(projectRoot, { recursive: true, force: true });
}

test('parseArgs reads json and project-root flags', () => {
  const opts = parseArgs([
    'node',
    'flake-report.cjs',
    '--json',
    '--project-root',
    '/tmp/example-project',
  ]);

  assert.equal(opts.json, true);
  assert.equal(opts.projectRoot, '/tmp/example-project');
});

test('flake-report emits JSON summary for current ledger state', () => {
  const projectRoot = makeProjectRoot('flake-report-json');

  try {
    recordFlakeFailure(projectRoot, {
      testId: 'tests/tools/cli/flake-report.test.cjs#json',
      filePath: 'tests/tools/cli/flake-report.test.cjs',
      message: 'flaky command output mismatch',
      category: 'env_nondeterminism',
    });

    const result = spawnSync('node', [CLI, '--json', '--project-root', projectRoot], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);

    assert.equal(parsed.summary.totalEntries, 1);
    assert.equal(parsed.summary.totalOccurrences, 1);
    assert.equal(parsed.summary.byCategory.env_nondeterminism, 1);
  } finally {
    cleanupProjectRoot(projectRoot);
  }
});
