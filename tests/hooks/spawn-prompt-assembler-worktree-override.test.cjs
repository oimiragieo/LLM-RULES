'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

// The function under test will be exported from spawn-prompt-assembler.task-tools.cjs
// It does not exist yet — this is the TDD Red phase.
// Signature: shouldOverrideWorktreeIsolation(prompt: string, agentType: string) => boolean
//
// Returns true when:
//   1. agentType is 'developer' (only developer has the worktree problem), AND
//   2. prompt mentions any framework path (.claude/hooks/, .claude/skills/, etc.)
//
// Framework paths that trigger override:
//   .claude/hooks/     .claude/skills/     .claude/agents/
//   .claude/tools/     .claude/workflows/  .claude/templates/
//   .claude/schemas/   .claude/lib/

const {
  shouldOverrideWorktreeIsolation,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.task-tools.cjs');

// ---------------------------------------------------------------------------
// 1. Framework path detection — each path triggers override for developer
// ---------------------------------------------------------------------------

describe('shouldOverrideWorktreeIsolation — framework path detection', () => {
  test('returns true when prompt mentions .claude/hooks/ for developer agent', () => {
    const prompt = 'Fix the routing-guard in .claude/hooks/routing/routing-guard.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('returns true when prompt mentions .claude/skills/ for developer agent', () => {
    const prompt = 'Update the TDD skill at .claude/skills/tdd/SKILL.md';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('returns true when prompt mentions .claude/agents/ for developer agent', () => {
    const prompt = 'Modify the QA agent definition in .claude/agents/core/qa.md';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('returns true when prompt mentions .claude/tools/ for developer agent', () => {
    const prompt = 'Add a new CLI utility to .claude/tools/cli/new-tool.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('returns true when prompt mentions .claude/workflows/ for developer agent', () => {
    const prompt =
      'Update the enterprise workflow at .claude/workflows/core/enterprise-workflow.md';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('returns true when prompt mentions .claude/templates/ for developer agent', () => {
    const prompt = 'Fix the spawn template in .claude/templates/spawn/universal-agent-spawn.md';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('returns true when prompt mentions .claude/schemas/ for developer agent', () => {
    const prompt = 'Validate the schema at .claude/schemas/agent-schema.json';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('returns true when prompt mentions .claude/lib/ for developer agent', () => {
    const prompt = 'Refactor memory-manager at .claude/lib/memory/memory-manager.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });
});

// ---------------------------------------------------------------------------
// 2. Non-framework paths — should NOT trigger override
// ---------------------------------------------------------------------------

describe('shouldOverrideWorktreeIsolation — non-framework paths', () => {
  test('returns false when prompt mentions src/ (non-framework) for developer', () => {
    const prompt = 'Implement the user login feature in src/auth/login.ts';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), false);
  });

  test('returns false when prompt mentions lib/ without .claude prefix for developer', () => {
    const prompt = 'Fix the utility function in lib/utils/helpers.js';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), false);
  });

  test('returns false when prompt mentions tests/ path for developer', () => {
    const prompt = 'Add unit tests for the payment module in tests/payment.test.ts';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), false);
  });

  test('returns false when prompt has no file paths for developer', () => {
    const prompt = 'Implement a new authentication feature with JWT tokens';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), false);
  });
});

// ---------------------------------------------------------------------------
// 3. Agent type gating — only developer should trigger override
// ---------------------------------------------------------------------------

describe('shouldOverrideWorktreeIsolation — agent type gating', () => {
  test('returns false for qa agent even with framework path', () => {
    const prompt = 'Run tests for .claude/hooks/routing/routing-guard.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'qa'), false);
  });

  test('returns false for code-reviewer agent even with framework path', () => {
    const prompt = 'Review changes in .claude/skills/tdd/SKILL.md';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'code-reviewer'), false);
  });

  test('returns false for architect agent even with framework path', () => {
    const prompt = 'Analyze architecture of .claude/lib/routing/routing-table.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'architect'), false);
  });

  test('returns false for devops agent even with framework path', () => {
    const prompt = 'Deploy changes to .claude/hooks/safety/unified-pre-write-hook.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'devops'), false);
  });
});

// ---------------------------------------------------------------------------
// 4. Mixed paths — conservative: should override if ANY framework path present
// ---------------------------------------------------------------------------

describe('shouldOverrideWorktreeIsolation — mixed path scenarios', () => {
  test('returns true when prompt has both framework and non-framework paths', () => {
    const prompt =
      'Update the hook at .claude/hooks/routing/guard.cjs and the util at src/utils/helper.ts';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('returns true when prompt mentions multiple framework paths', () => {
    const prompt = 'Fix .claude/skills/tdd/SKILL.md and update .claude/agents/core/developer.md';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases and robustness
// ---------------------------------------------------------------------------

describe('shouldOverrideWorktreeIsolation — edge cases', () => {
  test('returns false for empty prompt', () => {
    assert.strictEqual(shouldOverrideWorktreeIsolation('', 'developer'), false);
  });

  test('returns false for null/undefined prompt', () => {
    assert.strictEqual(shouldOverrideWorktreeIsolation(null, 'developer'), false);
    assert.strictEqual(shouldOverrideWorktreeIsolation(undefined, 'developer'), false);
  });

  test('returns false for null/undefined agentType', () => {
    const prompt = 'Fix .claude/hooks/routing/guard.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, null), false);
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, undefined), false);
  });

  test('returns false for empty agentType', () => {
    const prompt = 'Fix .claude/hooks/routing/guard.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, ''), false);
  });

  test('handles Windows backslash paths in prompt', () => {
    const prompt = 'Fix the hook at .claude\\hooks\\routing\\guard.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), true);
  });

  test('handles case-insensitive agent type matching', () => {
    const prompt = 'Fix .claude/hooks/routing/guard.cjs';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'Developer'), true);
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'DEVELOPER'), true);
  });

  test('does not false-positive on .claude/context/ path (not a framework artifact)', () => {
    const prompt = 'Read the report at .claude/context/reports/qa/report.md';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), false);
  });

  test('does not false-positive on .claude/CLAUDE.md (doc, not framework artifact dir)', () => {
    const prompt = 'Read .claude/CLAUDE.md for routing instructions';
    assert.strictEqual(shouldOverrideWorktreeIsolation(prompt, 'developer'), false);
  });
});
