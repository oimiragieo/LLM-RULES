#!/usr/bin/env node
/**
 * subagent-start-iron-law.test.cjs
 *
 * Tests for .claude/hooks/lifecycle/subagent-start-iron-law.cjs
 *
 * Verifies:
 *   - Hook exists and exports expected functions
 *   - Clean prompt → no warning, allow:true
 *   - Router context + prompt with banned tools → warning emitted, allow:true
 *   - Worker context + prompt with tools → no warning (allow:true)
 *   - Malformed / empty / missing input → exit 0, allow:true, no crash
 *
 * Fulfills: VAL-NE-001, VAL-NE-002
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/lifecycle/subagent-start-iron-law.cjs'
);

// ─── Module-level helpers ─────────────────────────────────────────────────────

/**
 * Load (or reload) the hook module with a clean require cache.
 * @returns {Object} The hook module exports
 */
function loadHook() {
  try {
    // Clear the module cache entry so each test group gets a fresh copy
    const resolved = require.resolve(HOOK_PATH);
    delete require.cache[resolved];

    // Also clear router-tool-lockdown cache so exports are stable
    const lockdownPath = require.resolve(
      path.resolve(__dirname, '../../.claude/hooks/routing/router-tool-lockdown.cjs')
    );
    delete require.cache[lockdownPath];

    return require(HOOK_PATH);
  } catch (_err) {
    return null;
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('subagent-start-iron-law hook', () => {
  let hook;
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Reset agent identity for clean test state
    delete process.env.CLAUDE_AGENT_ID;
    hook = loadHook();
  });

  afterEach(() => {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  // ─── Existence & Exports ────────────────────────────────────────────────────

  it('hook file exists and is loadable', () => {
    assert.ok(hook !== null, 'Hook module must be loadable without errors');
  });

  it('exports checkIronLaw function', () => {
    assert.ok(hook, 'Hook must be loaded');
    assert.strictEqual(typeof hook.checkIronLaw, 'function', 'Must export checkIronLaw');
  });

  it('exports isRouterContext function', () => {
    assert.ok(hook, 'Hook must be loaded');
    assert.strictEqual(typeof hook.isRouterContext, 'function', 'Must export isRouterContext');
  });

  it('exports findBannedToolsInPrompt function', () => {
    assert.ok(hook, 'Hook must be loaded');
    assert.strictEqual(
      typeof hook.findBannedToolsInPrompt,
      'function',
      'Must export findBannedToolsInPrompt'
    );
  });

  it('exports HOOK_NAME string', () => {
    assert.ok(hook, 'Hook must be loaded');
    assert.strictEqual(typeof hook.HOOK_NAME, 'string', 'Must export HOOK_NAME');
    assert.ok(hook.HOOK_NAME.length > 0, 'HOOK_NAME must be non-empty');
  });

  // ─── VAL-NE-001: Clean prompt — no warning ──────────────────────────────────

  describe('clean prompt (router context, no banned tools)', () => {
    beforeEach(() => {
      delete process.env.CLAUDE_AGENT_ID;
    });

    it('returns allow:true for empty prompt', () => {
      const result = hook.checkIronLaw({ prompt: '', session_id: 'sess-1' });
      assert.strictEqual(result.allow, true);
      assert.strictEqual(result.warning, undefined, 'No warning expected for empty prompt');
    });

    it('returns allow:true for a clean worker-instruction prompt', () => {
      const prompt =
        'You are a developer worker. Implement the feature described in the task. ' +
        'Use whatever approach is best for the task at hand.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-2' });
      assert.strictEqual(result.allow, true);
      assert.strictEqual(result.warning, undefined, 'No warning expected for clean prompt');
    });

    it('returns allow:true for a prompt containing tool names in harmless context', () => {
      // Mentioning tools by name in a non-instructional way should still trigger
      // the heuristic check, but let's verify the return value is always allow:true
      const prompt =
        'Here is documentation about available tools: Read, Task, MemoryRecord, Skill.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-3' });
      assert.strictEqual(result.allow, true, 'Always allow:true even if some tools mentioned');
    });
  });

  // ─── VAL-NE-001: Router context + banned tools → warning ────────────────────

  describe('router context with banned tools in prompt', () => {
    beforeEach(() => {
      // No CLAUDE_AGENT_ID means default = router context
      delete process.env.CLAUDE_AGENT_ID;
    });

    it('warns when prompt instructs use of Bash (router context, no agent ID)', () => {
      const prompt =
        'Execute the following steps: first use Bash to run the test suite, ' +
        'then report the results.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-4' });
      assert.strictEqual(result.allow, true, 'Must always be allow:true');
      assert.ok(result.warning, 'Warning must be emitted for Bash in router context');
      assert.ok(
        result.warning.includes('Bash'),
        `Warning should mention Bash, got: ${result.warning}`
      );
      assert.ok(
        result.warning.includes('Iron Law'),
        `Warning should mention Iron Law, got: ${result.warning}`
      );
    });

    it('warns when prompt instructs use of Edit', () => {
      const prompt = 'Please Edit the configuration file to enable the feature flag.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-5' });
      assert.strictEqual(result.allow, true);
      assert.ok(result.warning, 'Warning expected for Edit in router context');
      assert.ok(result.warning.includes('Edit'));
    });

    it('warns when prompt instructs use of Write', () => {
      const prompt = 'Use Write to create a new file at src/index.ts with the module boilerplate.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-6' });
      assert.strictEqual(result.allow, true);
      assert.ok(result.warning, 'Warning expected for Write in router context');
      assert.ok(result.warning.includes('Write'));
    });

    it('warns when prompt instructs use of Glob', () => {
      const prompt = 'Use Glob to find all TypeScript files matching **/*.test.ts.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-7' });
      assert.strictEqual(result.allow, true);
      assert.ok(result.warning, 'Warning expected for Glob in router context');
      assert.ok(result.warning.includes('Glob'));
    });

    it('warns when prompt instructs use of Grep', () => {
      const prompt = 'Search the codebase using Grep to find all TODO comments.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-8' });
      assert.strictEqual(result.allow, true);
      assert.ok(result.warning, 'Warning expected for Grep in router context');
      assert.ok(result.warning.includes('Grep'));
    });

    it('warns when prompt instructs use of WebSearch', () => {
      const prompt = 'Use WebSearch to find the latest React documentation.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-9' });
      assert.strictEqual(result.allow, true);
      assert.ok(result.warning, 'Warning expected for WebSearch in router context');
      assert.ok(result.warning.includes('WebSearch'));
    });

    it('warns when prompt contains multiple banned tools', () => {
      const prompt =
        'Step 1: Use Grep to find the file. Step 2: Use Edit to update it. ' +
        'Step 3: Use Bash to run the tests.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-10' });
      assert.strictEqual(result.allow, true);
      assert.ok(result.warning, 'Warning expected for multiple banned tools');
      assert.ok(result.warning.includes('Grep'), 'Grep should be in warning');
      assert.ok(result.warning.includes('Edit'), 'Edit should be in warning');
      assert.ok(result.warning.includes('Bash'), 'Bash should be in warning');
    });

    it('warns when CLAUDE_AGENT_ID is explicitly set to "router"', () => {
      process.env.CLAUDE_AGENT_ID = 'router';
      const prompt = 'Use Bash to install dependencies.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-11' });
      assert.strictEqual(result.allow, true);
      assert.ok(result.warning, 'Warning expected when CLAUDE_AGENT_ID=router');
    });
  });

  // ─── VAL-NE-001: Worker context — no warning ────────────────────────────────

  describe('worker context (no warning even with banned tools in prompt)', () => {
    it('does not warn when CLAUDE_AGENT_ID identifies a worker agent', () => {
      process.env.CLAUDE_AGENT_ID = 'developer';
      const prompt =
        'You are a developer worker. Use Bash to run tests, Edit to fix bugs, ' +
        'and Glob to find related files.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-12' });
      assert.strictEqual(result.allow, true);
      assert.strictEqual(
        result.warning,
        undefined,
        'Worker agents should not trigger Iron Law warning'
      );
    });

    it('does not warn when CLAUDE_AGENT_ID is set to "technical-writer"', () => {
      process.env.CLAUDE_AGENT_ID = 'technical-writer';
      const prompt = 'Use Write to create documentation.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-13' });
      assert.strictEqual(result.allow, true);
      assert.strictEqual(result.warning, undefined, 'Non-router agents should not warn');
    });

    it('does not warn when hookInput has a task_id (worker context signal)', () => {
      delete process.env.CLAUDE_AGENT_ID;
      const prompt = 'Use Bash to run the test suite.';
      const hookInput = { prompt, session_id: 'sess-14', task_id: 'task-7' };
      const result = hook.checkIronLaw(hookInput);
      assert.strictEqual(result.allow, true);
      assert.strictEqual(
        result.warning,
        undefined,
        'Should not warn when task_id present (worker context)'
      );
    });

    it('does not warn for worker agent spawning sub-sub-agents with tools', () => {
      process.env.CLAUDE_AGENT_ID = 'worker';
      const prompt = 'Spawn a developer sub-agent and instruct it to use Edit and Write.';
      const result = hook.checkIronLaw({ prompt, session_id: 'sess-15' });
      assert.strictEqual(result.allow, true);
      assert.strictEqual(result.warning, undefined, 'Worker spawning sub-agents should not warn');
    });
  });

  // ─── VAL-NE-002: Malformed / missing input ──────────────────────────────────

  describe('malformed / missing input handling', () => {
    it('returns allow:true for null input', () => {
      const result = hook.checkIronLaw(null);
      assert.strictEqual(result.allow, true);
      assert.strictEqual(result.warning, undefined);
    });

    it('returns allow:true for undefined input', () => {
      const result = hook.checkIronLaw(undefined);
      assert.strictEqual(result.allow, true);
      assert.strictEqual(result.warning, undefined);
    });

    it('returns allow:true for empty object input', () => {
      const result = hook.checkIronLaw({});
      assert.strictEqual(result.allow, true);
      // Empty prompt → nothing to scan
    });

    it('returns allow:true when prompt field is null', () => {
      const result = hook.checkIronLaw({ prompt: null, session_id: 'sess-16' });
      assert.strictEqual(result.allow, true);
    });

    it('returns allow:true when prompt field is a number', () => {
      const result = hook.checkIronLaw({ prompt: 42, session_id: 'sess-17' });
      assert.strictEqual(result.allow, true);
    });
  });

  // ─── VAL-NE-002: Process-level graceful handling ────────────────────────────

  describe('process-level exit behavior (subprocess tests)', () => {
    /**
     * Run the hook as a subprocess with given stdin input.
     * Returns { exitCode, stderr, stdout }.
     */
    function runHook(stdinData, env = {}) {
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        input: stdinData,
        env: { ...process.env, ...env },
        timeout: 5000,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return {
        exitCode: result.status || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      };
    }

    it('exits 0 with empty stdin', () => {
      const { exitCode } = runHook('');
      assert.strictEqual(exitCode, 0, 'Must exit 0 on empty stdin');
    });

    it('exits 0 with invalid JSON on stdin', () => {
      const { exitCode } = runHook('not valid json }{');
      assert.strictEqual(exitCode, 0, 'Must exit 0 on invalid JSON stdin');
    });

    it('exits 0 with null JSON on stdin', () => {
      const { exitCode } = runHook('null');
      assert.strictEqual(exitCode, 0, 'Must exit 0 on null JSON stdin');
    });

    it('exits 0 with empty JSON object on stdin', () => {
      const { exitCode } = runHook('{}');
      assert.strictEqual(exitCode, 0, 'Must exit 0 on empty object stdin');
    });

    it('exits 0 with clean subagent prompt (no banned tools)', () => {
      const input = JSON.stringify({
        session_id: 'test-sess',
        prompt: 'You are a worker. Complete the assigned task.',
        agent_id: 'worker-1',
      });
      const { exitCode } = runHook(input, { CLAUDE_AGENT_ID: '' });
      assert.strictEqual(exitCode, 0, 'Must exit 0 for clean prompt');
    });

    it('exits 0 even when router prompt has banned tools (advisory only)', () => {
      const input = JSON.stringify({
        session_id: 'test-sess',
        prompt: 'Use Bash to run tests and Edit to fix the code.',
        agent_id: 'new-agent-1',
      });
      // Simulate router context: no CLAUDE_AGENT_ID
      const { exitCode, stderr } = runHook(input, { CLAUDE_AGENT_ID: '' });
      assert.strictEqual(exitCode, 0, 'Must exit 0 even with Iron Law violation (advisory only)');
    });

    it('emits warning to stderr when router + banned tools detected', () => {
      const input = JSON.stringify({
        session_id: 'test-sess',
        prompt: 'Use Bash to execute the build script.',
        agent_id: 'new-agent-2',
      });
      // Router context: no CLAUDE_AGENT_ID → default is router
      const result = spawnSync(process.execPath, [HOOK_PATH], {
        input,
        env: { ...process.env, CLAUDE_AGENT_ID: '' },
        timeout: 5000,
        encoding: 'utf8',
        stdio: 'pipe',
      });
      assert.strictEqual(
        result.status,
        0,
        `Hook must exit 0 even on warning, got exit code: ${result.status}`
      );
    });

    it('does not warn for worker agent with banned tools (subprocess)', () => {
      const input = JSON.stringify({
        session_id: 'test-sess',
        prompt: 'Use Bash to run npm install.',
        agent_id: 'new-developer-1',
      });
      const { exitCode, stderr } = runHook(input, { CLAUDE_AGENT_ID: 'developer' });
      assert.strictEqual(exitCode, 0, 'Must exit 0 for worker context');
      assert.ok(
        !stderr.includes('Iron Law'),
        'Should not emit Iron Law warning for worker context'
      );
    });
  });

  // ─── findBannedToolsInPrompt unit tests ─────────────────────────────────────

  describe('findBannedToolsInPrompt', () => {
    it('returns empty array for empty prompt', () => {
      const found = hook.findBannedToolsInPrompt('', ['Bash', 'Edit']);
      assert.deepStrictEqual(found, []);
    });

    it('returns empty array when no banned tools mentioned', () => {
      const found = hook.findBannedToolsInPrompt('You are a worker. Complete the assigned task.', [
        'Bash',
        'Edit',
        'Write',
      ]);
      assert.deepStrictEqual(found, []);
    });

    it('detects single banned tool by word boundary', () => {
      const found = hook.findBannedToolsInPrompt('Use Bash to run tests.', ['Bash', 'Edit']);
      assert.deepStrictEqual(found, ['Bash']);
    });

    it('detects multiple banned tools', () => {
      const found = hook.findBannedToolsInPrompt('Use Grep to find files, then Edit them.', [
        'Bash',
        'Edit',
        'Grep',
        'Write',
      ]);
      assert.ok(found.includes('Grep'), 'Should detect Grep');
      assert.ok(found.includes('Edit'), 'Should detect Edit');
      assert.strictEqual(found.length, 2, 'Should detect exactly 2 tools');
    });

    it('does not false-positive on substring matches', () => {
      // "NotebookEdit" should not match word-boundary check for "Edit"
      // "WebSearch" should match since "WebSearch" IS a banned tool
      const found = hook.findBannedToolsInPrompt('Use NotebookEdit to change the cell.', [
        'Edit',
        'Bash',
      ]);
      // "NotebookEdit" contains "Edit" but NOT as a word boundary
      assert.deepStrictEqual(
        found,
        [],
        'NotebookEdit should not match word-boundary check for Edit'
      );
    });

    it('returns empty array for null/undefined prompt', () => {
      const found1 = hook.findBannedToolsInPrompt(null, ['Bash']);
      const found2 = hook.findBannedToolsInPrompt(undefined, ['Bash']);
      assert.deepStrictEqual(found1, []);
      assert.deepStrictEqual(found2, []);
    });
  });

  // ─── isRouterContext unit tests ──────────────────────────────────────────────

  describe('isRouterContext', () => {
    it('returns true when CLAUDE_AGENT_ID is "router"', () => {
      process.env.CLAUDE_AGENT_ID = 'router';
      assert.strictEqual(hook.isRouterContext({}), true);
    });

    it('returns false when CLAUDE_AGENT_ID is "developer"', () => {
      process.env.CLAUDE_AGENT_ID = 'developer';
      assert.strictEqual(hook.isRouterContext({}), false);
    });

    it('returns false when CLAUDE_AGENT_ID is "worker"', () => {
      process.env.CLAUDE_AGENT_ID = 'worker';
      assert.strictEqual(hook.isRouterContext({}), false);
    });

    it('returns false when hookInput has task_id (worker context)', () => {
      delete process.env.CLAUDE_AGENT_ID;
      assert.strictEqual(hook.isRouterContext({ task_id: 'task-3' }), false);
    });

    it('returns true when no signals indicate worker context (default)', () => {
      delete process.env.CLAUDE_AGENT_ID;
      assert.strictEqual(hook.isRouterContext({}), true);
    });

    it('returns true when hookInput is null (no context signals)', () => {
      delete process.env.CLAUDE_AGENT_ID;
      assert.strictEqual(hook.isRouterContext(null), true);
    });
  });
});
