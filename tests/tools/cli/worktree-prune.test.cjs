#!/usr/bin/env node
'use strict';
/**
 * Tests for .claude/tools/cli/worktree-prune.cjs
 *
 * Uses node:test runner with spawnSync to exercise the CLI tool.
 * The --dry-run flag is used throughout to avoid mutating git state.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const TOOL_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'tools',
  'cli',
  'worktree-prune.cjs'
);

describe('worktree-prune CLI', () => {
  it('runs in --dry-run mode and exits 0', () => {
    const result = spawnSync(process.execPath, [TOOL_PATH, '--dry-run'], {
      encoding: 'utf8',
      timeout: 15000,
      shell: false,
    });
    assert.equal(result.status, 0, `Expected exit 0 but got ${result.status}. stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('Worktree Pruner'), `stdout should include "Worktree Pruner". Got: ${result.stdout}`);
    assert.ok(result.stdout.includes('Summary:'), `stdout should include "Summary:". Got: ${result.stdout}`);
  });

  it('prints [DRY RUN] notice in dry-run mode', () => {
    const result = spawnSync(process.execPath, [TOOL_PATH, '--dry-run'], {
      encoding: 'utf8',
      timeout: 15000,
      shell: false,
    });
    assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('[DRY RUN]'),
      `stdout should include "[DRY RUN]". Got: ${result.stdout}`
    );
  });

  it('shows summary line in dry-run output', () => {
    const result = spawnSync(process.execPath, [TOOL_PATH, '--dry-run'], {
      encoding: 'utf8',
      timeout: 15000,
      shell: false,
    });
    assert.equal(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
    // Summary line format: "Summary: N removed, N skipped, N errors"
    assert.match(
      result.stdout,
      /Summary: \d+ removed, \d+ skipped, \d+ errors/,
      `stdout should contain summary line. Got: ${result.stdout}`
    );
  });
});
