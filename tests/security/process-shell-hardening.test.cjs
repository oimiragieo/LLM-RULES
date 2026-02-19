'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

test('SEC-03: testing scripts avoid shell:true and avoid execSync', () => {
  const files = ['scripts/testing/test-version-validation.mjs', 'scripts/testing/count-all-tests.mjs'];

  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /shell\s*:\s*true/, `${file} must not use shell:true`);
    assert.doesNotMatch(src, /\bexecSync\s*\(/, `${file} must not use execSync`);
  }
});

test('SEC-04: verify-dependencies uses execFileSync with argument arrays', () => {
  const file = 'scripts/verify-dependencies.mjs';
  const src = read(file);

  assert.match(src, /execFileSync\s*\(/, `${file} should use execFileSync`);
  assert.doesNotMatch(src, /\bexecSync\s*\(/, `${file} must not use execSync`);
  assert.doesNotMatch(src, /shell\s*:\s*true/, `${file} must not use shell:true`);
});

test('SEC-05: security-lint uses spawnSync with shell:false for git queries', () => {
  const file = '.claude/tools/cli/security-lint.cjs';
  const src = read(file);

  assert.match(src, /spawnSync\('git',\s*\['diff',\s*'--cached'/, 'should use spawnSync for staged query');
  assert.match(src, /spawnSync\('git',\s*\['ls-files'\]/, 'should use spawnSync for tracked query');
  assert.doesNotMatch(src, /\bexecSync\s*\(/, `${file} must not use execSync`);
  assert.doesNotMatch(src, /shell\s*:\s*true/, `${file} must not use shell:true`);
});
