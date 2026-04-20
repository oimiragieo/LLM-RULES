/* Agent: developer | Task: #P03 | Session: 2026-04-19 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const hookPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'memory',
  'memory-autocommit.cjs'
);

/**
 * Run a git command in a given cwd, asserting success.
 * Uses shell:false with array args per SE-01/SE-02.
 */
function git(cwd, args, { allowFail = false } = {}) {
  const res = spawnSync('git', args, {
    cwd,
    shell: false,
    encoding: 'utf8',
  });
  if (!allowFail && res.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${cwd}: status=${res.status}\nstdout=${res.stdout}\nstderr=${res.stderr}`
    );
  }
  return res;
}

/**
 * Create an isolated temp git repo with the memory-dir layout we care about.
 * Returns {tmpDir, cleanup}.
 */
function makeTempRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p03-'));
  // Config a deterministic identity BEFORE any commit
  git(tmpDir, ['init', '--initial-branch=main']);
  git(tmpDir, ['config', 'user.email', 'test@example.com']);
  git(tmpDir, ['config', 'user.name', 'P03 Test']);
  git(tmpDir, ['config', 'commit.gpgsign', 'false']);
  // Baseline empty commit so branches are real
  git(tmpDir, ['commit', '--allow-empty', '-m', 'init']);

  const memDir = path.join(tmpDir, '.claude', 'context', 'memory');
  fs.mkdirSync(memDir, { recursive: true });

  return {
    tmpDir,
    memDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // best-effort on Windows
      }
    },
  };
}

function freshlyLoadHook() {
  delete require.cache[require.resolve(hookPath)];
  return require(hookPath);
}

test('memory-autocommit: module exists and exports autocommitMemoryDeltas()', () => {
  const mod = freshlyLoadHook();
  assert.equal(typeof mod.autocommitMemoryDeltas, 'function');
});

test('memory-autocommit: commits allowlisted memory delta on feature branch', () => {
  const { tmpDir, memDir, cleanup } = makeTempRepo();
  try {
    git(tmpDir, ['checkout', '-b', 'feature/test-autocommit']);

    // allowlisted delta
    fs.writeFileSync(
      path.join(memDir, 'learnings.md'),
      '# Learnings\n\n- test delta from P03\n',
      'utf8'
    );
    // non-allowlisted noise inside memory dir (extension not .md/.json)
    fs.writeFileSync(path.join(memDir, '.git-ignore-me.txt'), 'noise\n', 'utf8');

    const shaBefore = git(tmpDir, ['rev-parse', 'HEAD']).stdout.trim();

    const { autocommitMemoryDeltas } = freshlyLoadHook();
    const result = autocommitMemoryDeltas({ cwd: tmpDir });

    assert.equal(result.committed, true, `expected commit; got ${JSON.stringify(result)}`);
    const shaAfter = git(tmpDir, ['rev-parse', 'HEAD']).stdout.trim();
    assert.notEqual(shaAfter, shaBefore, 'HEAD should advance');

    // The commit should touch ONLY learnings.md (not the .txt noise)
    const filesInCommit = git(tmpDir, [
      'show',
      '--name-only',
      '--pretty=format:',
      'HEAD',
    ]).stdout.trim();
    assert.ok(
      filesInCommit.includes('learnings.md'),
      `learnings.md must be in commit; got:\n${filesInCommit}`
    );
    assert.ok(
      !filesInCommit.includes('.git-ignore-me.txt'),
      `.git-ignore-me.txt must NOT be in commit; got:\n${filesInCommit}`
    );

    // Commit message shape
    const msg = git(tmpDir, ['log', '-1', '--pretty=%B']).stdout;
    assert.ok(msg.includes('chore(memory): auto-persist session learnings [skip ci]'), msg);
    assert.ok(msg.includes('Co-Authored-By: Claude'), msg);

    // Idempotent: calling again should be a no-op
    const idem = autocommitMemoryDeltas({ cwd: tmpDir });
    assert.equal(idem.committed, false);
    assert.equal(idem.reason, 'nothing-to-commit');
  } finally {
    cleanup();
  }
});

test('memory-autocommit: refuses to commit on main branch', () => {
  const { tmpDir, memDir, cleanup } = makeTempRepo();
  try {
    // makeTempRepo already leaves us on main
    fs.writeFileSync(path.join(memDir, 'learnings.md'), '# Learnings\n\n- on main\n', 'utf8');

    const shaBefore = git(tmpDir, ['rev-parse', 'HEAD']).stdout.trim();
    const { autocommitMemoryDeltas } = freshlyLoadHook();
    const result = autocommitMemoryDeltas({ cwd: tmpDir });

    assert.equal(result.committed, false);
    assert.equal(result.reason, 'protected-branch');

    const shaAfter = git(tmpDir, ['rev-parse', 'HEAD']).stdout.trim();
    assert.equal(shaAfter, shaBefore, 'HEAD must not move on main');
  } finally {
    cleanup();
  }
});

test('memory-autocommit: refuses to commit on master branch', () => {
  const { tmpDir, memDir, cleanup } = makeTempRepo();
  try {
    git(tmpDir, ['checkout', '-b', 'master']);
    fs.writeFileSync(path.join(memDir, 'learnings.md'), '# Learnings\n\n- on master\n', 'utf8');

    const shaBefore = git(tmpDir, ['rev-parse', 'HEAD']).stdout.trim();
    const { autocommitMemoryDeltas } = freshlyLoadHook();
    const result = autocommitMemoryDeltas({ cwd: tmpDir });

    assert.equal(result.committed, false);
    assert.equal(result.reason, 'protected-branch');
    assert.equal(git(tmpDir, ['rev-parse', 'HEAD']).stdout.trim(), shaBefore);
  } finally {
    cleanup();
  }
});

test('memory-autocommit: ignores non-memory dirty files', () => {
  const { tmpDir, cleanup } = makeTempRepo();
  try {
    git(tmpDir, ['checkout', '-b', 'feature/non-memory-dirt']);

    // non-memory dirt — must NOT be staged/committed
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'hello\n', 'utf8');
    // no memory delta
    const { autocommitMemoryDeltas } = freshlyLoadHook();
    const result = autocommitMemoryDeltas({ cwd: tmpDir });

    assert.equal(result.committed, false);
    assert.equal(result.reason, 'nothing-to-commit');

    // README must still be dirty after the hook runs
    const status = git(tmpDir, ['status', '--porcelain']).stdout;
    assert.ok(status.includes('README.md'), `README should remain dirty; status=\n${status}`);
  } finally {
    cleanup();
  }
});

test('memory-autocommit: includes nested memory subdirs (e.g. archive/)', () => {
  const { tmpDir, memDir, cleanup } = makeTempRepo();
  try {
    git(tmpDir, ['checkout', '-b', 'feature/archive-subdir']);

    const archiveDir = path.join(memDir, 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(
      path.join(archiveDir, 'old-learning.md'),
      '# Archived\n\n- old note\n',
      'utf8'
    );

    const { autocommitMemoryDeltas } = freshlyLoadHook();
    const result = autocommitMemoryDeltas({ cwd: tmpDir });

    assert.equal(result.committed, true, JSON.stringify(result));
    const filesInCommit = git(tmpDir, [
      'show',
      '--name-only',
      '--pretty=format:',
      'HEAD',
    ]).stdout.trim();
    assert.ok(
      filesInCommit.includes('archive/old-learning.md'),
      `archive/old-learning.md must be in commit; got:\n${filesInCommit}`
    );
  } finally {
    cleanup();
  }
});

test('memory-autocommit: returns not-git-repo when cwd is not a git tree', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p03-nogit-'));
  try {
    const { autocommitMemoryDeltas } = freshlyLoadHook();
    const result = autocommitMemoryDeltas({ cwd: tmpDir });
    assert.equal(result.committed, false);
    assert.equal(result.reason, 'not-git-repo');
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* best-effort */
    }
  }
});
