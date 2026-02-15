#!/usr/bin/env node
/* eslint-disable max-lines */
/**
 * Routing Guard Tests
 * ====================
 *
 * TDD tests for the consolidated routing-guard.cjs module.
 * Tests cover all 5 original hooks' functionality:
 * - router-self-check
 * - planner-first-guard
 * - task-create-guard
 * - security-review-guard
 * - router-write-guard
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'routing-guard.cjs');

// The module we're testing
let routingGuard;
let routerState;
try {
  routingGuard = require('../../.claude/hooks/routing/routing-guard.cjs');
  routerState = require('../../.claude/lib/routing/router-state.cjs');
} catch (_err) {
  routingGuard = null;
  routerState = null;
}

describe('routing-guard', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
    // PERF-001: Invalidate cached state between tests
    if (routingGuard && routingGuard.invalidateCachedState) {
      routingGuard.invalidateCachedState();
    }
  });

  describe('module exports', () => {
    it('should export main function', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.strictEqual(typeof routingGuard.main, 'function');
    });

    it('should export runAllChecks function', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.strictEqual(typeof routingGuard.runAllChecks, 'function');
    });

    it('should export individual check functions', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.strictEqual(typeof routingGuard.checkRouterSelfCheck, 'function');
      assert.strictEqual(typeof routingGuard.checkPlannerFirst, 'function');
      assert.strictEqual(typeof routingGuard.checkTaskCreate, 'function');
      assert.strictEqual(typeof routingGuard.checkSecurityReview, 'function');
      assert.strictEqual(typeof routingGuard.checkRouterWrite, 'function');
    });

    it('should export helper functions', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.strictEqual(typeof routingGuard.isPlannerSpawn, 'function');
      assert.strictEqual(typeof routingGuard.isSecuritySpawn, 'function');
      assert.strictEqual(typeof routingGuard.isImplementationAgentSpawn, 'function');
      assert.strictEqual(typeof routingGuard.isAlwaysAllowedWrite, 'function');
    });

    it('should export constants', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(Array.isArray(routingGuard.ALL_WATCHED_TOOLS));
      assert.ok(Array.isArray(routingGuard.BLACKLISTED_TOOLS));
      assert.ok(Array.isArray(routingGuard.WHITELISTED_TOOLS));
      assert.ok(Array.isArray(routingGuard.WRITE_TOOLS));
      assert.ok(Array.isArray(routingGuard.IMPLEMENTATION_AGENTS));
    });
  });

  describe('isPlannerSpawn', () => {
    it('should detect PLANNER in prompt', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isPlannerSpawn({
        prompt: 'You are PLANNER. Design the feature...',
        description: 'Design feature',
      });
      assert.strictEqual(result, true);
    });

    it('should detect planner in description', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isPlannerSpawn({
        prompt: 'Design the feature',
        description: 'Planner designing feature',
      });
      assert.strictEqual(result, true);
    });

    it('should return false for non-planner tasks', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isPlannerSpawn({
        prompt: 'You are DEVELOPER. Fix the bug...',
        description: 'Developer fixing bug',
      });
      assert.strictEqual(result, false);
    });
  });

  describe('isSecuritySpawn', () => {
    it('should detect SECURITY-ARCHITECT in prompt', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isSecuritySpawn({
        prompt: 'You are SECURITY-ARCHITECT. Review the design...',
        description: 'Review design',
      });
      assert.strictEqual(result, true);
    });

    it('should detect security in description', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isSecuritySpawn({
        prompt: 'Review the design',
        description: 'Security reviewing design',
      });
      assert.strictEqual(result, true);
    });

    it('should return false for non-security tasks', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isSecuritySpawn({
        prompt: 'You are DEVELOPER. Fix the bug...',
        description: 'Developer fixing bug',
      });
      assert.strictEqual(result, false);
    });
  });

  describe('isImplementationAgentSpawn', () => {
    it('should detect developer agent', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isImplementationAgentSpawn({
        prompt: 'You are developer. Fix the bug...',
      });
      assert.strictEqual(result, true);
    });

    it('should detect qa agent', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isImplementationAgentSpawn({
        prompt: 'You are qa. Run the tests...',
      });
      assert.strictEqual(result, true);
    });

    it('should detect devops agent', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isImplementationAgentSpawn({
        prompt: 'You are devops. Deploy the service...',
      });
      assert.strictEqual(result, true);
    });

    it('should return false for non-implementation agents', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isImplementationAgentSpawn({
        prompt: 'You are PLANNER. Design the feature...',
      });
      assert.strictEqual(result, false);
    });
  });

  describe('isAlwaysAllowedWrite', () => {
    it('should allow runtime state files', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isAlwaysAllowedWrite(
        '/project/.claude/context/runtime/state.json'
      );
      assert.strictEqual(result, true);
    });

    it('should allow memory files', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isAlwaysAllowedWrite(
        '/project/.claude/context/memory/learnings.md'
      );
      assert.strictEqual(result, true);
    });

    it('should allow .gitkeep files', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isAlwaysAllowedWrite('/project/dir/.gitkeep');
      assert.strictEqual(result, true);
    });

    it('should return false for regular files', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.isAlwaysAllowedWrite('/project/src/index.js');
      assert.strictEqual(result, false);
    });

    it('should return false for null/undefined', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isAlwaysAllowedWrite(null), false);
      assert.strictEqual(routingGuard.isAlwaysAllowedWrite(undefined), false);
    });
  });

  describe('checkRouterSelfCheck', () => {
    it('should allow whitelisted tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkRouterSelfCheck('Read');
      assert.strictEqual(result.pass, true);
    });

    it('should allow non-blacklisted tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkRouterSelfCheck('Task');
      assert.strictEqual(result.pass, true);
    });

    it('should pass when enforcement is off', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      process.env.ROUTER_SELF_CHECK = 'off';
      const result = routingGuard.checkRouterSelfCheck('Glob');
      assert.strictEqual(result.pass, true);
    });

    // BUG FIX: checkRouterSelfCheck should allow writes to memory files
    // even when not in agent context (for spawned subagents)
    it('should allow Write to memory files even in router mode (FIX for reflection-agent bug)', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Explicitly set router mode (not agent mode)
      routerState.resetToRouterMode();
      routerState.invalidateStateCache(); // Ensure cache is cleared

      // Verify we're in router mode
      const state = routerState.getState();
      assert.strictEqual(state.mode, 'router', 'Should be in router mode');
      assert.strictEqual(state.taskSpawned, false, 'Task should not be spawned');

      // Now test: writes to memory files should STILL be allowed
      const result = routingGuard.checkRouterSelfCheck('Write', {
        file_path: '/project/.claude/context/memory/learnings.md',
      });
      assert.strictEqual(
        result.pass,
        true,
        'Memory file writes should be allowed even in router mode'
      );
    });

    it('should allow Edit to memory files even in router mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Explicitly set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      const result = routingGuard.checkRouterSelfCheck('Edit', {
        file_path: '/project/.claude/context/memory/decisions.md',
      });
      assert.strictEqual(
        result.pass,
        true,
        'Memory file edits should be allowed even in router mode'
      );
    });

    it('should allow Write to runtime files even in router mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Explicitly set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      const result = routingGuard.checkRouterSelfCheck('Write', {
        file_path: '/project/.claude/context/runtime/router-state.json',
      });
      assert.strictEqual(
        result.pass,
        true,
        'Runtime file writes should be allowed even in router mode'
      );
    });

    it('should still block Write to non-memory files in router mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Explicitly set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      // Ensure enforcement is on
      process.env.ROUTER_SELF_CHECK = 'block';

      const result = routingGuard.checkRouterSelfCheck('Write', {
        file_path: '/project/src/index.js',
      });
      // In router mode without agent context, regular file writes should be blocked
      assert.strictEqual(
        result.pass,
        false,
        'Non-memory file writes should be blocked in router mode'
      );
    });
  });

  describe('checkTaskCreate', () => {
    it('should pass for non-TaskCreate tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkTaskCreate('Task');
      assert.strictEqual(result.pass, true);
    });

    it('should pass when enforcement is off', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      process.env.PLANNER_FIRST_ENFORCEMENT = 'off';
      const result = routingGuard.checkTaskCreate('TaskCreate');
      assert.strictEqual(result.pass, true);
    });
  });

  describe('checkPlannerFirst', () => {
    it('should pass for non-Task tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkPlannerFirst('TaskCreate', {});
      assert.strictEqual(result.pass, true);
    });

    it('should pass when enforcement is off', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      process.env.PLANNER_FIRST_ENFORCEMENT = 'off';
      const result = routingGuard.checkPlannerFirst('Task', {
        prompt: 'You are developer...',
      });
      assert.strictEqual(result.pass, true);
    });

    it('should mark planner spawn correctly', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkPlannerFirst('Task', {
        prompt: 'You are PLANNER...',
      });
      assert.strictEqual(result.pass, true);
      // Note: markPlanner will only be true if planner is required
    });
  });

  describe('checkSecurityReview', () => {
    it('should pass for non-Task tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkSecurityReview('TaskCreate', {});
      assert.strictEqual(result.pass, true);
    });

    it('should pass when enforcement is off', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      process.env.SECURITY_REVIEW_ENFORCEMENT = 'off';
      const result = routingGuard.checkSecurityReview('Task', {
        prompt: 'You are developer...',
      });
      assert.strictEqual(result.pass, true);
    });

    it('should mark security spawn correctly', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkSecurityReview('Task', {
        prompt: 'You are SECURITY-ARCHITECT...',
      });
      assert.strictEqual(result.pass, true);
      // Note: markSecurity will only be true if security review is required
    });
  });

  describe('checkConfigModelValidator', () => {
    it('should allow default haiku mismatch when config source is complexity-default', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      process.env.CONFIG_MODEL_VALIDATOR = 'block';
      const result = routingGuard.checkConfigModelValidator('Task', {
        prompt: 'You are CONTROLLED. Validate memory behavior.',
        model: 'haiku',
      });

      assert.strictEqual(result.pass, true);
    });

    it('should warn/allow shorthand alias mismatches for assembler autocorrection', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      process.env.CONFIG_MODEL_VALIDATOR = 'block';
      const result = routingGuard.checkConfigModelValidator('Task', {
        prompt: 'You are CONTROLLED. Validate memory behavior.',
        model: 'opus',
      });

      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, 'warn');
    });
  });

  describe('checkRouterWrite', () => {
    it('should pass for non-write tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkRouterWrite('Read', {});
      assert.strictEqual(result.pass, true);
    });

    it('should pass when enforcement is off', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      process.env.ROUTER_WRITE_GUARD = 'off';
      const result = routingGuard.checkRouterWrite('Edit', {
        file_path: '/project/src/index.js',
      });
      assert.strictEqual(result.pass, true);
    });

    it('should pass for always-allowed files', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkRouterWrite('Write', {
        file_path: '/project/.claude/context/runtime/state.json',
      });
      assert.strictEqual(result.pass, true);
    });
  });

  describe('constants', () => {
    it('should have correct watched tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.ok(routingGuard.ALL_WATCHED_TOOLS.includes('Glob'));
      assert.ok(routingGuard.ALL_WATCHED_TOOLS.includes('Grep'));
      assert.ok(routingGuard.ALL_WATCHED_TOOLS.includes('Edit'));
      assert.ok(routingGuard.ALL_WATCHED_TOOLS.includes('Write'));
      assert.ok(routingGuard.ALL_WATCHED_TOOLS.includes('Task'));
      assert.ok(routingGuard.ALL_WATCHED_TOOLS.includes('TaskCreate'));
    });

    it('should have correct blacklisted tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.ok(routingGuard.BLACKLISTED_TOOLS.includes('Glob'));
      assert.ok(routingGuard.BLACKLISTED_TOOLS.includes('Grep'));
      assert.ok(routingGuard.BLACKLISTED_TOOLS.includes('Edit'));
      assert.ok(routingGuard.BLACKLISTED_TOOLS.includes('Write'));
      assert.ok(routingGuard.BLACKLISTED_TOOLS.includes('NotebookEdit'));
      assert.ok(routingGuard.BLACKLISTED_TOOLS.includes('WebSearch'));
    });

    it('should have correct whitelisted tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.ok(routingGuard.WHITELISTED_TOOLS.includes('TaskUpdate'));
      assert.ok(routingGuard.WHITELISTED_TOOLS.includes('TaskList'));
      assert.ok(routingGuard.WHITELISTED_TOOLS.includes('Read'));
    });

    it('should have correct implementation agents', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.ok(routingGuard.IMPLEMENTATION_AGENTS.includes('developer'));
      assert.ok(routingGuard.IMPLEMENTATION_AGENTS.includes('qa'));
      assert.ok(routingGuard.IMPLEMENTATION_AGENTS.includes('devops'));
    });

    it('should have Bash in watched tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.ok(routingGuard.ALL_WATCHED_TOOLS.includes('Bash'));
    });

    it('should have ROUTER_BASH_WHITELIST defined', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.ok(Array.isArray(routingGuard.ROUTER_BASH_WHITELIST));
      assert.ok(routingGuard.ROUTER_BASH_WHITELIST.length > 0);
    });
  });

  describe('isWhitelistedBashCommand', () => {
    it('should allow git status', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git status'), true);
    });

    it('should allow git status -s', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git status -s'), true);
    });

    it('should allow git status --short', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git status --short'), true);
    });

    it('should allow git log --oneline -5', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git log --oneline -5'), true);
    });

    it('should allow git log --oneline -10', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git log --oneline -10'), true);
    });

    it('should allow git diff --name-only', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git diff --name-only'), true);
    });

    it('should allow git branch', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git branch'), true);
    });

    it('should reject pnpm test', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('pnpm test'), false);
    });

    it('should reject npm test', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('npm test'), false);
    });

    it('should reject rm commands', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('rm -rf /'), false);
    });

    it('should reject git push', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git push'), false);
    });

    it('should reject git checkout', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('git checkout main'), false);
    });

    it('should reject arbitrary shell commands', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('node index.js'), false);
      assert.strictEqual(routingGuard.isWhitelistedBashCommand('cat /etc/passwd'), false);
      assert.strictEqual(routingGuard.isWhitelistedBashCommand('curl https://evil.com'), false);
    });

    it('should reject null/undefined/empty', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand(null), false);
      assert.strictEqual(routingGuard.isWhitelistedBashCommand(undefined), false);
      assert.strictEqual(routingGuard.isWhitelistedBashCommand(''), false);
    });

    it('should trim whitespace', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      assert.strictEqual(routingGuard.isWhitelistedBashCommand('  git status  '), true);
    });
  });

  describe('checkRouterBash', () => {
    it('should pass for non-Bash tools', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      const result = routingGuard.checkRouterBash('Read', {});
      assert.strictEqual(result.pass, true);
    });

    it('should block by default for non-whitelisted router Bash commands', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      delete process.env.ROUTER_BASH_GUARD;
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();

      const result = routingGuard.checkRouterBash('Bash', { command: 'pnpm test' });
      assert.strictEqual(result.pass, false);
      assert.strictEqual(result.result, 'block');
      assert.ok(result.message.includes('ROUTER BASH VIOLATION BLOCKED'));
    });

    it('should pass when enforcement is off', () => {
      assert.ok(routingGuard, 'Module should be loadable');

      process.env.ROUTER_BASH_GUARD = 'off';
      const result = routingGuard.checkRouterBash('Bash', { command: 'pnpm test' });
      assert.strictEqual(result.pass, true);
    });

    it('should pass for whitelisted git commands in router mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      const result = routingGuard.checkRouterBash('Bash', { command: 'git status' });
      assert.strictEqual(result.pass, true);
    });

    it('should pass for whitelisted git log command in router mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      const result = routingGuard.checkRouterBash('Bash', { command: 'git log --oneline -5' });
      assert.strictEqual(result.pass, true);
    });

    it('should block non-whitelisted commands in router mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      // Ensure enforcement is on
      process.env.ROUTER_BASH_GUARD = 'block';

      const result = routingGuard.checkRouterBash('Bash', { command: 'pnpm test' });
      assert.strictEqual(result.pass, false);
      assert.strictEqual(result.result, 'block');
      assert.ok(result.message.includes('ROUTER BASH VIOLATION'));
    });

    it('should block node commands in router mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      process.env.ROUTER_BASH_GUARD = 'block';

      const result = routingGuard.checkRouterBash('Bash', {
        command: 'node .claude/hooks/test.cjs',
      });
      assert.strictEqual(result.pass, false);
      assert.strictEqual(result.result, 'block');
    });

    it('should warn for non-whitelisted commands when enforcement is warn', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      process.env.ROUTER_BASH_GUARD = 'warn';

      const result = routingGuard.checkRouterBash('Bash', { command: 'pnpm test' });
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, 'warn');
      assert.ok(result.message.includes('ROUTER BASH VIOLATION'));
    });

    it('should pass for any command when in agent mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Set agent mode
      routerState.enterAgentMode();
      routerState.invalidateStateCache();
      // PERF-001: Also invalidate routing-guard's internal cache
      routingGuard.invalidateCachedState();

      process.env.ROUTER_BASH_GUARD = 'block';

      const result = routingGuard.checkRouterBash('Bash', { command: 'pnpm test' });
      assert.strictEqual(result.pass, true);
    });

    it('should pass when a spawned task is active even if router state reads router mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();
      routerState.setCurrentSpawnTaskId('task-active-spawn-1');

      process.env.ROUTER_BASH_GUARD = 'block';

      const result = routingGuard.checkRouterBash('Bash', { command: 'pnpm test' });
      assert.strictEqual(result.pass, true);

      routerState.clearCurrentSpawnTaskId();
    });

    it('should warn-allow read-only discovery bash in bypassPermissions mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();
      process.env.ROUTER_BASH_GUARD = 'block';

      const result = routingGuard.checkRouterBash(
        'Bash',
        { command: 'find /c/dev/projects/agent-studio/.claude/hooks -type f -name "*.cjs" | sort' },
        { permission_mode: 'bypassPermissions' }
      );
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, 'warn');
      assert.ok(String(result.message || '').includes('bypass'));
    });

    it('should block brittle sleep+cat polling command even in bypassPermissions mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();
      process.env.ROUTER_BASH_GUARD = 'block';

      const result = routingGuard.checkRouterBash(
        'Bash',
        {
          command:
            'sleep 10 && cat /c/Users/oimir/AppData/Local/Temp/claude-debug-tail.txt',
        },
        { permission_mode: 'bypassPermissions' }
      );
      assert.strictEqual(result.pass, false);
      assert.strictEqual(result.result, 'block');
      assert.ok(String(result.message || '').includes('brittle sleep+cat polling'));
    });

    it('should include visceral message with correct format', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Set router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      // PERF-001: Also invalidate routing-guard's internal cache
      routingGuard.invalidateCachedState();

      process.env.ROUTER_BASH_GUARD = 'block';

      const result = routingGuard.checkRouterBash('Bash', { command: 'npm install' });
      assert.strictEqual(result.pass, false);
      // Check visceral message contains key elements
      assert.ok(result.message.includes('ADR-030'), 'Message should reference ADR-030');
      assert.ok(result.message.includes('git status'), 'Message should list allowed commands');
      assert.ok(result.message.includes('Spawn'), 'Message should tell user to spawn agent');
      // SEC-AUDIT-021: Override hints removed from user-facing error messages
      // assert.ok(result.message.includes('ROUTER_BASH_GUARD'), 'Message should mention override');
    });
  });

  describe('checkRouterBash exported from module', () => {
    it('should export checkRouterBash function', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.strictEqual(typeof routingGuard.checkRouterBash, 'function');
    });

    it('should export isWhitelistedBashCommand function', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.strictEqual(typeof routingGuard.isWhitelistedBashCommand, 'function');
    });

    it('should export ROUTER_BASH_WHITELIST constant', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(Array.isArray(routingGuard.ROUTER_BASH_WHITELIST));
    });
  });

  // ============================================================================
  // ROUTING-002 FIX: Router should NOT use Glob/Grep directly
  // ============================================================================
  describe('ROUTING-002: Router Glob/Grep blocking', () => {
    it('should BLOCK Glob tool in router mode (ROUTING-002 fix)', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Explicitly reset to router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();

      // Verify state is in router mode
      const state = routerState.getState();
      assert.strictEqual(state.mode, 'router', 'Should be in router mode');
      assert.strictEqual(state.taskSpawned, false, 'Task should not be spawned');

      // Enable enforcement
      process.env.ROUTER_SELF_CHECK = 'block';

      // Test: Glob should be BLOCKED in router mode
      const result = routingGuard.checkRouterSelfCheck('Glob', {});
      assert.strictEqual(
        result.pass,
        false,
        'Glob should be BLOCKED in router mode - Router must spawn agent instead'
      );
      assert.strictEqual(result.result, 'block', 'Result should be block');
    });

    it('should BLOCK Grep tool in router mode (ROUTING-002 fix)', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Explicitly reset to router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();

      // Enable enforcement
      process.env.ROUTER_SELF_CHECK = 'block';

      // Test: Grep should be BLOCKED in router mode
      const result = routingGuard.checkRouterSelfCheck('Grep', {});
      assert.strictEqual(
        result.pass,
        false,
        'Grep should be BLOCKED in router mode - Router must spawn agent instead'
      );
      assert.strictEqual(result.result, 'block', 'Result should be block');
    });

    it('should BLOCK WebSearch tool in router mode (ROUTING-002 fix)', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Explicitly reset to router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();

      // Enable enforcement
      process.env.ROUTER_SELF_CHECK = 'block';

      // Test: WebSearch should be BLOCKED in router mode
      const result = routingGuard.checkRouterSelfCheck('WebSearch', {});
      assert.strictEqual(
        result.pass,
        false,
        'WebSearch should be BLOCKED in router mode - Router must spawn agent instead'
      );
      assert.strictEqual(result.result, 'block', 'Result should be block');
    });

    it('should warn-allow Grep in bypassPermissions mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();
      process.env.ROUTER_SELF_CHECK = 'block';

      const result = routingGuard.checkRouterSelfCheck(
        'Grep',
        { pattern: 'recordTaskUpdate', path: '.claude/hooks' },
        { permission_mode: 'bypassPermissions' }
      );
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, 'warn');
      assert.match(String(result.message || ''), /ROUTER SELF-CHECK BYPASS/);
    });

    it('should warn-allow Write in bypassPermissions mode', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();
      process.env.ROUTER_SELF_CHECK = 'block';

      const result = routingGuard.checkRouterSelfCheck(
        'Write',
        { file_path: '.claude/context/reports/tmp.md', content: '# temp' },
        { permission_mode: 'bypassPermissions' }
      );
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, 'warn');
      assert.match(String(result.message || ''), /ROUTER SELF-CHECK BYPASS/);
    });

    it('should ALLOW Glob tool in agent mode (after Task spawned)', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // Reset to router mode first, then enter agent mode
      routerState.resetToRouterMode();
      routerState.enterAgentMode('Testing agent context');
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();

      // Verify state is in agent mode
      const state = routerState.getState();
      assert.strictEqual(state.mode, 'agent', 'Should be in agent mode');
      assert.strictEqual(state.taskSpawned, true, 'Task should be spawned');

      // Enable enforcement
      process.env.ROUTER_SELF_CHECK = 'block';

      // Test: Glob should be ALLOWED in agent mode
      const result = routingGuard.checkRouterSelfCheck('Glob', {});
      assert.strictEqual(result.pass, true, 'Glob should be ALLOWED in agent mode (Task spawned)');
    });

    it('should block Glob even when user explicitly requests it (ROUTING-002 root cause)', () => {
      assert.ok(routingGuard, 'Module should be loadable');
      assert.ok(routerState, 'Router state module should be loadable');

      // This test simulates the exact scenario from ROUTING-002:
      // User says "List TypeScript files using Glob"
      // Router should BLOCK despite user explicitly mentioning the tool

      // Reset to clean router mode
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
      routingGuard.invalidateCachedState();

      process.env.ROUTER_SELF_CHECK = 'block';

      // Test runAllChecks which is called by the hook
      const result = routingGuard.runAllChecks('Glob', {
        pattern: '**/*.ts',
      });

      assert.strictEqual(
        result.pass,
        false,
        'Glob should be BLOCKED via runAllChecks in router mode'
      );
      assert.strictEqual(result.result, 'block', 'Result should be block');
      assert.ok(
        result.message.includes('TASKLIST-FIRST') || result.message.includes('blacklisted'),
        'Message should mention TaskList-first or blacklisted tool'
      );
    });
  });

  // ============================================================================
  // ENFORCEMENT-003 FIX: End-to-end integration tests for blocking exit codes
  // Verifies that the hook actually exits with code 2 when blocking
  // ============================================================================
  describe('ENFORCEMENT-003: End-to-end blocking behavior', () => {
    const { _execSync, spawnSync } = require('child_process');
    const runtimeDir = path.join(os.tmpdir(), 'routing-guard-test-' + Date.now());
    const stateFile = path.join(runtimeDir, 'router-state.json');

    beforeEach(() => {
      // Create runtime directory
      if (!fs.existsSync(runtimeDir)) {
        fs.mkdirSync(runtimeDir, { recursive: true });
      }
      // Reset state to router mode (mode: 'router', taskSpawned: false)
      const routerModeState = {
        mode: 'router',
        taskSpawned: false,
        taskSpawnedAt: null,
        sessionId: 'test-session',
        version: 1,
      };
      fs.writeFileSync(stateFile, JSON.stringify(routerModeState));
    });

    afterEach(() => {
      // Clean up
      try {
        if (fs.existsSync(runtimeDir)) {
          fs.rmSync(runtimeDir, { recursive: true });
        }
      } catch (_e) {
        // Ignore cleanup errors
      }
    });

    it('ENFORCEMENT-003: Hook should exit with code 2 when blocking Glob in router mode', () => {
      // This test simulates what happens when Claude Code invokes the hook
      // with a Glob tool usage while in router mode

      // Create hook input simulating Glob tool usage
      const hookInput = JSON.stringify({
        tool_name: 'Glob',
        tool_input: { pattern: '**/*.ts' },
        session_id: 'test-session',
      });

      // Run the hook via subprocess
      const result = spawnSync('node', [HOOK_PATH, hookInput], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          ROUTER_SELF_CHECK: 'block', // Enable blocking
          // Point to our test runtime directory
        },
        cwd: PROJECT_ROOT,
      });

      // ENFORCEMENT-003 FIX: The hook MUST exit with code 2 to block
      // If this test fails with exitCode 0, the blocking is not working
      assert.strictEqual(
        result.status,
        2,
        `Hook should exit with code 2 (block) but got ${result.status}. ` +
          `stdout: ${result.stdout}. stderr: ${result.stderr}. ` +
          `This proves ENFORCEMENT-003 is not yet fixed.`
      );

      // Verify the output contains the blocking message
      const stdout = result.stdout || '';
      assert.ok(
        stdout.includes('block') || stdout.includes('BLOCKED'),
        `Output should contain blocking message but got: ${stdout}`
      );
    });

    it('ENFORCEMENT-003: Hook should exit with code 0 when allowing Read tool', () => {
      // Create hook input simulating Read tool usage (whitelisted)
      const hookInput = JSON.stringify({
        tool_name: 'Read',
        tool_input: { file_path: '/some/file.txt' },
        session_id: 'test-session',
      });

      const result = spawnSync('node', [HOOK_PATH, hookInput], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          ROUTER_SELF_CHECK: 'block',
        },
        cwd: PROJECT_ROOT,
      });

      // Read is whitelisted, should exit 0
      assert.strictEqual(
        result.status,
        0,
        `Hook should exit with code 0 (allow) for Read tool but got ${result.status}`
      );
    });

    it('ENFORCEMENT-003: Hook should exit with code 2 when blocking Write in router mode', () => {
      // Create hook input simulating Write tool usage (blacklisted)
      const hookInput = JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: '/project/src/code.js', content: 'test' },
        session_id: 'test-session',
      });

      const result = spawnSync('node', [HOOK_PATH, hookInput], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          ROUTER_SELF_CHECK: 'block',
          ROUTER_WRITE_GUARD: 'block',
        },
        cwd: PROJECT_ROOT,
      });

      // Write is blacklisted in router mode, should exit 2
      assert.strictEqual(
        result.status,
        2,
        `Hook should exit with code 2 (block) for Write tool but got ${result.status}. ` +
          `stdout: ${result.stdout}. stderr: ${result.stderr}`
      );
    });

    it('ENFORCEMENT-003: Hook should exit with code 0 when enforcement is off', () => {
      const hookInput = JSON.stringify({
        tool_name: 'Glob',
        tool_input: { pattern: '**/*.ts' },
        session_id: 'test-session',
      });

      const result = spawnSync('node', [HOOK_PATH, hookInput], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          ROUTER_SELF_CHECK: 'off', // Enforcement disabled
          TASKLIST_FIRST_ENFORCEMENT: 'off',
        },
        cwd: PROJECT_ROOT,
      });

      // With enforcement off, should exit 0
      assert.strictEqual(
        result.status,
        0,
        `Hook should exit with code 0 when enforcement is off but got ${result.status}`
      );
    });

    it('ENFORCEMENT-003: Hook blocking message should indicate spawn requirement', () => {
      const hookInput = JSON.stringify({
        tool_name: 'Grep',
        tool_input: { pattern: 'function', path: '/project' },
        session_id: 'test-session',
      });

      const result = spawnSync('node', [HOOK_PATH, hookInput], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          ROUTER_SELF_CHECK: 'block',
        },
        cwd: PROJECT_ROOT,
      });

      assert.strictEqual(result.status, 2, 'Should block with exit code 2');
      const output = JSON.parse(result.stdout);
      assert.strictEqual(output.result, 'block');
      assert.ok(
        output.message.includes('TaskList()') || output.message.includes('Spawn an agent'),
        'Message should tell user the next required protocol step'
      );
      assert.ok(
        output.message.includes('Task()') || output.message.includes('TaskList()'),
        'Message should mention Task() or TaskList()'
      );
    });

    it('ENFORCEMENT-003: Hook should block WebSearch in router mode', () => {
      const hookInput = JSON.stringify({
        tool_name: 'WebSearch',
        tool_input: { query: 'test query' },
        session_id: 'test-session',
      });

      const result = spawnSync('node', [HOOK_PATH, hookInput], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          ROUTER_SELF_CHECK: 'block',
        },
        cwd: PROJECT_ROOT,
      });

      assert.strictEqual(
        result.status,
        2,
        `WebSearch should be blocked in router mode but got exit code ${result.status}`
      );
    });

    it('ENFORCEMENT-003: Comprehensive blacklist test - all blacklisted tools should be blocked', () => {
      const blacklistedTools = [
        { tool_name: 'Glob', tool_input: { pattern: '*.ts' } },
        { tool_name: 'Grep', tool_input: { pattern: 'test' } },
        { tool_name: 'WebSearch', tool_input: { query: 'test' } },
        {
          tool_name: 'Edit',
          tool_input: { file_path: '/src/code.js', old_string: 'a', new_string: 'b' },
        },
        { tool_name: 'Write', tool_input: { file_path: '/src/new.js', content: 'test' } },
        { tool_name: 'NotebookEdit', tool_input: { notebook_path: '/notebook.ipynb' } },
      ];

      for (const tool of blacklistedTools) {
        const hookInput = JSON.stringify({
          ...tool,
          session_id: 'test-session',
        });

        const result = spawnSync('node', [HOOK_PATH, hookInput], {
          encoding: 'utf-8',
          env: {
            ...process.env,
            ROUTER_SELF_CHECK: 'block',
            ROUTER_WRITE_GUARD: 'block',
          },
          cwd: PROJECT_ROOT,
        });

        assert.strictEqual(
          result.status,
          2,
          `${tool.tool_name} should be blocked in router mode but got exit code ${result.status}`
        );
      }
    });
  });
});
