'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { evaluateReleaseGate } = require('../../../.claude/lib/ci/release-gate.cjs');
const { parseArgs } = require('../../../.claude/tools/cli/release-gate.cjs');

const CLI = path.join(process.cwd(), '.claude', 'tools', 'cli', 'release-gate.cjs');

function makeTempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

function cleanupTempDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

test('evaluateReleaseGate classifies breaking contract changes as major', () => {
  const tmpDir = makeTempDir('release-gate-major');

  try {
    const oldFile = path.join(tmpDir, 'old.md');
    const newFile = path.join(tmpDir, 'new.md');

    fs.writeFileSync(oldFile, '---\ntools: [Read, Write]\n---', 'utf8');
    fs.writeFileSync(newFile, '---\ntools: [Read]\n---', 'utf8');

    const result = evaluateReleaseGate({
      oldPath: oldFile,
      newPath: newFile,
      artifactType: 'agent',
      commitMessage: 'feat(agent)!: remove write tool',
      migrationGuidePath: path.join(tmpDir, 'MIGRATION.md'),
    });

    assert.equal(result.requiredBump, 'major');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('evaluateReleaseGate keeps additive contract changes on the minor path', () => {
  const tmpDir = makeTempDir('release-gate-minor');

  try {
    const oldFile = path.join(tmpDir, 'old.md');
    const newFile = path.join(tmpDir, 'new.md');

    fs.writeFileSync(oldFile, '---\ntools: [Read]\n---', 'utf8');
    fs.writeFileSync(newFile, '---\ntools: [Read, Write]\n---', 'utf8');

    const result = evaluateReleaseGate({
      oldPath: oldFile,
      newPath: newFile,
      artifactType: 'agent',
      commitMessage: 'feat(agent): add write tool',
    });

    assert.equal(result.requiredBump, 'minor');
    assert.deepEqual(result.failures, []);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('evaluateReleaseGate treats docs-only changes as non-breaking', () => {
  const result = evaluateReleaseGate({
    changedFiles: ['README.md', 'CHANGELOG.md', '.claude/docs/HOOKS_REFERENCE.md'],
    commitMessage: 'docs: refresh release docs',
  });

  assert.equal(result.docsOnly, true);
  assert.equal(result.requiredBump, 'patch');
  assert.deepEqual(result.failures, []);
});

test('evaluateReleaseGate fails major releases that omit a migration guide', () => {
  const tmpDir = makeTempDir('release-gate-migration');

  try {
    const oldFile = path.join(tmpDir, 'old.md');
    const newFile = path.join(tmpDir, 'new.md');

    fs.writeFileSync(oldFile, '---\ntools: [Read, Write]\n---', 'utf8');
    fs.writeFileSync(newFile, '---\ntools: [Read]\n---', 'utf8');

    const result = evaluateReleaseGate({
      oldPath: oldFile,
      newPath: newFile,
      artifactType: 'agent',
      commitMessage: 'feat(agent)!: remove write tool',
    });

    assert.equal(result.requiredBump, 'major');
    assert.equal(
      result.failures.some(failure => failure.includes('migration guide')),
      true
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('evaluateReleaseGate accepts BREAKING CHANGE footer for major releases', () => {
  const tmpDir = makeTempDir('release-gate-breaking-footer');

  try {
    const oldFile = path.join(tmpDir, 'old.md');
    const newFile = path.join(tmpDir, 'new.md');
    const migrationGuide = path.join(tmpDir, 'MIGRATION.md');

    fs.writeFileSync(oldFile, '---\ntools: [Read, Write]\n---', 'utf8');
    fs.writeFileSync(newFile, '---\ntools: [Read]\n---', 'utf8');
    fs.writeFileSync(migrationGuide, '# Migration\n', 'utf8');

    const result = evaluateReleaseGate({
      oldPath: oldFile,
      newPath: newFile,
      artifactType: 'agent',
      commitMessage:
        'feat(agent): remove write tool\n\nBREAKING CHANGE: write capability was removed',
      migrationGuidePath: migrationGuide,
    });

    assert.equal(result.requiredBump, 'major');
    assert.deepEqual(result.failures, []);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('parseArgs reads release gate flags', () => {
  const opts = parseArgs([
    'node',
    'release-gate.cjs',
    '--json',
    '--old',
    'old.md',
    '--new',
    'new.md',
    '--type',
    'agent',
    '--commit-message',
    'feat(agent)!: breaking change',
    '--commit-message-file',
    'release-intent.txt',
    '--migration-guide',
    'MIGRATION.md',
    '--changed-file',
    'README.md',
  ]);

  assert.equal(opts.json, true);
  assert.equal(opts.oldPath, 'old.md');
  assert.equal(opts.newPath, 'new.md');
  assert.equal(opts.artifactType, 'agent');
  assert.equal(opts.commitMessage, 'feat(agent)!: breaking change');
  assert.equal(opts.commitMessageFile, 'release-intent.txt');
  assert.equal(opts.migrationGuidePath, 'MIGRATION.md');
  assert.deepEqual(opts.changedFiles, ['README.md']);
});

test('release-gate accepts commit message from file input', () => {
  const tmpDir = makeTempDir('release-gate-commit-message-file');

  try {
    const oldFile = path.join(tmpDir, 'old.md');
    const newFile = path.join(tmpDir, 'new.md');
    const migrationGuide = path.join(tmpDir, 'MIGRATION.md');
    const releaseIntent = path.join(tmpDir, 'release-intent.txt');

    fs.writeFileSync(oldFile, '---\ntools: [Read, Write]\n---', 'utf8');
    fs.writeFileSync(newFile, '---\ntools: [Read]\n---', 'utf8');
    fs.writeFileSync(migrationGuide, '# Migration\n', 'utf8');
    fs.writeFileSync(
      releaseIntent,
      'feat(agent): remove write tool\n\nBREAKING CHANGE: write capability was removed',
      'utf8'
    );

    const result = spawnSync(
      'node',
      [
        CLI,
        '--json',
        '--old',
        oldFile,
        '--new',
        newFile,
        '--type',
        'agent',
        '--commit-message-file',
        releaseIntent,
        '--migration-guide',
        migrationGuide,
      ],
      {
        encoding: 'utf8',
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.result.requiredBump, 'major');
    assert.deepEqual(parsed.result.failures, []);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('release-gate emits JSON result for docs-only evaluation', () => {
  const result = spawnSync(
    'node',
    [CLI, '--json', '--commit-message', 'docs: refresh docs', '--changed-file', 'README.md'],
    {
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.result.docsOnly, true);
  assert.equal(parsed.result.requiredBump, 'patch');
});
