'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isManagedClaudeWorktree } = require('../../.claude/lib/worktree/worktree-utils.cjs');

describe('worktree-utils', () => {
  it('returns true for Claude-managed worktrees under project .claude/worktrees', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-utils-project-'));
    const worktreeDir = path.join(projectRoot, '.claude', 'worktrees', 'agent-abc123');
    fs.mkdirSync(worktreeDir, { recursive: true });
    fs.writeFileSync(path.join(worktreeDir, '.git'), 'gitdir: /tmp/fake\n', 'utf8');

    try {
      assert.equal(isManagedClaudeWorktree(worktreeDir, projectRoot), true);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('returns false for external linked git worktrees outside project .claude/worktrees', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-utils-project-'));
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-utils-external-'));
    fs.writeFileSync(path.join(externalRoot, '.git'), 'gitdir: /tmp/fake\n', 'utf8');

    try {
      assert.equal(isManagedClaudeWorktree(externalRoot, projectRoot), false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(externalRoot, { recursive: true, force: true });
    }
  });
});
