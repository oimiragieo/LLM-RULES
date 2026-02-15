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

describe('pre-task-unified loop-breakers and exit codes', () => {
  let routerStateBackup = null;
  let loopStateBackup = null;
  let tasklistLoopStateBackup = null;
  let plannerLoopStateBackup = null;
  let originalEnv = {};

  beforeEach(() => {
    clearAllCache();
    routerStateBackup = backupState(ROUTER_STATE_FILE);
    loopStateBackup = backupState(LOOP_STATE_FILE);
    tasklistLoopStateBackup = backupState(TASKLIST_LOOP_STATE_FILE);
    plannerLoopStateBackup = backupState(PLANNER_LOOP_STATE_FILE);
    originalEnv = { ...process.env };
    preTaskUnified.invalidateCachedState();
  });

  afterEach(() => {
    restoreState(ROUTER_STATE_FILE, routerStateBackup);
    restoreState(LOOP_STATE_FILE, loopStateBackup);
    restoreState(TASKLIST_LOOP_STATE_FILE, tasklistLoopStateBackup);
    restoreState(PLANNER_LOOP_STATE_FILE, plannerLoopStateBackup);

    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);

    preTaskUnified.invalidateCachedState();
    clearAllCache();
  });

  describe('TaskList-first loop-breaker', () => {
    it('should bypass TaskList-first enforcement in bypassPermissions mode', () => {
      process.env.CLAUDE_SESSION_ID = 'tasklist-bypass-test';
      process.env.TASKLIST_FIRST_ENFORCEMENT = 'block';
      writeState(ROUTER_STATE_FILE, { mode: 'router', taskListCalledSincePrompt: false });

      const result = preTaskUnified.checkTaskListFirst('Task', {
        session_id: 'tasklist-bypass-test',
        permission_mode: 'bypassPermissions',
      });
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, undefined);
    });

    it('should warn-allow by default when TASKLIST_FIRST_ENFORCEMENT is unset', () => {
      process.env.CLAUDE_SESSION_ID = 'tasklist-default-warn-test';
      delete process.env.TASKLIST_FIRST_ENFORCEMENT;
      writeState(ROUTER_STATE_FILE, { mode: 'router', taskListCalledSincePrompt: false });
      const result = preTaskUnified.checkTaskListFirst('Task', {
        session_id: 'tasklist-default-warn-test',
      });
      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.result, 'warn');
      assert.ok(result.message.includes('TaskList() must be called before Task()'));
      preTaskUnified.clearTaskListFirstViolation('tasklist-default-warn-test');
    });

    it('should block initial TaskList-first violations, then warn-allow repeated loops', () => {
      process.env.CLAUDE_SESSION_ID = 'tasklist-loop-test';
      process.env.TASKLIST_FIRST_ENFORCEMENT = 'block';
      writeState(ROUTER_STATE_FILE, { mode: 'router', taskListCalledSincePrompt: false });

      const first = preTaskUnified.checkTaskListFirst('Task', { session_id: 'tasklist-loop-test' });
      const second = preTaskUnified.checkTaskListFirst('Task', {
        session_id: 'tasklist-loop-test',
      });
      const third = preTaskUnified.checkTaskListFirst('Task', { session_id: 'tasklist-loop-test' });

      assert.strictEqual(first.pass, false);
      assert.strictEqual(second.pass, false);
      assert.strictEqual(third.pass, true);
      assert.strictEqual(third.result, 'warn');
      assert.ok(third.message.includes('LOOP-BREAKER'));
      preTaskUnified.clearTaskListFirstViolation('tasklist-loop-test');
    });
  });

  describe('Planner-first loop-breaker', () => {
    it('allows Task spawn after threshold violations in window', () => {
      process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
      process.env.PLANNER_FIRST_LOOP_BREAKER_THRESHOLD = '3';
      process.env.PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS = '60000';
      process.env.CLAUDE_SESSION_ID = 'planner-loop-allow';

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
      });

      const first = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });
      const second = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });
      const third = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });

      assert.strictEqual(first.pass, false);
      assert.strictEqual(second.pass, false);
      assert.strictEqual(third.pass, true);
      assert.strictEqual(third.result, 'warn');
      assert.ok(third.message.includes('LOOP-BREAKER'));
    });

    it('blocks until threshold when enforcement is block', () => {
      process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
      process.env.PLANNER_FIRST_LOOP_BREAKER_THRESHOLD = '4';
      process.env.PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS = '60000';
      process.env.CLAUDE_SESSION_ID = 'planner-loop-block';
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
      });

      const first = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });
      const second = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });
      const third = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });

      assert.strictEqual(first.pass, false);
      assert.strictEqual(second.pass, false);
      assert.strictEqual(third.pass, false);
      assert.strictEqual(third.result, 'block');
      assert.ok(third.message.includes('PLANNER-FIRST VIOLATION'));
    });

    it('resets count when planner is spawned', () => {
      process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
      process.env.PLANNER_FIRST_LOOP_BREAKER_THRESHOLD = '2';
      process.env.PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS = '60000';
      process.env.CLAUDE_SESSION_ID = 'planner-loop-reset';

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
      });

      const blockOnce = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });
      assert.strictEqual(blockOnce.pass, false);

      const plannerSpawn = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are planner. design the complex feature.',
      });
      assert.strictEqual(plannerSpawn.pass, true);

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
      });

      const afterReset = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });
      assert.strictEqual(afterReset.pass, false);
      assert.strictEqual(afterReset.result, 'block');
    });

    it('respects threshold env override', () => {
      process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
      process.env.PLANNER_FIRST_LOOP_BREAKER_THRESHOLD = '2';
      process.env.PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS = '60000';
      process.env.CLAUDE_SESSION_ID = 'planner-loop-threshold';

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
      });

      const first = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });
      const second = preTaskUnified.checkRoutingGuard('Task', {
        prompt: 'You are developer. implement complex feature.',
      });

      assert.strictEqual(first.pass, false);
      assert.strictEqual(second.pass, true);
      assert.strictEqual(second.result, 'warn');
      assert.ok(second.message.includes('LOOP-BREAKER'));
    });

    it('uses stable env session id for loop-breaker when hook session ids vary', () => {
      process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
      process.env.PLANNER_FIRST_LOOP_BREAKER_THRESHOLD = '2';
      process.env.PLANNER_FIRST_LOOP_BREAKER_WINDOW_MS = '60000';
      process.env.CLAUDE_SESSION_ID = 'planner-loop-stable-env';

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
      });

      const first = preTaskUnified.checkRoutingGuard(
        'Task',
        { prompt: 'You are developer. implement complex feature.' },
        { session_id: 'ephemeral-1' }
      );
      const second = preTaskUnified.checkRoutingGuard(
        'Task',
        { prompt: 'You are developer. implement complex feature.' },
        { session_id: 'ephemeral-2' }
      );

      assert.strictEqual(first.pass, false);
      assert.strictEqual(second.pass, true);
      assert.strictEqual(second.result, 'warn');
      assert.ok(second.message.includes('LOOP-BREAKER'));
    });
  });

  describe('exit codes', () => {
    it('should return exit code 0 when all checks pass', () => {
      process.env.TASKLIST_FIRST_ENFORCEMENT = 'off';
      process.env.PLANNER_FIRST_ENFORCEMENT = 'off';
      process.env.SECURITY_REVIEW_ENFORCEMENT = 'off';
      process.env.LOOP_PREVENTION_MODE = 'off';

      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: false,
        taskListCalledSincePrompt: true,
      });
      writeState(LOOP_STATE_FILE, { spawnDepth: 0, actionHistory: [] });

      const result = preTaskUnified.runAllChecks({
        tool_name: 'Task',
        tool_input: { prompt: 'You are DEVELOPER. Fix a bug.' },
      });

      assert.strictEqual(result.pass, true);
      assert.strictEqual(result.exitCode, 0);
    });

    it('should return exit code 2 when check fails in block mode', () => {
      writeState(ROUTER_STATE_FILE, {
        mode: 'router',
        requiresPlannerFirst: true,
        plannerSpawned: false,
        complexity: 'high',
        taskListCalledSincePrompt: true,
      });

      const result = preTaskUnified.runAllChecks({
        tool_name: 'Task',
        tool_input: { prompt: 'You are DEVELOPER.' },
      });
      assert.strictEqual(result.pass, false);
      assert.strictEqual(result.exitCode, 2);
    });
  });
});
