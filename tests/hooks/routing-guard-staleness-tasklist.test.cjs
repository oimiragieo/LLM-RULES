#!/usr/bin/env node
/**
 * routing-guard-staleness-tasklist.test.cjs
 *
 * Tests for:
 * - Fix 4b: Staleness detection in routing-guard.cjs (applyStaleDetection)
 * - Fix 3 / Check 8: TaskList-first gate (checkTaskListFirstGate)
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

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

// ============================================================================
// Fix 4b: Staleness Detection
// ============================================================================

describe('Fix 4b: applyStaleDetection', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Remove any override so default threshold (600000ms) is used
    delete process.env.STATE_STALE_THRESHOLD_MS;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  it('should return state unchanged when lastReset is fresh', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date().toISOString(),
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(result.mode, 'agent', 'Fresh state should keep agent mode');
    assert.strictEqual(result.taskSpawned, true, 'Fresh state should keep taskSpawned');
  });

  it('should force router mode when state is stale (older than 10 min)', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date(Date.now() - 700000).toISOString(), // 11.7 min ago
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(result.mode, 'router', 'Stale state should force router mode');
    assert.strictEqual(result.taskSpawned, false, 'Stale state should force taskSpawned false');
  });

  it('should preserve active agent state when lastReset is null (backward compatibility)', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: null,
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(result.mode, 'agent', 'No lastReset should preserve active agent mode');
    assert.strictEqual(
      result.taskSpawned,
      true,
      'No lastReset should preserve taskSpawned for agent mode'
    );
  });

  it('should preserve active agent state when lastReset is invalid (backward compatibility)', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: 'invalid-date',
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(result.mode, 'agent', 'Invalid date should preserve active agent mode');
    assert.strictEqual(
      result.taskSpawned,
      true,
      'Invalid date should preserve taskSpawned for agent mode'
    );
  });

  it('should respect STATE_STALE_THRESHOLD_MS env var override', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    // Set a very short threshold (1 second)
    process.env.STATE_STALE_THRESHOLD_MS = '1000';

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date(Date.now() - 2000).toISOString(), // 2 seconds ago
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(
      result.mode,
      'router',
      '2-second-old state should be stale with 1-second threshold'
    );
    assert.strictEqual(result.taskSpawned, false);
  });

  it('should skip staleness detection when threshold is 0 (invalid)', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    process.env.STATE_STALE_THRESHOLD_MS = '0';

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date(Date.now() - 999999999).toISOString(), // Very old
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(result.mode, 'agent', 'Invalid threshold (0) should skip detection');
    assert.strictEqual(result.taskSpawned, true);
  });

  it('should skip staleness detection when threshold is negative (invalid)', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    process.env.STATE_STALE_THRESHOLD_MS = '-1';

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date(Date.now() - 999999999).toISOString(),
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(result.mode, 'agent', 'Negative threshold should skip detection');
    assert.strictEqual(result.taskSpawned, true);
  });

  it('should preserve other state fields when forcing router mode', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date(Date.now() - 700000).toISOString(),
      sessionId: 'session-123',
      complexity: 'high',
      plannerSpawned: true,
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(result.mode, 'router', 'Should force router mode');
    assert.strictEqual(result.taskSpawned, false, 'Should force taskSpawned false');
    assert.strictEqual(result.sessionId, 'session-123', 'Should preserve sessionId');
    assert.strictEqual(result.complexity, 'high', 'Should preserve complexity');
    assert.strictEqual(result.plannerSpawned, true, 'Should preserve plannerSpawned');
  });
});

// ============================================================================
// Fix 3 / Check 8: TaskList-First Gate
// ============================================================================

describe('Fix 3 / Check 8: checkTaskListFirstGate', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Suppress debug logging
    process.env.ROUTER_DEBUG = 'false';
    // Reset to router mode with taskListCalledSincePrompt: false
    if (routerState) {
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();
    }
    if (routingGuard) {
      routingGuard.invalidateCachedState();
    }
  });

  afterEach(() => {
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

  it('should warn when Glob used in router mode without TaskList first (default warn)', () => {
    assert.ok(routingGuard, 'Module should be loadable');
    assert.ok(
      typeof routingGuard.checkTaskListFirstGate === 'function',
      'checkTaskListFirstGate should be exported'
    );

    // Default enforcement is warn
    delete process.env.TASKLIST_FIRST_ENFORCEMENT;

    const result = routingGuard.checkTaskListFirstGate('Glob');
    assert.strictEqual(result.pass, true, 'Warn mode passes but with warning');
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message.includes('TASKLIST-FIRST'), 'Message should mention violation');
  });

  it('should warn when Edit used in router mode without TaskList first', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    delete process.env.TASKLIST_FIRST_ENFORCEMENT;

    const result = routingGuard.checkTaskListFirstGate('Edit');
    assert.strictEqual(result.pass, true, 'Warn mode passes');
    assert.strictEqual(result.result, 'warn');
  });

  it('should warn when Bash used in router mode without TaskList first', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    delete process.env.TASKLIST_FIRST_ENFORCEMENT;

    const result = routingGuard.checkTaskListFirstGate('Bash');
    assert.strictEqual(result.pass, true, 'Warn mode passes');
    assert.strictEqual(result.result, 'warn');
  });

  it('should pass when taskListCalledSincePrompt is true', () => {
    assert.ok(routingGuard, 'Module should be loadable');
    assert.ok(routerState, 'Router state module should be loadable');

    // Mark TaskList as called
    routerState.setTaskListCalled();
    routerState.invalidateStateCache();
    routingGuard.invalidateCachedState();

    const result = routingGuard.checkTaskListFirstGate('Glob');
    assert.strictEqual(result.pass, true, 'Should pass when TaskList already called');
    assert.strictEqual(result.result, undefined, 'No result when passing cleanly');
  });

  it('should pass when in agent mode', () => {
    assert.ok(routingGuard, 'Module should be loadable');
    assert.ok(routerState, 'Router state module should be loadable');

    // Enter agent mode
    routerState.enterAgentMode('Test agent');
    routerState.invalidateStateCache();
    routingGuard.invalidateCachedState();

    const result = routingGuard.checkTaskListFirstGate('Edit');
    assert.strictEqual(result.pass, true, 'Should pass in agent mode');
  });

  it('should warn for Task tool when taskListCalledSincePrompt is false', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    delete process.env.TASKLIST_FIRST_ENFORCEMENT;

    const result = routingGuard.checkTaskListFirstGate('Task');
    assert.strictEqual(result.pass, true, 'Warn mode passes');
    assert.strictEqual(result.result, 'warn');
  });

  it('should always pass when TASKLIST_FIRST_ENFORCEMENT=off', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';

    const result = routingGuard.checkTaskListFirstGate('Glob');
    assert.strictEqual(result.pass, true, 'Should pass when enforcement is off');
    assert.strictEqual(result.result, undefined, 'No result when enforcement off');
  });

  it('should return warn result when TASKLIST_FIRST_ENFORCEMENT=warn', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    process.env.TASKLIST_FIRST_ENFORCEMENT = 'warn';

    const result = routingGuard.checkTaskListFirstGate('Glob');
    assert.strictEqual(result.pass, true, 'Warn mode allows');
    assert.strictEqual(result.result, 'warn');
  });

  it('should return block result when TASKLIST_FIRST_ENFORCEMENT=block', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    process.env.TASKLIST_FIRST_ENFORCEMENT = 'block';

    const result = routingGuard.checkTaskListFirstGate('Glob');
    assert.strictEqual(result.pass, false, 'Block mode blocks');
    assert.strictEqual(result.result, 'block');
    assert.ok(result.message.includes('TASKLIST-FIRST'), 'Message should mention violation');
  });
});
