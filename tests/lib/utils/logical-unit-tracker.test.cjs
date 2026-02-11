'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { runGit } = require('../../../.claude/lib/utils/logical-unit-tracker.cjs');

function initRepo() {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'logical-unit-tracker-'));
  execFileSync('git', ['init'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoPath, stdio: 'pipe' });
  fs.writeFileSync(path.join(repoPath, 'README.md'), 'seed\n', 'utf8');
  execFileSync('git', ['add', 'README.md'], { cwd: repoPath, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'seed'], { cwd: repoPath, stdio: 'pipe' });
  return repoPath;
}

test('runGit executes git safely with argument vector', () => {
  const repoPath = initRepo();
  const hash = runGit(repoPath, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.ok(/^[a-f0-9]{40}$/i.test(hash), 'should return HEAD hash');
});

test('runGit does not execute shell metacharacters from args', () => {
  const repoPath = initRepo();
  const markerPath = path.join(repoPath, 'owned.txt');

  assert.throws(() => {
    runGit(repoPath, ['rev-parse', `HEAD; echo owned > "${markerPath}"`], { encoding: 'utf8' });
  });

  assert.equal(fs.existsSync(markerPath), false, 'metacharacters must not execute shell payloads');
});
