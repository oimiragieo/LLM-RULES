#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'session',
  'worktree-prune-on-start.cjs'
);

function runHook(input = '{}') {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      // Use a tmp runtime dir so we never write to the real runtime dir
      WORKTREE_PRUNE_RUNTIME_DIR: path.join(PROJECT_ROOT, '.claude', 'context', 'tmp'),
    },
  });
}

test('worktree-prune-on-start exits 0 on valid stdin', () => {
  const result = runHook('{}');
  assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}: ${result.stderr}`);
  const output = JSON.parse(result.stdout.trim());
  assert.strictEqual(output.allow, true);
});

test('worktree-prune-on-start exits 0 on empty stdin', () => {
  const result = runHook('');
  assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}: ${result.stderr}`);
});

test('worktree-prune-on-start does not use shell:true', () => {
  const source = fs.readFileSync(HOOK_PATH, 'utf8');
  const shellTrueMatches = source.match(/shell\s*:\s*true/g);
  assert.strictEqual(
    shellTrueMatches,
    null,
    `Hook must not use shell:true (SE-01 compliance): found ${shellTrueMatches}`
  );
});

test('worktree-prune-on-start uses safeParseJSON', () => {
  const source = fs.readFileSync(HOOK_PATH, 'utf8');
  assert.ok(
    source.includes('safeParseJSON'),
    'Hook must use safeParseJSON for stdin parsing (SE-02 compliance)'
  );
});
