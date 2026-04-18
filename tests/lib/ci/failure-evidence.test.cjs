'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_EVIDENCE_RELATIVE_DIR,
  collectFailureEvidence,
  writeFailureEvidence,
} = require('../../../.claude/lib/ci/failure-evidence.cjs');

function makeProjectRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function cleanupProjectRoot(projectRoot) {
  fs.rmSync(projectRoot, { recursive: true, force: true });
}

test('collectFailureEvidence includes branch metadata, node version, and changed files', () => {
  const evidence = collectFailureEvidence(process.cwd(), {
    env: {
      GITHUB_REF_NAME: 'fix/release-readiness-hardening',
      GITHUB_SHA: 'abc123def456',
      GITHUB_WORKFLOW: 'CI',
      GITHUB_JOB: 'Unit & Integration Tests',
    },
    changedFiles: ['.claude/lib/ci/flake-ledger.cjs', 'tests/lib/ci/flake-ledger.test.cjs'],
  });

  assert.equal(evidence.git.branch, 'fix/release-readiness-hardening');
  assert.equal(evidence.git.ref, 'abc123def456');
  assert.equal(evidence.runtime.nodeVersion, process.version);
  assert.deepEqual(evidence.changedFiles, [
    '.claude/lib/ci/flake-ledger.cjs',
    'tests/lib/ci/flake-ledger.test.cjs',
  ]);
});

test('collectFailureEvidence is fail-open when CI metadata is missing', () => {
  const projectRoot = makeProjectRoot('failure-evidence-missing');

  try {
    const evidence = collectFailureEvidence(projectRoot, {
      env: {},
    });

    assert.equal(evidence.git.branch, null);
    assert.equal(Array.isArray(evidence.changedFiles), true);
    assert.equal(evidence.changedFiles.length, 0);
    assert.equal(typeof evidence.generatedAt, 'string');
  } finally {
    cleanupProjectRoot(projectRoot);
  }
});

test('writeFailureEvidence redacts secret-bearing fields before writing artifacts', () => {
  const projectRoot = makeProjectRoot('failure-evidence-redaction');

  try {
    const artifactPath = writeFailureEvidence(projectRoot, {
      env: {
        GITHUB_REF_NAME: 'fix/redaction',
        GITHUB_TOKEN: 'super-secret-token',
        API_KEY: 'raw-api-key',
      },
      changedFiles: ['scripts/validation/ci-validation-gate.cjs'],
      failure: {
        message: 'request failed because token=super-secret-token',
      },
      extra: {
        safe: 'yes',
        authToken: 'another-secret',
      },
    });

    const rawArtifact = fs.readFileSync(artifactPath, 'utf8');

    assert.equal(
      artifactPath.startsWith(path.join(projectRoot, DEFAULT_EVIDENCE_RELATIVE_DIR)),
      true
    );
    assert.equal(rawArtifact.includes('super-secret-token'), false);
    assert.equal(rawArtifact.includes('raw-api-key'), false);
    assert.equal(rawArtifact.includes('another-secret'), false);
    assert.equal(rawArtifact.includes('[REDACTED]'), true);
  } finally {
    cleanupProjectRoot(projectRoot);
  }
});
