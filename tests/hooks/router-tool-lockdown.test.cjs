#!/usr/bin/env node
/**
 * router-tool-lockdown.test.cjs
 *
 * Tests for router-tool-lockdown.cjs PreToolUse hook.
 * Validates that the router is blocked from using banned tools,
 * while sub-agents can use all tools freely.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

describe('router-tool-lockdown hook', () => {
  let checkRouterToolLockdown;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Default: warn mode for tests
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'warn';
    // Ensure we are in router mode (no agent ID)
    delete process.env.CLAUDE_AGENT_ID;

    try {
      // Clear module cache to get fresh state
      const modPath = require.resolve('../../.claude/hooks/routing/router-tool-lockdown.cjs');
      delete require.cache[modPath];
      checkRouterToolLockdown =
        require('../../.claude/hooks/routing/router-tool-lockdown.cjs').checkRouterToolLockdown;
    } catch (_err) {
      checkRouterToolLockdown = null;
    }
  });

  afterEach(() => {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it('should export checkRouterToolLockdown function', () => {
    assert.ok(checkRouterToolLockdown, 'Module should export checkRouterToolLockdown');
    assert.strictEqual(typeof checkRouterToolLockdown, 'function');
  });

  it('should warn when router calls Bash', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'warn';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Bash', { command: 'pnpm test' }, {});
    assert.strictEqual(result.pass, true, 'warn mode should pass (not block)');
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message.includes('ROUTER-LOCKDOWN'), 'Message should contain ROUTER-LOCKDOWN');
    assert.ok(result.message.includes('Bash'), 'Message should mention the banned tool');
  });

  it('should block when router calls Bash in block mode', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Bash', { command: 'pnpm test' }, {});
    assert.strictEqual(result.pass, false, 'block mode should block');
    assert.strictEqual(result.result, 'block');
    assert.ok(result.message.includes('ROUTER-LOCKDOWN'));
  });

  it('should allow sub-agent to call Bash (CLAUDE_AGENT_ID set)', () => {
    process.env.CLAUDE_AGENT_ID = 'developer';
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    const result = checkRouterToolLockdown('Bash', { command: 'pnpm test' }, {});
    assert.strictEqual(result.pass, true, 'Sub-agents should be allowed');
    assert.strictEqual(result.result, undefined);
  });

  it('should allow sub-agent with task_id in hookInput', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const hookInput = { task_id: 'task-5' };
    const result = checkRouterToolLockdown('Bash', { command: 'pnpm test' }, hookInput);
    assert.strictEqual(result.pass, true, 'Should allow when task_id present');
  });

  it('should allow router to call TaskList (whitelisted)', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('TaskList', {}, {});
    assert.strictEqual(result.pass, true, 'Whitelisted tools should pass');
  });

  it('should allow router to call Read (whitelisted)', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Read', {}, {});
    assert.strictEqual(result.pass, true, 'Read should be whitelisted');
  });

  it('should allow router to call Task (whitelisted)', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Task', {}, {});
    assert.strictEqual(result.pass, true, 'Task should be whitelisted');
  });

  it('should warn/block on Edit in router mode', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'warn';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown(
      'Edit',
      { file_path: 'src/foo.js', old_string: 'a', new_string: 'b' },
      {}
    );
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message.includes('Edit'));
  });

  it('should warn/block on Write in router mode', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'warn';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Write', { file_path: 'src/foo.js' }, {});
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message.includes('Write'));
  });

  it('should warn/block on Glob in router mode', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'warn';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Glob', { pattern: '**/*.js' }, {});
    assert.strictEqual(result.result, 'warn');
  });

  it('should warn/block on Grep in router mode', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'warn';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Grep', { pattern: 'foo' }, {});
    assert.strictEqual(result.result, 'warn');
  });

  it('should warn/block on WebSearch in router mode', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'warn';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('WebSearch', { query: 'test' }, {});
    assert.strictEqual(result.result, 'warn');
  });

  it('should warn/block on WebFetch in router mode', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'warn';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('WebFetch', { url: 'https://example.com' }, {});
    assert.strictEqual(result.result, 'warn');
  });

  it('should allow when enforcement is off', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'off';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Bash', { command: 'rm -rf /' }, {});
    assert.strictEqual(result.pass, true, 'Should allow when enforcement is off');
  });

  it('should allow router to use whitelisted Bash commands (git status)', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Bash', { command: 'git status -s' }, {});
    assert.strictEqual(result.pass, true, 'git status -s is whitelisted for router');
  });

  it('should allow router to use whitelisted Bash commands (git log)', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Bash', { command: 'git log --oneline -5' }, {});
    assert.strictEqual(result.pass, true, 'git log --oneline -N is whitelisted for router');
  });

  it('should include spawn suggestion in block message', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('Bash', { command: 'pnpm test' }, {});
    assert.ok(
      result.message.includes('Task('),
      'Message should suggest using Task() to spawn an agent'
    );
  });

  it('should handle unknown tool gracefully (pass through)', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('SomeUnknownTool', {}, {});
    // Unknown tools that are not in banned or whitelisted list should pass
    assert.strictEqual(result.pass, true);
  });

  it('should block NotebookEdit in router mode', () => {
    process.env.ROUTER_TOOL_LOCKDOWN_ENFORCEMENT = 'block';
    delete process.env.CLAUDE_AGENT_ID;
    const result = checkRouterToolLockdown('NotebookEdit', {}, {});
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.result, 'block');
  });
});
