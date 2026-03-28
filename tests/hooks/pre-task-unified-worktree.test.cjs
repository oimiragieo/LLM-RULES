#!/usr/bin/env node
/**
 * pre-task-unified-worktree.test.cjs
 *
 * TDD tests for Fix 3 (nested worktree guard) and Fix 4 (concurrent agent cap)
 * in pre-task-unified-core.cjs.
 *
 * Fix 3: Block Task() spawns from depth-1 worktrees (prevents depth-2 nesting).
 * Fix 4: Cap concurrent agents via active worktree count (prevents memory exhaustion).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ── Module loader helpers ────────────────────────────────────────────────────

function freshRequireCore() {
  // Clear the entire module cache chain that pre-task-unified-core pulls in
  const keys = Object.keys(require.cache).filter(
    k =>
      k.includes('pre-task-unified-core') ||
      k.includes('pre-task-unified-state') ||
      k.includes('pre-task-unified-helpers') ||
      k.includes('pre-task-unified-ownership') ||
      k.includes('worktree-context')
  );
  for (const k of keys) delete require.cache[k];
  return require('../../.claude/hooks/routing/pre-task-unified-core.cjs');
}

// ── Fix 3: Nested Worktree Guard ─────────────────────────────────────────────

describe('Fix 3 — checkNestedWorktreeSpawn', () => {
  let checkNestedWorktreeSpawn;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.NESTED_WORKTREE_ENFORCEMENT = 'block';
    checkNestedWorktreeSpawn = freshRequireCore().checkNestedWorktreeSpawn;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('blocks Task() from a depth-1 worktree (would create depth-2)', async () => {
    const fakeCwd = '/project/.claude/worktrees/agent-abc';
    const hookInput = { tool: 'Task' };
    const result = checkNestedWorktreeSpawn(hookInput, fakeCwd);
    assert.strictEqual(result.pass, false, 'Depth-1 worktree should block Task() spawn');
    assert.strictEqual(result.result, 'block');
    assert.ok(
      result.message.includes('NESTED-WORKTREE'),
      'Message should reference NESTED-WORKTREE'
    );
  });

  it('blocks Task() from a depth-2 worktree (would create depth-3)', async () => {
    const fakeCwd = '/project/.claude/worktrees/outer/.claude/worktrees/inner';
    const result = checkNestedWorktreeSpawn({}, fakeCwd);
    assert.strictEqual(result.pass, false, 'Depth-2 worktree should also block');
  });

  it('allows Task() from router context (depth-0, no worktree)', async () => {
    const result = checkNestedWorktreeSpawn({}, '/project');
    assert.strictEqual(result.pass, true, 'Router context should be allowed');
  });

  it('warns (not blocks) when enforcement is warn', async () => {
    process.env.NESTED_WORKTREE_ENFORCEMENT = 'warn';
    const fakeCwd = '/project/.claude/worktrees/agent-abc';
    const result = checkNestedWorktreeSpawn({}, fakeCwd);
    assert.strictEqual(result.pass, true, 'warn mode should pass');
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message.includes('NESTED-WORKTREE'));
  });

  it('allows everything when enforcement is off', async () => {
    process.env.NESTED_WORKTREE_ENFORCEMENT = 'off';
    const fakeCwd = '/project/.claude/worktrees/agent-abc';
    const result = checkNestedWorktreeSpawn({}, fakeCwd);
    assert.strictEqual(result.pass, true, 'off mode should allow');
    assert.strictEqual(result.result, undefined);
  });

  it('handles Windows worktree paths (SE-01)', async () => {
    process.env.NESTED_WORKTREE_ENFORCEMENT = 'block';
    const fakeCwd = 'C:\\dev\\projects\\.claude\\worktrees\\agent-abc';
    const result = checkNestedWorktreeSpawn({}, fakeCwd);
    assert.strictEqual(result.pass, false, 'Windows worktree path should be detected');
  });

  it('allows a hierarchical sub-router to delegate to one specialist from a worktree', async () => {
    process.env.HIERARCHICAL_ROUTING = 'on';
    const fakeCwd = '/project/.claude/worktrees/domain-router-backend';
    const result = checkNestedWorktreeSpawn(
      {
        agent_id: 'domain-router-backend',
        tool_name: 'Task',
        tool_input: { subagent_type: 'fastapi-pro' },
      },
      fakeCwd
    );

    assert.strictEqual(result.pass, true, 'router -> sub-router -> specialist should be allowed');
  });
});

// ── Fix 4: Concurrent Agent Cap ──────────────────────────────────────────────

describe('Fix 4 — checkConcurrentAgentCap', () => {
  let checkConcurrentAgentCap;
  let originalEnv;
  let tmpDir;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.CONCURRENT_AGENT_CAP = '3';
    process.env.CONCURRENT_AGENT_CAP_ENFORCEMENT = 'block';

    // Create a temp project root with a .claude/worktrees dir
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-test-'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees'), { recursive: true });

    checkConcurrentAgentCap = freshRequireCore().checkConcurrentAgentCap;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('allows spawn when active worktrees < cap', async () => {
    // Create 2 worktrees, cap is 3
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-aaa'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-bbb'));
    const result = checkConcurrentAgentCap({}, tmpDir);
    assert.strictEqual(result.pass, true, '2 active worktrees < cap of 3 should be allowed');
  });

  it('allows spawn when active worktrees equals cap (boundary)', async () => {
    // Create exactly 3 worktrees, cap is 3 — at cap, not over
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-aaa'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-bbb'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-ccc'));
    const result = checkConcurrentAgentCap({}, tmpDir);
    assert.strictEqual(result.pass, true, 'Exactly at cap should be allowed (not exceeded)');
  });

  it('blocks spawn when active worktrees exceed cap', async () => {
    // Create 4 worktrees, cap is 3
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-aaa'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-bbb'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-ccc'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-ddd'));
    const result = checkConcurrentAgentCap({}, tmpDir);
    assert.strictEqual(result.pass, false, '4 active worktrees > cap of 3 should be blocked');
    assert.strictEqual(result.result, 'block');
    assert.ok(
      result.message.includes('CONCURRENT-AGENT-CAP'),
      'Message should reference CONCURRENT-AGENT-CAP'
    );
  });

  it('warns (not blocks) when enforcement is warn', async () => {
    process.env.CONCURRENT_AGENT_CAP_ENFORCEMENT = 'warn';
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-aaa'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-bbb'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-ccc'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-ddd'));
    const result = checkConcurrentAgentCap({}, tmpDir);
    assert.strictEqual(result.pass, true, 'warn mode should pass');
    assert.strictEqual(result.result, 'warn');
  });

  it('allows everything when enforcement is off', async () => {
    process.env.CONCURRENT_AGENT_CAP_ENFORCEMENT = 'off';
    for (let i = 0; i < 10; i++) {
      fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', `agent-${i}`));
    }
    const result = checkConcurrentAgentCap({}, tmpDir);
    assert.strictEqual(result.pass, true, 'off mode should allow even 10 agents');
  });

  it('allows spawn when no .claude/worktrees directory exists', async () => {
    // tmpDir has no worktrees created
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-empty-'));
    try {
      const result = checkConcurrentAgentCap({}, emptyRoot);
      assert.strictEqual(result.pass, true, 'Missing worktrees dir should be treated as 0 agents');
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it('uses cap from CONCURRENT_AGENT_CAP env var', async () => {
    process.env.CONCURRENT_AGENT_CAP = '2';
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-aaa'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-bbb'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-ccc'));
    // 3 worktrees, cap is 2 → blocked
    const result = checkConcurrentAgentCap({}, tmpDir);
    assert.strictEqual(result.pass, false, 'Should respect custom cap of 2');
  });

  it('includes active count and cap in error message', async () => {
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-aaa'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-bbb'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-ccc'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'worktrees', 'agent-ddd'));
    const result = checkConcurrentAgentCap({}, tmpDir);
    assert.ok(result.message.includes('4'), 'Message should include active count (4)');
    assert.ok(result.message.includes('3'), 'Message should include cap (3)');
  });
});
