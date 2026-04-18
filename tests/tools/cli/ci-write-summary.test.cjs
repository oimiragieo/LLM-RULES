'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseArgs } = require('../../../.claude/tools/cli/ci-write-summary.cjs');

const CLI = path.join(process.cwd(), '.claude', 'tools', 'cli', 'ci-write-summary.cjs');

function makeTempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function cleanupTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

test('parseArgs reads kind and payload flags', () => {
  const opts = parseArgs([
    'node',
    'ci-write-summary.cjs',
    '--kind',
    'impacted-validation',
    '--payload',
    '{"advisory":true}',
  ]);

  assert.equal(opts.kind, 'impacted-validation');
  assert.deepEqual(opts.payload, { advisory: true });
  assert.equal(opts.inputPath, null);
});

test('ci-write-summary exits successfully when GITHUB_STEP_SUMMARY is unset', () => {
  const result = spawnSync(
    'node',
    [
      CLI,
      '--kind',
      'impacted-validation',
      '--payload',
      '{"recommendedCommands":["pnpm validate:affected --json"]}',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: '',
      },
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('ci-write-summary appends markdown when GITHUB_STEP_SUMMARY is set', () => {
  const tempDir = makeTempDir('ci-write-summary');

  try {
    const summaryPath = path.join(tempDir, 'summary.md');
    const payloadPath = path.join(tempDir, 'payload.json');

    fs.writeFileSync(
      payloadPath,
      JSON.stringify({
        docsOnly: false,
        requiredBump: 'minor',
        ok: true,
        failures: [],
      }),
      'utf8'
    );

    const result = spawnSync('node', [CLI, '--kind', 'release-gate', '--input', payloadPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
    });

    assert.equal(result.status, 0, result.stderr);

    const summary = fs.readFileSync(summaryPath, 'utf8');

    assert.match(summary, /## Release Gate/);
    assert.match(summary, /- Semver class: `minor`/);
    assert.match(summary, /- Gate status: passing/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('ci-write-summary unwraps validate-affected plan payloads for impacted validation summaries', () => {
  const tempDir = makeTempDir('ci-write-summary-plan');

  try {
    const summaryPath = path.join(tempDir, 'summary.md');
    const payloadPath = path.join(tempDir, 'payload.json');

    fs.writeFileSync(
      payloadPath,
      JSON.stringify({
        plan: {
          changedFiles: ['.github/workflows/ci.yml', 'package.json'],
          matchedRules: ['routing'],
          conservativeFallback: false,
          recommendedCommands: ['pnpm lint', 'pnpm validate:routing'],
        },
      }),
      'utf8'
    );

    const result = spawnSync(
      'node',
      [CLI, '--kind', 'impacted-validation', '--input', payloadPath],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: summaryPath,
        },
      }
    );

    assert.equal(result.status, 0, result.stderr);

    const summary = fs.readFileSync(summaryPath, 'utf8');

    assert.match(summary, /## Impacted Validation/);
    assert.match(summary, /- Changed files: `2`/);
    assert.match(summary, /- Recommended commands:/);
    assert.match(summary, /`pnpm validate:routing`/);
  } finally {
    cleanupTempDir(tempDir);
  }
});
