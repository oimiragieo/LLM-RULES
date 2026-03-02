#!/usr/bin/env node
/**
 * routing-guard-edit-write.test.cjs
 *
 * Tests for Fix 1 (CRITICAL): routing-guard.cjs must block Edit/Write/NotebookEdit
 * when in router mode, and allow them when in agent mode.
 *
 * Also verifies settings.json registration (routing-guard is FIRST hook
 * in the Edit|Write|NotebookEdit matcher).
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

// Load modules under test
let routingGuard;
let routerState;
try {
  routingGuard = require('../../.claude/hooks/routing/routing-guard.cjs');
  routerState = require('../../.claude/lib/routing/router-state.cjs');
} catch (_err) {
  routingGuard = null;
  routerState = null;
}

describe('Fix 1: routing-guard blocks Edit/Write/NotebookEdit in router mode', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Ensure enforcement is on for tests
    process.env.ROUTER_SELF_CHECK = 'block';
    process.env.ROUTER_WRITE_GUARD = 'block';
    // Suppress debug logging noise
    process.env.ROUTER_DEBUG = 'false';

    // Reset to router mode
    if (routerState) {
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
    }
    if (routingGuard) {
      routingGuard.invalidateCachedState();
    }
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
    if (routingGuard && routingGuard.invalidateCachedState) {
      routingGuard.invalidateCachedState();
    }
  });

  // =========================================================================
  // Unit tests: checkRouterSelfCheck for Edit/Write/NotebookEdit
  // =========================================================================

  it('should block Edit when mode=router and taskSpawned=false', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const result = routingGuard.checkRouterSelfCheck('Edit', {
      file_path: '/project/src/index.js',
      old_string: 'foo',
      new_string: 'bar',
    });
    assert.strictEqual(result.pass, false, 'Edit should be blocked in router mode');
    assert.strictEqual(result.result, 'block');
  });

  it('should block Write when mode=router and taskSpawned=false', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const result = routingGuard.checkRouterSelfCheck('Write', {
      file_path: '/project/src/new-file.js',
      content: 'test content',
    });
    assert.strictEqual(result.pass, false, 'Write should be blocked in router mode');
    assert.strictEqual(result.result, 'block');
  });

  it('should block NotebookEdit when mode=router and taskSpawned=false', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const result = routingGuard.checkRouterSelfCheck('NotebookEdit', {
      notebook_path: '/project/notebook.ipynb',
    });
    assert.strictEqual(result.pass, false, 'NotebookEdit should be blocked in router mode');
    assert.strictEqual(result.result, 'block');
  });

  it('should allow Edit when mode=agent (task spawned)', () => {
    assert.ok(routingGuard, 'Module should be loadable');
    assert.ok(routerState, 'Router state module should be loadable');

    // Enter agent mode
    routerState.enterAgentMode('Test agent context');
    routerState.invalidateStateCache();
    routingGuard.invalidateCachedState();

    const result = routingGuard.checkRouterSelfCheck(
      'Edit',
      {
        file_path: '/project/src/index.js',
        old_string: 'foo',
        new_string: 'bar',
      },
      { task_id: 'test-agent-task' }
    );
    assert.strictEqual(result.pass, true, 'Edit should be allowed in agent mode');
  });

  it('should allow Write when mode=agent (task spawned)', () => {
    assert.ok(routingGuard, 'Module should be loadable');
    assert.ok(routerState, 'Router state module should be loadable');

    // Enter agent mode
    routerState.enterAgentMode('Test agent context');
    routerState.invalidateStateCache();
    routingGuard.invalidateCachedState();

    const result = routingGuard.checkRouterSelfCheck(
      'Write',
      {
        file_path: '/project/src/new-file.js',
        content: 'test content',
      },
      { task_id: 'test-agent-task' }
    );
    assert.strictEqual(result.pass, true, 'Write should be allowed in agent mode');
  });

  it('should allow Write to always-allowed paths (memory) even in router mode', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const result = routingGuard.checkRouterSelfCheck('Write', {
      file_path: '/project/.claude/context/memory/learnings.md',
    });
    assert.strictEqual(result.pass, true, 'Memory file writes always allowed');
  });

  it('should allow Write to always-allowed paths (runtime) even in router mode', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const result = routingGuard.checkRouterSelfCheck('Write', {
      file_path: '/project/.claude/context/runtime/router-state.json',
    });
    assert.strictEqual(result.pass, true, 'Runtime file writes always allowed');
  });

  it('should classify subordinate context as non-router when allowed_tools excludes Task', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const isRouter = routingGuard.isRouterInvocation({
      allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Write', 'Edit'],
    });
    assert.strictEqual(isRouter, false, 'Subagent context should not be treated as Router');
  });

  it('should classify router context when allowed_tools includes Task', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const isRouter = routingGuard.isRouterInvocation({
      allowed_tools: ['Task', 'TaskList', 'TaskCreate', 'Read'],
    });
    assert.strictEqual(isRouter, true, 'Router context should be treated as Router');
  });

  // =========================================================================
  // Integration test: runAllChecks for Edit/Write
  // =========================================================================

  it('should block Edit via runAllChecks in router mode', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const result = routingGuard.runAllChecks('Edit', {
      file_path: '/project/src/index.js',
      old_string: 'foo',
      new_string: 'bar',
    });
    assert.strictEqual(result.pass, false, 'Edit should be blocked via runAllChecks');
  });

  it('should block Write via runAllChecks in router mode', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const result = routingGuard.runAllChecks('Write', {
      file_path: '/project/src/new-file.js',
      content: 'test content',
    });
    assert.strictEqual(result.pass, false, 'Write should be blocked via runAllChecks');
  });

  // =========================================================================
  // Settings.json registration verification
  // =========================================================================

  it('should have write-pretool-bundle.cjs as the ONLY hook for Edit|Write|NotebookEdit in settings.json', () => {
    const settingsPath = path.join(PROJECT_ROOT, '.claude', 'settings.json');
    assert.ok(fs.existsSync(settingsPath), 'settings.json should exist');

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const preToolUse = settings.hooks.PreToolUse;
    assert.ok(Array.isArray(preToolUse), 'PreToolUse should be an array');

    // Find the Edit|Write|NotebookEdit matcher
    const editWriteMatcher = preToolUse.find(m => m.matcher === 'Edit|Write|NotebookEdit');
    assert.ok(editWriteMatcher, 'Edit|Write|NotebookEdit matcher should exist');
    assert.ok(Array.isArray(editWriteMatcher.hooks), 'Matcher should have hooks array');
    assert.strictEqual(
      editWriteMatcher.hooks.length,
      1,
      'Matcher should have exactly one hook (bundle)'
    );

    // Verify write-pretool-bundle.cjs is the only hook (it chains unified-creator-guard,
    // research-enforcement, adaptive-quality-gate, and evolution-state-guard internally)
    const onlyHook = editWriteMatcher.hooks[0];
    assert.ok(
      onlyHook.command.includes('write-pretool-bundle.cjs'),
      `Only hook should be write-pretool-bundle.cjs but got: ${onlyHook.command}`
    );
  });
});
