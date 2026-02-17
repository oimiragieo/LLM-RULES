'use strict';

const path = require('path');
const corePath = path.resolve(__dirname, '../../.claude/hooks/routing/routing-guard-core.impl.cjs');
const statePath = path.resolve(__dirname, '../../.claude/lib/routing/router-state.cjs');

const { runAllChecks } = require(corePath);
const routerState = require(statePath);
const assert = require('node:assert');
const test = require('node:test');

test('Routing Guard Integration - Checks 1, 5, 7', async t => {
  // Setup: Reset router state before each test
  const resetState = () => {
    routerState.resetToRouterMode();
    routerState.updateState({ taskListCalledSincePrompt: true });
    // Force mode to router for these checks
    process.env.CLAUDE_AGENT_ID = 'router';
    // Force task checks to run in the core impl instead of delegating
    process.env.ROUTING_GUARD_TASK_CHECKS = 'force';
    // Ensure enforcement modes are 'block'
    process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
    process.env.HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT = 'block';
    process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'block';
  };

  await t.test('Check 1: Planner-First enforcement', () => {
    resetState();
    routerState.updateState({ requiresPlannerFirst: true, complexity: 'high' });
    
    // Attempt implementation spawn without planner
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'Implement the feature'
    };
    
    const result = runAllChecks('Task', toolInput, { permission_mode: 'normal' });
    
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.checkName, 'planner-first-guard');
    assert.match(result.message, /Spawn PLANNER first/);
  });

  await t.test('Check 5: Architect-First enforcement for high-risk specialists', () => {
    resetState();
    routerState.updateState({ architectSpawned: false });
    
    // Attempt architect-dependent specialist spawn (devops is in high-risk list)
    const toolInput = {
      subagent_type: 'devops',
      prompt: 'You are a devops agent. Please deploy the system.'
    };
    
    const result = runAllChecks('Task', toolInput, { permission_mode: 'normal' });
    
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.checkName, 'high-risk-specialist-architect-guard');
    assert.match(result.message, /requires architect review first/);
  });

  await t.test('Check 7: Specialist-First Routing Law (Specialist Override)', () => {
    resetState();
    
    // Attempt generic developer spawn for specialist work
    const toolInput = {
      subagent_type: 'developer',
      prompt: 'You are a developer. Please perform a deep security audit of the authentication system.'
    };
    
    const result = runAllChecks('Task', toolInput, { permission_mode: 'normal' });
    
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.checkName, 'specialist-override');
    assert.match(result.message, /Use security-architect agent instead/);
  });
});
