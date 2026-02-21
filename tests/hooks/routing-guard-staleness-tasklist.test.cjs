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
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

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

  it('should preserve state when stale age is in the same session', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date(Date.now() - 700000).toISOString(), // 11.7 min ago
      sessionId: 'session-abc',
    };
    process.env.CLAUDE_SESSION_ID = 'session-abc';
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(
      result.mode,
      'agent',
      'Same-session stale state should not force router mode'
    );
    assert.strictEqual(
      result.taskSpawned,
      true,
      'Same-session stale state should keep taskSpawned'
    );
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

  it('should preserve stale state when threshold is exceeded but session matches', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    // Set a very short threshold (1 second)
    process.env.STATE_STALE_THRESHOLD_MS = '1000';
    process.env.CLAUDE_SESSION_ID = 'session-abc';

    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date(Date.now() - 2000).toISOString(), // 2 seconds ago
      sessionId: 'session-abc',
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(
      result.mode,
      'agent',
      'Threshold exceed should not force router mode for same session'
    );
    assert.strictEqual(result.taskSpawned, true);
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

  it('should force router mode on session mismatch and preserve other state fields', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    process.env.CLAUDE_SESSION_ID = 'session-123';
    const state = {
      mode: 'agent',
      taskSpawned: true,
      lastReset: new Date(Date.now() - 700000).toISOString(),
      sessionId: 'different-session',
      complexity: 'high',
      plannerSpawned: true,
    };
    const result = routingGuard.applyStaleDetection(state);
    assert.strictEqual(result.mode, 'router', 'Should force router mode');
    assert.strictEqual(result.taskSpawned, false, 'Should force taskSpawned false');
    assert.strictEqual(result.sessionId, 'session-123', 'Should update sessionId');
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

  it('should auto-reroute when Glob used in router mode without TaskList first (default block)', () => {
    assert.ok(routingGuard, 'Module should be loadable');
    assert.ok(
      typeof routingGuard.checkTaskListFirstGate === 'function',
      'checkTaskListFirstGate should be exported'
    );

    // Default enforcement is block
    delete process.env.TASKLIST_FIRST_ENFORCEMENT;

    const result = routingGuard.checkTaskListFirstGate('Glob');
    assert.strictEqual(result.pass, true, 'Glob should fail-open with auto-reroute');
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message.includes('TASKLIST-FIRST AUTO-REROUTE'));
  });

  it('should block when Edit used in router mode without TaskList first', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    delete process.env.TASKLIST_FIRST_ENFORCEMENT;

    const result = routingGuard.checkTaskListFirstGate('Edit');
    assert.strictEqual(result.pass, false, 'Default block mode should block');
    assert.strictEqual(result.result, 'block');
  });

  it('should block when Bash used in router mode without TaskList first', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    delete process.env.TASKLIST_FIRST_ENFORCEMENT;

    const result = routingGuard.checkTaskListFirstGate('Bash');
    assert.strictEqual(result.pass, false, 'Default block mode should block');
    assert.strictEqual(result.result, 'block');
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

    const result = routingGuard.checkTaskListFirstGate('Edit', { task_id: 'test-agent-task' });
    assert.strictEqual(result.pass, true, 'Should pass in agent mode');
  });

  it('should block for Task tool when taskListCalledSincePrompt is false', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    delete process.env.TASKLIST_FIRST_ENFORCEMENT;

    const result = routingGuard.checkTaskListFirstGate('Task');
    assert.strictEqual(result.pass, false, 'Default block mode should block');
    assert.strictEqual(result.result, 'block');
  });

  it('should allow Task(reflection-agent) before TaskList (Step 0 deadlock fix)', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    process.env.TASKLIST_FIRST_ENFORCEMENT = 'block';
    const stateFile = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        mode: 'router',
        taskSpawned: false,
        taskListCalledSincePrompt: false,
      }),
      'utf8'
    );
    routingGuard.invalidateCachedState();

    const result = routingGuard.checkTaskListFirstGate('Task', {
      tool_input: { subagent_type: 'reflection-agent', prompt: 'Process reflection request.' },
    });
    assert.strictEqual(result.pass, true, 'reflection-agent should be allowed before TaskList');
    assert.strictEqual(result.result, 'warn');
    assert.match(result.message, /STEP0 EXEMPTION|reflection-agent/);
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

  it('should return warn auto-reroute for Glob when TASKLIST_FIRST_ENFORCEMENT=block', () => {
    assert.ok(routingGuard, 'Module should be loadable');

    process.env.TASKLIST_FIRST_ENFORCEMENT = 'block';

    const result = routingGuard.checkTaskListFirstGate('Glob');
    assert.strictEqual(result.pass, true, 'Glob should auto-reroute in block mode');
    assert.strictEqual(result.result, 'warn');
    assert.ok(result.message.includes('TASKLIST-FIRST AUTO-REROUTE'));
  });
});
