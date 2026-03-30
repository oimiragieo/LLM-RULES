'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const {
  computeBaseBranchDiff,
  computeUncommittedDiff,
  computeCommitDiff,
} = require('../../.claude/lib/review/diff-engine.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a git command in a given directory and return trimmed stdout. */
function git(args, cwd) {
  return execSync('git ' + args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/** Create and initialise a temp git repo. */
function initRepo(dir) {
  git('init', dir);
  git('config user.email "test@example.com"', dir);
  git('config user.name "Test User"', dir);
  // Ensure a consistent default branch name
  try {
    git('checkout -b main', dir);
  } catch {
    // may already be on main / master — that's fine
  }
}

// ---------------------------------------------------------------------------
// computeCommitDiff
// ---------------------------------------------------------------------------

describe('computeCommitDiff', () => {
  let dir;
  let commit1Hash;
  let commit2Hash;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-commit-test-'));
    initRepo(dir);

    // Commit 1 — initial state
    fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nline2\nline3\n');
    git('add -A', dir);
    git('commit -m "initial"', dir);
    commit1Hash = git('rev-parse HEAD', dir);

    // Commit 2 — modify a.txt and add b.txt
    fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nline2 changed\nline3\n');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'new file\n');
    git('add -A', dir);
    git('commit -m "second"', dir);
    commit2Hash = git('rev-parse HEAD', dir);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns structured diff with files array', () => {
    const result = computeCommitDiff(dir, commit2Hash);
    assert.ok(result, 'result should be defined');
    assert.ok(Array.isArray(result.files), 'result.files should be an array');
  });

  it('includes both modified and new files', () => {
    const result = computeCommitDiff(dir, commit2Hash);
    const filePaths = result.files.map(f => f.path);
    assert.ok(filePaths.includes('a.txt'), 'should include modified a.txt');
    assert.ok(filePaths.includes('b.txt'), 'should include new b.txt');
  });

  it('reports additions and deletions for a modified file', () => {
    const result = computeCommitDiff(dir, commit2Hash);
    const aFile = result.files.find(f => f.path === 'a.txt');
    assert.ok(aFile, 'a.txt should be in result');
    assert.ok(aFile.hunks.length > 0, 'should have at least one hunk');
    assert.ok(aFile.additions > 0, 'should have additions');
    assert.ok(aFile.deletions > 0, 'should have deletions');
    assert.strictEqual(aFile.binary, false, 'should not be flagged as binary');
  });

  it('initial commit shows only additions (no deletions)', () => {
    const result = computeCommitDiff(dir, commit1Hash);
    assert.ok(result.files.length >= 1, 'initial commit should include files');
    const aFile = result.files.find(f => f.path === 'a.txt');
    assert.ok(aFile, 'a.txt should appear in initial commit diff');
    assert.ok(aFile.additions > 0, 'initial commit should have additions');
    assert.strictEqual(aFile.deletions, 0, 'initial commit should have no deletions');
  });

  it('each file has path, hunks, additions, deletions fields', () => {
    const result = computeCommitDiff(dir, commit2Hash);
    for (const file of result.files) {
      assert.ok(typeof file.path === 'string', 'path should be a string');
      assert.ok(Array.isArray(file.hunks), 'hunks should be an array');
      assert.ok(typeof file.additions === 'number', 'additions should be a number');
      assert.ok(typeof file.deletions === 'number', 'deletions should be a number');
    }
  });

  it('each hunk has header, oldStart, oldLines, newStart, newLines, lines fields', () => {
    const result = computeCommitDiff(dir, commit2Hash);
    const aFile = result.files.find(f => f.path === 'a.txt');
    assert.ok(aFile && aFile.hunks.length > 0, 'a.txt should have hunks');
    const hunk = aFile.hunks[0];
    assert.ok(typeof hunk.header === 'string', 'hunk.header should be a string');
    assert.ok(typeof hunk.oldStart === 'number', 'hunk.oldStart should be a number');
    assert.ok(typeof hunk.oldLines === 'number', 'hunk.oldLines should be a number');
    assert.ok(typeof hunk.newStart === 'number', 'hunk.newStart should be a number');
    assert.ok(typeof hunk.newLines === 'number', 'hunk.newLines should be a number');
    assert.ok(Array.isArray(hunk.lines), 'hunk.lines should be an array');
  });
});

// ---------------------------------------------------------------------------
// computeBaseBranchDiff
// ---------------------------------------------------------------------------

describe('computeBaseBranchDiff', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-base-test-'));
    initRepo(dir);

    // Base commit — tag it
    fs.writeFileSync(path.join(dir, 'a.txt'), 'original\n');
    git('add -A', dir);
    git('commit -m "base commit"', dir);
    git('tag base-point', dir);

    // Commits ahead of base
    fs.writeFileSync(path.join(dir, 'a.txt'), 'modified\n');
    git('add -A', dir);
    git('commit -m "ahead 1"', dir);

    fs.writeFileSync(path.join(dir, 'b.txt'), 'new file content\n');
    git('add -A', dir);
    git('commit -m "ahead 2"', dir);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns structured result with files array', () => {
    const result = computeBaseBranchDiff(dir, 'base-point');
    assert.ok(result, 'result should be defined');
    assert.ok(Array.isArray(result.files), 'result.files should be an array');
  });

  it('shows all files changed since base branch', () => {
    const result = computeBaseBranchDiff(dir, 'base-point');
    assert.ok(result.files.length >= 1, 'should have changed files');
    const filePaths = result.files.map(f => f.path);
    assert.ok(filePaths.includes('a.txt'), 'modified a.txt should appear');
    assert.ok(filePaths.includes('b.txt'), 'new b.txt should appear');
  });

  it('returns empty files array when HEAD equals base', () => {
    const headHash = git('rev-parse HEAD', dir);
    const result = computeBaseBranchDiff(dir, headHash);
    assert.deepEqual(result.files, [], 'no diff when comparing HEAD to itself');
  });

  it('each file has the required structural fields', () => {
    const result = computeBaseBranchDiff(dir, 'base-point');
    for (const file of result.files) {
      assert.ok(typeof file.path === 'string', 'path should be a string');
      assert.ok(Array.isArray(file.hunks), 'hunks should be an array');
      assert.ok(typeof file.additions === 'number', 'additions should be a number');
      assert.ok(typeof file.deletions === 'number', 'deletions should be a number');
    }
  });
});

// ---------------------------------------------------------------------------
// computeUncommittedDiff
// ---------------------------------------------------------------------------

describe('computeUncommittedDiff', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-uncommitted-test-'));
    initRepo(dir);

    // Initial commit — gives us a clean tracked state
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'original content\n');
    git('add -A', dir);
    git('commit -m "initial"', dir);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty files array when working tree is clean', () => {
    const result = computeUncommittedDiff(dir);
    assert.deepEqual(result.files, [], 'clean tree should yield empty diff');
  });

  it('captures staged changes', () => {
    // Stage a modification
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'staged change\n');
    git('add tracked.txt', dir);

    let result;
    try {
      result = computeUncommittedDiff(dir);
    } finally {
      // Restore working tree
      git('checkout HEAD -- tracked.txt', dir);
    }

    const filePaths = result.files.map(f => f.path);
    assert.ok(filePaths.includes('tracked.txt'), 'staged file should appear in diff');
  });

  it('captures unstaged changes', () => {
    // Modify without staging
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'unstaged change\n');

    let result;
    try {
      result = computeUncommittedDiff(dir);
    } finally {
      git('checkout HEAD -- tracked.txt', dir);
    }

    const filePaths = result.files.map(f => f.path);
    assert.ok(filePaths.includes('tracked.txt'), 'unstaged file should appear in diff');
  });

  it('captures untracked files', () => {
    const untrackedPath = path.join(dir, 'untracked.txt');
    fs.writeFileSync(untrackedPath, 'brand new file\n');

    let result;
    try {
      result = computeUncommittedDiff(dir);
    } finally {
      fs.unlinkSync(untrackedPath);
    }

    const filePaths = result.files.map(f => f.path);
    assert.ok(filePaths.includes('untracked.txt'), 'untracked file should appear in diff');
  });

  it('untracked file has additions > 0 and deletions = 0', () => {
    const untrackedPath = path.join(dir, 'newfile.txt');
    fs.writeFileSync(untrackedPath, 'line1\nline2\nline3\n');

    let result;
    try {
      result = computeUncommittedDiff(dir);
    } finally {
      fs.unlinkSync(untrackedPath);
    }

    const f = result.files.find(x => x.path === 'newfile.txt');
    assert.ok(f, 'newfile.txt should be in diff');
    assert.ok(f.additions > 0, 'untracked file should have additions');
    assert.strictEqual(f.deletions, 0, 'untracked file should have no deletions');
  });

  it('result has the required structural fields for each file', () => {
    const untrackedPath = path.join(dir, 'struct-check.txt');
    fs.writeFileSync(untrackedPath, 'hello\n');

    let result;
    try {
      result = computeUncommittedDiff(dir);
    } finally {
      fs.unlinkSync(untrackedPath);
    }

    for (const file of result.files) {
      assert.ok(typeof file.path === 'string', 'path should be a string');
      assert.ok(Array.isArray(file.hunks), 'hunks should be an array');
      assert.ok(typeof file.additions === 'number', 'additions should be a number');
      assert.ok(typeof file.deletions === 'number', 'deletions should be a number');
    }
  });
});

// ---------------------------------------------------------------------------
// Binary file handling
// ---------------------------------------------------------------------------

describe('binary file handling', () => {
  let dir;
  let commitWithBinaryHash;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-binary-test-'));
    initRepo(dir);

    // Add an initial text file
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'hello\n');
    git('add -A', dir);
    git('commit -m "initial"', dir);

    // Add a binary file (PNG magic bytes + null byte)
    const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    fs.writeFileSync(path.join(dir, 'image.bin'), binaryData);
    git('add -A', dir);
    git('commit -m "add binary file"', dir);
    commitWithBinaryHash = git('rev-parse HEAD', dir);

    // Modify the binary file
    const binaryData2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    fs.writeFileSync(path.join(dir, 'image.bin'), binaryData2);
    git('add -A', dir);
    git('commit -m "modify binary"', dir);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('binary files are flagged with binary: true in computeCommitDiff', () => {
    const headHash = git('rev-parse HEAD', dir);
    const result = computeCommitDiff(dir, headHash);
    const binFile = result.files.find(f => f.path === 'image.bin');
    assert.ok(binFile, 'binary file should appear in result');
    assert.strictEqual(binFile.binary, true, 'binary flag should be true');
  });

  it('binary files have empty hunks array', () => {
    const headHash = git('rev-parse HEAD', dir);
    const result = computeCommitDiff(dir, headHash);
    const binFile = result.files.find(f => f.path === 'image.bin');
    assert.ok(binFile, 'binary file should appear in result');
    assert.deepEqual(binFile.hunks, [], 'binary file should have no hunks');
  });

  it('binary untracked files are flagged in computeUncommittedDiff', () => {
    const binaryPath = path.join(dir, 'untracked-binary.bin');
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]);
    fs.writeFileSync(binaryPath, binaryData);

    let result;
    try {
      result = computeUncommittedDiff(dir);
    } finally {
      fs.unlinkSync(binaryPath);
    }

    const f = result.files.find(x => x.path === 'untracked-binary.bin');
    assert.ok(f, 'untracked binary file should appear');
    assert.strictEqual(f.binary, true, 'untracked binary file should be flagged');
    assert.deepEqual(f.hunks, [], 'binary file should have no hunks');
  });

  it('commit that adds binary file flags it as binary', () => {
    const result = computeCommitDiff(dir, commitWithBinaryHash);
    const binFile = result.files.find(f => f.path === 'image.bin');
    assert.ok(binFile, 'binary file should appear in the commit that added it');
    assert.strictEqual(binFile.binary, true, 'binary flag should be true');
  });
});

// ---------------------------------------------------------------------------
// Empty diff
// ---------------------------------------------------------------------------

describe('empty diff edge cases', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-empty-test-'));
    initRepo(dir);

    fs.writeFileSync(path.join(dir, 'file.txt'), 'content\n');
    git('add -A', dir);
    git('commit -m "only commit"', dir);
    git('tag v1', dir);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('computeBaseBranchDiff returns empty array when no commits ahead', () => {
    const result = computeBaseBranchDiff(dir, 'v1');
    assert.deepEqual(result.files, []);
  });

  it('computeUncommittedDiff returns empty array on clean tree', () => {
    const result = computeUncommittedDiff(dir);
    assert.deepEqual(result.files, []);
  });
});
