#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const path = require('path');
const fs = require('fs');

const originalExit = process.exit;
const originalSemanticRouting = process.env.SEMANTIC_ROUTING;
let lastExitCode = null; // eslint-disable-line no-unused-vars
async function waitForPath(filePath, timeoutMs = 500, pollMs = 25) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(filePath)) return true;
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  return fs.existsSync(filePath);
}

beforeEach(() => {
  lastExitCode = null;
  process.exit = code => {
    lastExitCode = code;
  };
  process.env.SEMANTIC_ROUTING = 'off';
});

afterEach(() => {
  process.exit = originalExit;
  if (originalSemanticRouting === undefined) {
    delete process.env.SEMANTIC_ROUTING;
  } else {
    process.env.SEMANTIC_ROUTING = originalSemanticRouting;
  }
});

describe('ROUTING-003: Session Boundary Detection', () => {
  it('should reset state when session ID changes (stale state from previous session)', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');

    routerState.enterAgentMode('Task from previous session');
    routerState.invalidateStateCache();

    const stateFile = routerState.STATE_FILE;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    state.sessionId = 'old-session-12345';
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    routerState.invalidateStateCache();

    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'new-session-67890';

    try {
      const hookInput = { prompt: 'Use Glob to list all TypeScript files' };
      const result = unified.checkRouterModeReset(hookInput);

      assert.strictEqual(result.stateReset, true);
      assert.strictEqual(result.sessionBoundaryDetected, true);

      routerState.invalidateStateCache();
      const newState = routerState.getState();
      assert.strictEqual(newState.mode, 'router');
      assert.strictEqual(newState.taskSpawned, false);
      assert.strictEqual(newState.sessionId, 'new-session-67890');
    } finally {
      if (originalSessionId !== undefined) {
        process.env.CLAUDE_SESSION_ID = originalSessionId;
      } else {
        delete process.env.CLAUDE_SESSION_ID;
      }
    }
  });

  it('should reset state when previous sessionId is null and current is set', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');

    routerState.enterAgentMode('Task with null sessionId');
    routerState.invalidateStateCache();

    const stateFile = routerState.STATE_FILE;
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    state.sessionId = null;
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    routerState.invalidateStateCache();

    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = 'new-session-with-id';

    try {
      const hookInput = { prompt: 'Fix the login bug' };
      const result = unified.checkRouterModeReset(hookInput);

      assert.strictEqual(result.stateReset, true);

      routerState.invalidateStateCache();
      const newState = routerState.getState();
      assert.strictEqual(newState.sessionId, 'new-session-with-id');
    } finally {
      if (originalSessionId !== undefined) {
        process.env.CLAUDE_SESSION_ID = originalSessionId;
      } else {
        delete process.env.CLAUDE_SESSION_ID;
      }
    }
  });

  it('should NOT flag session boundary when sessionId matches', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const routerState = require('../../.claude/lib/routing/router-state.cjs');

    const sessionId = 'same-session-12345';
    const originalSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = sessionId;

    try {
      routerState.resetToRouterMode();
      routerState.invalidateStateCache();

      routerState.enterAgentMode('Active task in current session');
      routerState.invalidateStateCache();

      const hookInput = { prompt: 'Continue working on the task' };
      const result = unified.checkRouterModeReset(hookInput);

      assert.strictEqual(result.stateReset, true);
      const sessionBoundaryDetected = result.sessionBoundaryDetected || false;
      assert.strictEqual(sessionBoundaryDetected, false);
    } finally {
      if (originalSessionId !== undefined) {
        process.env.CLAUDE_SESSION_ID = originalSessionId;
      } else {
        delete process.env.CLAUDE_SESSION_ID;
      }
    }
  });
});

describe('performance optimizations', () => {
  it('should use shared hook input parsing', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    assert.strictEqual(typeof unified.parseHookInput, 'function', 'Should export parseHookInput');
  });
});

describe('STM writes (UserPromptSubmit)', () => {
  it('should write STM session_current.json (best-effort)', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const os = require('os');

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-stm-'));

    try {
      const result = await unified.runAllChecks(
        { prompt: 'Hello STM', session_id: 'test-session-stm' },
        tmpRoot
      );

      const stmPath = path.join(
        tmpRoot,
        '.claude',
        'context',
        'memory',
        'stm',
        'session_current.json'
      );
      if (result.stmWrite) {
        const exists = await waitForPath(stmPath);
        assert.strictEqual(exists, true, 'STM session_current.json should exist');
        const entry = JSON.parse(fs.readFileSync(stmPath, 'utf8'));
        assert.strictEqual(entry.session_id, 'test-session-stm');
        assert.strictEqual(entry.tier, 'STM');
      }
      // Avoid teardown racing an in-flight best-effort write path.
      await new Promise(resolve => setTimeout(resolve, 60));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('task notification bypass', () => {
  it('should detect task-notification payloads', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const payload = `<task-notification>
<task-id>abc123</task-id>
</task-notification>`;
    assert.strictEqual(unified.isTaskNotificationPrompt(payload), true);
    assert.strictEqual(unified.isTaskNotificationPrompt('normal user prompt'), false);
  });

  it('should skip router mode reset for task notifications', () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const result = unified.checkRouterModeReset({
      prompt: '<task-notification><task-id>abc123</task-id></task-notification>',
    });
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'task_notification');
  });

  it('runAllChecks should short-circuit on task notifications', async () => {
    const unified = require('../../.claude/hooks/routing/user-prompt-unified.cjs');
    const result = await unified.runAllChecks({
      prompt: '<task-notification><task-id>abc123</task-id></task-notification>',
    });
    assert.strictEqual(result.systemNotificationBypass, true);
    assert.strictEqual(result.routerEnforcement.skipped, true);
    assert.strictEqual(result.routerEnforcement.reason, 'task_notification');
  });
});
