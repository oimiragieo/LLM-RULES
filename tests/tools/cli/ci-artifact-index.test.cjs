'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildArtifactIndex,
  normalizeArtifactRecord,
  parseArgs,
} = require('../../../.claude/tools/cli/ci-artifact-index.cjs');

const CLI = path.join(process.cwd(), '.claude', 'tools', 'cli', 'ci-artifact-index.cjs');

function makeTempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function cleanupTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

test('parseArgs reads input path and json flags', () => {
  const opts = parseArgs(['node', 'ci-artifact-index.cjs', '--json', '--input', 'artifacts.json']);

  assert.equal(opts.json, true);
  assert.equal(opts.inputPath, 'artifacts.json');
});

test('normalizeArtifactRecord maps GitHub artifact metadata to an aggregation-friendly shape', () => {
  const normalized = normalizeArtifactRecord({
    id: 17,
    name: 'full-validation-tests-failure-evidence',
    workflowName: 'Full Validation',
    jobName: 'Unit & Integration Tests',
    head_sha: 'abc123',
    ref_name: 'feature/remote-ci-evidence-and-flake-ops',
    created_at: '2026-04-17T22:15:00.000Z',
    archive_download_url: 'https://example.test/artifacts/17.zip',
  });

  assert.deepEqual(normalized, {
    id: 17,
    name: 'full-validation-tests-failure-evidence',
    workflow: 'Full Validation',
    job: 'Unit & Integration Tests',
    sha: 'abc123',
    branch: 'feature/remote-ci-evidence-and-flake-ops',
    kind: 'failure_evidence',
    createdAt: '2026-04-17T22:15:00.000Z',
    runId: null,
    url: 'https://example.test/artifacts/17.zip',
    path: null,
  });
});

test('buildArtifactIndex sorts normalized artifacts newest-first', () => {
  const index = buildArtifactIndex([
    {
      name: 'ci-impacted-validation',
      workflowName: 'CI',
      jobName: 'Advisory Summary',
      head_sha: 'abc123',
      ref_name: 'feature/remote-ci-evidence-and-flake-ops',
      created_at: '2026-04-17T20:00:00.000Z',
    },
    {
      name: 'full-validation-tests-failure-evidence',
      workflowName: 'Full Validation',
      jobName: 'Unit & Integration Tests',
      head_sha: 'abc123',
      ref_name: 'feature/remote-ci-evidence-and-flake-ops',
      created_at: '2026-04-17T22:15:00.000Z',
    },
  ]);

  assert.equal(index.version, 1);
  assert.equal(index.artifacts[0].name, 'full-validation-tests-failure-evidence');
  assert.equal(index.artifacts[1].name, 'ci-impacted-validation');
});

test('ci-artifact-index emits JSON index from input metadata', () => {
  const tempDir = makeTempDir('ci-artifact-index');

  try {
    const inputPath = path.join(tempDir, 'artifacts.json');
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        {
          name: 'full-validation-tests-failure-evidence',
          workflowName: 'Full Validation',
          jobName: 'Unit & Integration Tests',
          head_sha: 'abc123',
          ref_name: 'feature/remote-ci-evidence-and-flake-ops',
          created_at: '2026-04-17T22:15:00.000Z',
        },
      ]),
      'utf8'
    );

    const result = spawnSync('node', [CLI, '--json', '--input', inputPath], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);

    const parsed = JSON.parse(result.stdout);

    assert.equal(parsed.index.version, 1);
    assert.equal(parsed.index.artifacts.length, 1);
    assert.equal(parsed.index.artifacts[0].kind, 'failure_evidence');
    assert.equal(parsed.index.artifacts[0].workflow, 'Full Validation');
  } finally {
    cleanupTempDir(tempDir);
  }
});
