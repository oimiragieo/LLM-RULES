'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relPath), 'utf8');
}

test('test-version-validation does not use shell:true spawn', () => {
  const content = read('scripts/testing/test-version-validation.mjs');
  assert.doesNotMatch(content, /shell:\s*true/);
});

test('count-all-tests does not execute interpolated shell command strings', () => {
  const content = read('scripts/testing/count-all-tests.mjs');
  assert.doesNotMatch(content, /execSync\s*\(\s*`/);
  assert.match(content, /spawnSync|execFileSync/);
});

test('verify-dependencies uses execFileSync for external binaries', () => {
  const content = read('scripts/verify-dependencies.mjs');
  assert.match(content, /execFileSync/);
  assert.doesNotMatch(content, /execSync\s*\(/);
});

test('security-lint uses spawnSync for git discovery commands', () => {
  const content = read('.claude/tools/cli/security-lint.cjs');
  assert.doesNotMatch(content, /execSync\s*\(\s*['"`]git /);
  assert.match(content, /spawnSync/);
});
