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

const {
  isSameOrInsidePath,
  parseWorktreeList,
  shouldRemoveWorktree,
} = require('../../../.claude/tools/cli/worktree-prune.cjs');

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
    assert.equal(
      result.status,
      0,
      `Expected exit 0 but got ${result.status}. stderr: ${result.stderr}`
    );
    assert.ok(
      result.stdout.includes('Worktree Pruner'),
      `stdout should include "Worktree Pruner". Got: ${result.stdout}`
    );
    assert.ok(
      result.stdout.includes('Summary:'),
      `stdout should include "Summary:". Got: ${result.stdout}`
    );
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

  it('parses git-locked worktree metadata so active agents can be skipped', () => {
    const worktrees = parseWorktreeList(
      [
        'worktree C:/repo',
        'HEAD 1111111111111111111111111111111111111111',
        'branch refs/heads/main',
        '',
        'worktree C:/repo/.claude/worktrees/agent-a077670c',
        'HEAD a8ba65da9a2ef7973dd43b68d553d0f6545d5bfa',
        'branch refs/heads/worktree-agent-a077670c',
        'locked claude agent agent-a077670c (pid 147960)',
        '',
      ].join('\n')
    );

    assert.equal(worktrees.length, 2);
    assert.equal(worktrees[0].locked, false);
    assert.equal(worktrees[0].lockedReason, '');
    assert.equal(worktrees[1].worktreePath, 'C:/repo/.claude/worktrees/agent-a077670c');
    assert.equal(worktrees[1].branch, 'worktree-agent-a077670c');
    assert.equal(worktrees[1].locked, true);
    assert.equal(worktrees[1].lockedReason, 'claude agent agent-a077670c (pid 147960)');
  });

  it('parses label-only git locked worktree metadata', () => {
    const [worktree] = parseWorktreeList(
      [
        'worktree C:/repo/.claude/worktrees/agent-a077670c',
        'HEAD a8ba65da9a2ef7973dd43b68d553d0f6545d5bfa',
        'branch refs/heads/worktree-agent-a077670c',
        'locked',
        '',
      ].join('\n')
    );

    assert.equal(worktree.locked, true);
    assert.equal(worktree.lockedReason, '');
  });

  it('does not remove TTL-expired worktrees with unique commits', () => {
    const decision = shouldRemoveWorktree({
      branch: 'worktree-agent-a077670c-1700000000000',
      uniqueCommitsOutput: 'abc123 important work\n',
      statusOutput: '',
      now: 1800000000000,
    });

    assert.equal(decision.remove, false);
    assert.equal(decision.reason, 'unique commits');
  });

  it('does not remove merged worktrees with uncommitted or untracked files', () => {
    const decision = shouldRemoveWorktree({
      branch: 'worktree-agent-a077670c-1700000000000',
      uniqueCommitsOutput: '',
      statusOutput: '?? scratch.txt\n M package.json\n',
      now: 1800000000000,
    });

    assert.equal(decision.remove, false);
    assert.equal(decision.reason, 'worktree changes');
  });

  it('uses case-insensitive segment-aware current worktree checks on Windows paths', () => {
    assert.equal(
      isSameOrInsidePath(
        'C:/Repo/.claude/worktrees/agent-a/file.txt',
        'c:/repo/.claude/worktrees/agent-a'
      ),
      true
    );
    assert.equal(
      isSameOrInsidePath(
        'C:/Repo/.claude/worktrees/agent-a2/file.txt',
        'c:/repo/.claude/worktrees/agent-a'
      ),
      false
    );
  });
});
