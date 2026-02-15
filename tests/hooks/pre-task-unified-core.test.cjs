#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { clearAllCache } = require('../../.claude/lib/utils/state-cache.cjs');
const routerState = require('../../.claude/lib/routing/router-state.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const preTaskUnified = require('../../.claude/hooks/routing/pre-task-unified.cjs');
const ROUTER_STATE_FILE = routerState.STATE_FILE;
const LOOP_STATE_FILE = preTaskUnified.LOOP_STATE_FILE;
const TASKLIST_LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'tasklist-first-loop-state.json'
);
const PLANNER_LOOP_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'planner-first-loop-state.json'
);
const TOOL_GOVERNANCE_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'tool-governance-state.json'
);

function backupState(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
}

function restoreState(filePath, content) {
  if (content === null) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

function writeState(filePath, state) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

describe('pre-task-unified exports and context tracker', () => {
  let routerStateBackup = null;
  let loopStateBackup = null;
  let tasklistLoopStateBackup = null;
  let plannerLoopStateBackup = null;
  let governanceStateBackup = null;
  let originalEnv = {};

  beforeEach(() => {
    clearAllCache();
    routerStateBackup = backupState(ROUTER_STATE_FILE);
    loopStateBackup = backupState(LOOP_STATE_FILE);
    tasklistLoopStateBackup = backupState(TASKLIST_LOOP_STATE_FILE);
    plannerLoopStateBackup = backupState(PLANNER_LOOP_STATE_FILE);
    governanceStateBackup = backupState(TOOL_GOVERNANCE_STATE_FILE);
    originalEnv = { ...process.env };
    preTaskUnified.invalidateCachedState();
  });

  afterEach(() => {
    restoreState(ROUTER_STATE_FILE, routerStateBackup);
    restoreState(LOOP_STATE_FILE, loopStateBackup);
    restoreState(TASKLIST_LOOP_STATE_FILE, tasklistLoopStateBackup);
    restoreState(PLANNER_LOOP_STATE_FILE, plannerLoopStateBackup);
    restoreState(TOOL_GOVERNANCE_STATE_FILE, governanceStateBackup);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    preTaskUnified.invalidateCachedState();
    clearAllCache();
  });

  it('should export expected consolidated functions', () => {
    assert.strictEqual(typeof preTaskUnified.runAllChecks, 'function');
    assert.strictEqual(typeof preTaskUnified.checkAgentContextPreTracker, 'function');
    assert.strictEqual(typeof preTaskUnified.checkRoutingGuard, 'function');
    assert.strictEqual(typeof preTaskUnified.checkLoopPrevention, 'function');
    assert.strictEqual(typeof preTaskUnified.main, 'function');
  });

  it('should always pass context pre-tracker and set agent mode', () => {
    writeState(ROUTER_STATE_FILE, { mode: 'router', taskSpawned: false });
    const result = preTaskUnified.checkAgentContextPreTracker({
      tool_name: 'Task',
      tool_input: {
        prompt: 'You are DEVELOPER. Fix the bug.',
        description: 'Developer fixing login bug',
      },
    });
    assert.strictEqual(result.pass, true);
  });

  it('should pass context pre-tracker with prompt-only task descriptions', () => {
    const result = preTaskUnified.checkAgentContextPreTracker({
      tool_name: 'Task',
      tool_input: { prompt: 'You are DEVELOPER. Fix the login bug in authentication module.' },
    });
    assert.strictEqual(result.pass, true);
  });

  it('should block Task when no recent core memory read evidence exists', () => {
    writeState(ROUTER_STATE_FILE, {
      mode: 'router',
      requiresPlannerFirst: false,
      plannerSpawned: false,
      requiresSecurityReview: false,
      taskListCalledSincePrompt: true,
    });
    process.env.CLAUDE_SESSION_ID = `memory-block-${Date.now()}`;
    process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';

    restoreState(TOOL_GOVERNANCE_STATE_FILE, null);
    const result = preTaskUnified.runAllChecks({
      tool_name: 'Task',
      tool_input: {
        prompt: 'You are DEVELOPER. Implement a small fix.',
      },
    });

    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.exitCode, 2);
    assert.ok(String(result.message || '').includes('[MEMORY-FIRST]'));
  });

  it('should allow Task when recent core memory read evidence exists', () => {
    const sessionId = `memory-allow-${Date.now()}`;
    writeState(ROUTER_STATE_FILE, {
      mode: 'router',
      requiresPlannerFirst: false,
      plannerSpawned: false,
      requiresSecurityReview: false,
      taskListCalledSincePrompt: true,
    });
    process.env.CLAUDE_SESSION_ID = sessionId;
    process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';

    writeState(TOOL_GOVERNANCE_STATE_FILE, {
      sessions: {
        [sessionId]: {
          lastCoreMemoryReadAt: Date.now(),
          lastCoreMemoryReadPath: '.claude/context/memory/decisions.md',
          lastSeenAt: Date.now(),
        },
      },
    });

    const result = preTaskUnified.runAllChecks({
      tool_name: 'Task',
      tool_input: {
        task_id: 'task-123',
        prompt: 'You are DEVELOPER. Implement a small fix.',
      },
    });

    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.exitCode, 0);
  });
});
