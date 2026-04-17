'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_LEDGER_RELATIVE_PATH,
  buildFailureFingerprint,
  loadFlakeLedger,
  recordFlakeFailure,
  summarizeFlakeLedger,
} = require('../../../.claude/lib/ci/flake-ledger.cjs');

function makeProjectRoot(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function cleanupProjectRoot(projectRoot) {
  fs.rmSync(projectRoot, { recursive: true, force: true });
}

test('recordFlakeFailure creates ledger file and falls back to unknown category', () => {
  const projectRoot = makeProjectRoot('flake-ledger-create');

  try {
    const recorded = recordFlakeFailure(projectRoot, {
      testId: 'tests/integration/example.test.cjs#tracks failure',
      filePath: 'tests/integration/example.test.cjs',
      message: 'Expected 200 but received 500',
      category: 'not-a-real-category',
      runContext: { workflow: 'CI', job: 'Unit & Integration Tests' },
    });

    const ledgerPath = path.join(projectRoot, DEFAULT_LEDGER_RELATIVE_PATH);
    assert.equal(fs.existsSync(ledgerPath), true);
    assert.equal(recorded.category, 'unknown');

    const ledger = loadFlakeLedger(projectRoot);
    assert.equal(ledger.entries.length, 1);
    assert.equal(ledger.entries[0].category, 'unknown');
    assert.equal(ledger.entries[0].occurrences, 1);
  } finally {
    cleanupProjectRoot(projectRoot);
  }
});

test('recordFlakeFailure coalesces duplicate fingerprints into one entry', () => {
  const projectRoot = makeProjectRoot('flake-ledger-coalesce');

  try {
    const fingerprint = buildFailureFingerprint({
      testId: 'tests/hooks/example.test.cjs#dedupes',
      filePath: 'tests/hooks/example.test.cjs',
      message: 'timed out waiting for hook',
    });

    recordFlakeFailure(projectRoot, {
      testId: 'tests/hooks/example.test.cjs#dedupes',
      filePath: 'tests/hooks/example.test.cjs',
      message: 'timed out waiting for hook',
      category: 'env_nondeterminism',
    });
    recordFlakeFailure(projectRoot, {
      testId: 'tests/hooks/example.test.cjs#dedupes',
      filePath: 'tests/hooks/example.test.cjs',
      message: 'timed out waiting for hook',
      category: 'env_nondeterminism',
    });

    const ledger = loadFlakeLedger(projectRoot);
    assert.equal(ledger.entries.length, 1);
    assert.equal(ledger.entries[0].fingerprint, fingerprint);
    assert.equal(ledger.entries[0].occurrences, 2);

    const summary = summarizeFlakeLedger(projectRoot);
    assert.equal(summary.totalEntries, 1);
    assert.equal(summary.totalOccurrences, 2);
  } finally {
    cleanupProjectRoot(projectRoot);
  }
});

test('recordFlakeFailure quarantines malformed prior ledger before continuing', () => {
  const projectRoot = makeProjectRoot('flake-ledger-malformed');

  try {
    const ledgerPath = path.join(projectRoot, DEFAULT_LEDGER_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, '{ definitely not valid json', 'utf8');

    recordFlakeFailure(projectRoot, {
      testId: 'tests/lib/ci/bad-ledger.test.cjs#quarantine',
      filePath: 'tests/lib/ci/bad-ledger.test.cjs',
      message: 'previous ledger was malformed',
      category: 'test_defect',
    });

    const quarantinedFiles = fs
      .readdirSync(path.dirname(ledgerPath))
      .filter(name => /^flake-ledger\.corrupt-\d+\.json$/.test(name));

    assert.equal(quarantinedFiles.length, 1);

    const ledger = loadFlakeLedger(projectRoot);
    assert.equal(ledger.entries.length, 1);
    assert.equal(ledger.entries[0].category, 'test_defect');
  } finally {
    cleanupProjectRoot(projectRoot);
  }
});
