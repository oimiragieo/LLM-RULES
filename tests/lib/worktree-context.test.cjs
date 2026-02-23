#!/usr/bin/env node
/**
 * worktree-context.test.cjs
 *
 * Unit tests for .claude/lib/utils/worktree-context.cjs
 * Tests worktree depth detection, project root resolution,
 * and active worktree counting.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const {
  getWorktreeDepth,
  isInWorktree,
  findProjectRoot,
  getActiveWorktreeCount,
} = require('../../.claude/lib/utils/worktree-context.cjs');

describe('worktree-context utility', () => {
  describe('getWorktreeDepth', () => {
    it('returns 0 for plain project root', () => {
      assert.strictEqual(getWorktreeDepth('/project'), 0);
    });

    it('returns 0 for path with "worktrees" not under .claude', () => {
      assert.strictEqual(getWorktreeDepth('/project/worktrees/something'), 0);
    });

    it('returns 1 for depth-1 worktree path (normal subagent)', () => {
      assert.strictEqual(getWorktreeDepth('/project/.claude/worktrees/agent-abc123'), 1);
    });

    it('returns 1 for depth-1 worktree with trailing subdir', () => {
      assert.strictEqual(getWorktreeDepth('/project/.claude/worktrees/agent-abc123/src/foo'), 1);
    });

    it('returns 2 for depth-2 nested worktree path (dangerous)', () => {
      const nested = '/project/.claude/worktrees/outer/.claude/worktrees/inner';
      assert.strictEqual(getWorktreeDepth(nested), 2);
    });

    it('handles Windows backslash paths (SE-01 compliance)', () => {
      const windowsPath = 'C:\\dev\\projects\\.claude\\worktrees\\agent-abc';
      assert.strictEqual(getWorktreeDepth(windowsPath), 1);
    });

    it('handles mixed slashes', () => {
      const mixedPath = '/project/.claude/worktrees/agent-abc123\\subdir';
      assert.strictEqual(getWorktreeDepth(mixedPath), 1);
    });

    it('returns 0 for empty string', () => {
      assert.strictEqual(getWorktreeDepth(''), 0);
    });
  });

  describe('isInWorktree', () => {
    it('returns false for plain project path', () => {
      assert.strictEqual(isInWorktree('/project'), false);
    });

    it('returns true for depth-1 worktree path', () => {
      assert.strictEqual(isInWorktree('/project/.claude/worktrees/agent-abc'), true);
    });

    it('returns true for depth-2 nested worktree path', () => {
      const nested = '/project/.claude/worktrees/outer/.claude/worktrees/inner';
      assert.strictEqual(isInWorktree(nested), true);
    });

    it('returns false for path that is the project root ending in worktrees parent', () => {
      assert.strictEqual(isInWorktree('/project/.claude'), false);
    });
  });

  describe('findProjectRoot', () => {
    it('returns path unchanged when not in a worktree', () => {
      assert.strictEqual(findProjectRoot('/project'), '/project');
    });

    it('strips worktree path to return project root (depth-1)', () => {
      const cwd = '/project/.claude/worktrees/agent-abc123';
      assert.strictEqual(findProjectRoot(cwd), '/project');
    });

    it('strips only up to first worktrees segment for nested paths', () => {
      const nested = '/project/.claude/worktrees/outer/.claude/worktrees/inner';
      assert.strictEqual(findProjectRoot(nested), '/project');
    });

    it('handles Windows backslash paths (SE-01)', () => {
      const win = 'C:\\dev\\projects\\.claude\\worktrees\\agent-abc';
      assert.strictEqual(findProjectRoot(win), 'C:/dev/projects');
    });

    it('handles path with trailing content after worktree id', () => {
      const cwd = '/project/.claude/worktrees/agent-abc/src';
      assert.strictEqual(findProjectRoot(cwd), '/project');
    });
  });

  describe('getActiveWorktreeCount', () => {
    it('returns 0 when project root has no .claude/worktrees directory', () => {
      assert.strictEqual(getActiveWorktreeCount('/nonexistent-project-root-12345'), 0);
    });

    it('returns 0 on filesystem errors (safe fallback)', () => {
      assert.strictEqual(getActiveWorktreeCount(null), 0);
    });

    it('counts worktree subdirectories correctly', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-count-'));
      try {
        const worktreesDir = path.join(tmpDir, '.claude', 'worktrees');
        fs.mkdirSync(worktreesDir, { recursive: true });
        fs.mkdirSync(path.join(worktreesDir, 'agent-aaa'));
        fs.mkdirSync(path.join(worktreesDir, 'agent-bbb'));
        fs.mkdirSync(path.join(worktreesDir, 'agent-ccc'));
        assert.strictEqual(getActiveWorktreeCount(tmpDir), 3);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns 0 when worktrees directory is empty', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-empty-'));
      try {
        const worktreesDir = path.join(tmpDir, '.claude', 'worktrees');
        fs.mkdirSync(worktreesDir, { recursive: true });
        assert.strictEqual(getActiveWorktreeCount(tmpDir), 0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('ignores files, only counts directories', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-files-'));
      try {
        const worktreesDir = path.join(tmpDir, '.claude', 'worktrees');
        fs.mkdirSync(worktreesDir, { recursive: true });
        fs.mkdirSync(path.join(worktreesDir, 'agent-aaa'));
        fs.writeFileSync(path.join(worktreesDir, 'some-file.txt'), 'content');
        assert.strictEqual(getActiveWorktreeCount(tmpDir), 1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('auto-detects project root from cwd when projectRoot not provided', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-autoroot-'));
      try {
        const worktreesDir = path.join(tmpDir, '.claude', 'worktrees');
        fs.mkdirSync(worktreesDir, { recursive: true });
        fs.mkdirSync(path.join(worktreesDir, 'agent-xyz'));
        // Simulate being inside a worktree of tmpDir
        const fakeCwd = path.join(tmpDir, '.claude', 'worktrees', 'agent-xyz');
        assert.strictEqual(getActiveWorktreeCount(undefined, fakeCwd), 1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
