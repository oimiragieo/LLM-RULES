#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

test('git-notes-verify uses spawnSync git args with shell disabled', () => {
  const source = read('.claude/tools/cli/git-notes-verify.cjs');
  assert.match(source, /spawnSync\('git',\s*args,/);
  assert.match(source, /shell:\s*false/);
  assert.doesNotMatch(source, /\bexecSync\(/);
});

test('doctor CLI dependency checks do not use shell:true', () => {
  const source = read('.claude/tools/cli/doctor.mjs');
  assert.match(source, /spawnSync\(cmd,\s*args,\s*\{[^}]*shell:\s*false/s);
  assert.doesNotMatch(source, /shell:\s*true/);
});

test('gpu-detector uses execFile-based execution path', () => {
  const source = read('.claude/lib/code-indexing/gpu-detector.cjs');
  assert.match(source, /const\s+\{\s*execFile\s*\}\s*=\s*require\('child_process'\)/);
  assert.match(source, /execFileAsync\(/);
  assert.doesNotMatch(source, /\bexec\(/);
});

test('audited files avoid raw JSON.parse and use safeParseJSON', () => {
  const files = [
    '.claude/tools/cli/retrieval-quality-eval.cjs',
    '.claude/tools/maintenance/memory-write-audit.mjs',
    '.claude/lib/memory/memory-slo-metrics.cjs',
    'scripts/validation/validate-hooks-doc-sync.cjs',
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /JSON\.parse\(/, `${file} should not use raw JSON.parse`);
    assert.match(source, /safeParseJSON/, `${file} should use safeParseJSON`);
  }
});
