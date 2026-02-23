#!/usr/bin/env node
/**
 * routing-guard-core-helpers.test.cjs
 *
 * Tests for routing-guard-core.helpers.cjs — specifically hasExplicitAgentContext
 * with the worktree CWD detection added by Fix 2.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('routing-guard-core helpers — hasExplicitAgentContext', () => {
  let hasExplicitAgentContext;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.CLAUDE_AGENT_ID;

    // Fresh module load for each test to reset any cached state
    const modPath = require.resolve('../../.claude/hooks/routing/routing-guard-core.helpers.cjs');
    delete require.cache[modPath];
    hasExplicitAgentContext =
      require('../../.claude/hooks/routing/routing-guard-core.helpers.cjs').hasExplicitAgentContext;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  // ── Existing behaviour (should not regress) ─────────────────────────────────

  it('returns false with empty hookInput and no env context', () => {
    assert.strictEqual(hasExplicitAgentContext({}), false);
  });

  it('returns true when task_id is present in hookInput', () => {
    assert.strictEqual(hasExplicitAgentContext({ task_id: 'task-5' }), true);
  });

  it('returns true when taskId (camelCase) is present in hookInput', () => {
    assert.strictEqual(hasExplicitAgentContext({ taskId: 'task-5' }), true);
  });

  it('returns true when CLAUDE_AGENT_ID is set to a non-router value', () => {
    process.env.CLAUDE_AGENT_ID = 'developer';
    assert.strictEqual(hasExplicitAgentContext({}), true);
  });

  it('returns false when CLAUDE_AGENT_ID is "router"', () => {
    process.env.CLAUDE_AGENT_ID = 'router';
    assert.strictEqual(hasExplicitAgentContext({}), false);
  });

  it('returns false with null hookInput', () => {
    assert.strictEqual(hasExplicitAgentContext(null), false);
  });

  it('returns false with undefined hookInput', () => {
    assert.strictEqual(hasExplicitAgentContext(undefined), false);
  });

  // ── Fix 2: Worktree CWD bypass ──────────────────────────────────────────────

  it('returns true when CWD is in a depth-1 worktree (Fix 2)', () => {
    const worktreeCwd = '/project/.claude/worktrees/agent-abc123';
    assert.strictEqual(
      hasExplicitAgentContext({}, worktreeCwd),
      true,
      'Depth-1 worktree CWD should imply explicit agent context'
    );
  });

  it('returns true when CWD is in a depth-2 nested worktree (Fix 2)', () => {
    const nestedCwd = '/project/.claude/worktrees/outer/.claude/worktrees/inner';
    assert.strictEqual(
      hasExplicitAgentContext({}, nestedCwd),
      true,
      'Depth-2 nested worktree should also bypass TASKLIST-FIRST'
    );
  });

  it('returns false when CWD is not in a worktree and no other context (Fix 2)', () => {
    delete process.env.CLAUDE_AGENT_ID;
    assert.strictEqual(
      hasExplicitAgentContext({}, '/project'),
      false,
      'Non-worktree CWD without task_id or agent ID should return false'
    );
  });

  it('handles Windows backslash worktree paths (SE-01, Fix 2)', () => {
    const winCwd = 'C:\\dev\\projects\\.claude\\worktrees\\agent-abc';
    assert.strictEqual(
      hasExplicitAgentContext({}, winCwd),
      true,
      'Windows worktree path should bypass TASKLIST-FIRST'
    );
  });

  it('worktree CWD bypass works even in block enforcement mode', () => {
    process.env.TASKLIST_FIRST_ENFORCEMENT = 'block';
    const worktreeCwd = '/project/.claude/worktrees/agent-abc123';
    assert.strictEqual(
      hasExplicitAgentContext({}, worktreeCwd),
      true,
      'Worktree bypass should work regardless of enforcement mode'
    );
  });

  it('task_id still takes precedence (both task_id and non-worktree CWD)', () => {
    // Even without worktree CWD, task_id alone should be enough
    assert.strictEqual(hasExplicitAgentContext({ task_id: 'task-1' }, '/project'), true);
  });
});
