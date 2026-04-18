'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildNodeTestArgs,
  estimateCommandLength,
  partitionTestFiles,
  resolveTestFiles,
} = require('../../../scripts/testing/run-node-tests.cjs');

test('resolveTestFiles expands glob patterns cross-platform and preserves pattern order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-node-tests-'));
  try {
    fs.mkdirSync(path.join(root, 'tests', 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests', 'lib', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests', 'hooks', 'alpha.test.cjs'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'tests', 'lib', 'beta.test.cjs'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'tests', 'lib', 'nested', 'gamma.test.cjs'), '', 'utf8');

    const files = resolveTestFiles(['tests/hooks/*.test.cjs', 'tests/lib/**/*.test.cjs'], {
      cwd: root,
    });

    assert.deepEqual(files, [
      'tests/hooks/alpha.test.cjs',
      'tests/lib/beta.test.cjs',
      'tests/lib/nested/gamma.test.cjs',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveTestFiles expands recursive brace globs used by pnpm test', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-node-tests-braces-'));
  try {
    fs.mkdirSync(path.join(root, 'tests', 'unit', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tests', 'root.test.mjs'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'tests', 'unit', 'alpha.test.cjs'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'tests', 'unit', 'nested', 'beta.test.mjs'), '', 'utf8');

    const files = resolveTestFiles(['tests/**/*.test.{mjs,cjs}'], { cwd: root });

    assert.deepEqual(files, [
      'tests/root.test.mjs',
      'tests/unit/alpha.test.cjs',
      'tests/unit/nested/beta.test.mjs',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildNodeTestArgs prefixes node test flags ahead of resolved files', () => {
  const args = buildNodeTestArgs(
    ['--test-concurrency=1', '--test-reporter=spec'],
    ['tests/hooks/alpha.test.cjs', 'tests/lib/beta.test.cjs']
  );

  assert.deepEqual(args, [
    '--test',
    '--test-concurrency=1',
    '--test-reporter=spec',
    'tests/hooks/alpha.test.cjs',
    'tests/lib/beta.test.cjs',
  ]);
});

test('estimateCommandLength grows with the number of resolved files', () => {
  const shortLength = estimateCommandLength(
    ['--test-concurrency=1'],
    ['tests/hooks/alpha.test.cjs']
  );
  const longLength = estimateCommandLength(
    ['--test-concurrency=1'],
    ['tests/hooks/alpha.test.cjs', 'tests/lib/beta.test.cjs', 'tests/lib/nested/gamma.test.cjs']
  );

  assert.ok(longLength > shortLength);
});

test('partitionTestFiles keeps small suites in a single batch', () => {
  const batches = partitionTestFiles(
    ['--test-concurrency=1'],
    ['tests/hooks/alpha.test.cjs', 'tests/lib/beta.test.cjs'],
    { maxCommandLength: 1000, execPath: 'node' }
  );

  assert.deepEqual(batches, [['tests/hooks/alpha.test.cjs', 'tests/lib/beta.test.cjs']]);
});

test('partitionTestFiles splits large suites before hitting command-length limits', () => {
  const files = [
    'tests/very-long-directory-name/alpha-long-file-name.test.cjs',
    'tests/very-long-directory-name/beta-long-file-name.test.cjs',
    'tests/very-long-directory-name/gamma-long-file-name.test.cjs',
  ];

  const batches = partitionTestFiles(['--test-concurrency=1'], files, {
    maxCommandLength: 120,
    execPath: 'node',
  });

  assert.equal(batches.length, 3);
  assert.deepEqual(batches.flat(), files);
});
