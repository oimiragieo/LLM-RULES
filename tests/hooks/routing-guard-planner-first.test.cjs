'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmpDir = path.join(os.tmpdir(), `routing-guard-test-${Date.now()}`);
const stateFile = path.join(tmpDir, 'router-state.json');

// Set environment variables before requiring modules
process.env.ROUTER_STATE_FILE = stateFile;
process.env.PLANNER_FIRST_ENFORCEMENT = 'block';

const routerState = require('../../.claude/lib/routing/router-state.cjs');
const { checkPlannerFirst } = require('../../.claude/hooks/routing/routing-guard-core.checks-task.cjs');

describe('Routing Guard Integration - Check 1: Planner First', () => {
  
  before(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should block non-planner spawn when complexity is high and planner not spawned', () => {
    // Setup state
    routerState.resetToRouterMode();
    routerState.setComplexity('high');
    routerState.invalidateStateCache();

    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Implement the auth system.',
      description: 'Implementing auth'
    };

    const result = checkPlannerFirst('Task', toolInput);
    
    assert.strictEqual(result.pass, false, 'Should block developer for high complexity task');
    assert.match(result.message, /\[PLANNER-FIRST VIOLATION\]/, 'Error message should mention planner-first violation');
  });

  test('should allow planner spawn even if complexity is high', () => {
    // Setup state
    routerState.resetToRouterMode();
    routerState.setComplexity('high');
    routerState.invalidateStateCache();

    const toolInput = {
      subagent_type: 'planner',
      prompt: 'You are planner. Design the auth system.',
      description: 'Planning auth'
    };

    const result = checkPlannerFirst('Task', toolInput);
    
    assert.strictEqual(result.pass, true, 'Should allow planner for high complexity task');
    assert.strictEqual(result.markPlanner, true, 'Should indicate that planner is being spawned');
  });

  test('should allow non-planner spawn if planner was already spawned', () => {
    // Setup state
    routerState.resetToRouterMode();
    routerState.setComplexity('high');
    routerState.markPlannerSpawned();
    routerState.invalidateStateCache();

    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Implement the auth system.',
      description: 'Implementing auth'
    };

    const result = checkPlannerFirst('Task', toolInput);
    
    assert.strictEqual(result.pass, true, 'Should allow developer if planner was already spawned');
  });

  test('should allow non-planner spawn if complexity is trivial', () => {
    // Setup state
    routerState.resetToRouterMode();
    routerState.setComplexity('trivial');
    routerState.invalidateStateCache();

    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are developer. Fix a typo in README.',
      description: 'Fixing typo'
    };

    const result = checkPlannerFirst('Task', toolInput);
    
    assert.strictEqual(result.pass, true, 'Should allow developer for trivial task');
  });
});
