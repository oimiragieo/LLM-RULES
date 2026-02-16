'use strict';

const assert = require('assert');
const test = require('node:test');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  checkPlannerFirst,
  checkHighRiskSpecialistArchitectReview,
  checkSpecialistOverride,
} = require('../../.claude/hooks/routing/routing-guard-core.checks-task.cjs');

const routerState = require('../../.claude/lib/routing/router-state.cjs');

test('Routing Guard Core Comprehensive', async t => {
  const prevPlannerEnforcement = process.env.PLANNER_FIRST_ENFORCEMENT;
  const prevHighRiskEnforcement = process.env.HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT;
  const prevSpecialistEnforcement = process.env.SPECIALIST_ROUTING_ENFORCEMENT;

  process.env.PLANNER_FIRST_ENFORCEMENT = 'block';
  process.env.HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT = 'block';
  process.env.SPECIALIST_ROUTING_ENFORCEMENT = 'block';

  // Setup temp state file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-guard-test-'));
  const stateFile = path.join(tmpDir, 'router-state.json');
  process.env.ROUTER_STATE_FILE = stateFile;

  // Ensure we start with a clean state cache
  routerState.invalidateStateCache();

  // Helper to set state
  const setState = updates => {
    const current = routerState.getState();
    const newState = { ...current, ...updates };
    fs.writeFileSync(stateFile, JSON.stringify(newState));
    routerState.invalidateStateCache();

    // Also clear the cache in routing-guard-core.shared.cjs if possible
    // But since we can't easily access the internal cache there, we rely on
    // invalidating the router-state cache and hoping getCachedRouterState refreshes.
    // routing-guard-core.shared.cjs has _cachedRouterState. We need to clear it.
    const shared = require('../../.claude/hooks/routing/routing-guard-core.shared.cjs');
    shared.invalidateCachedState();
  };

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ROUTER_STATE_FILE;
    if (prevPlannerEnforcement === undefined) delete process.env.PLANNER_FIRST_ENFORCEMENT;
    else process.env.PLANNER_FIRST_ENFORCEMENT = prevPlannerEnforcement;
    if (prevHighRiskEnforcement === undefined)
      delete process.env.HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT;
    else process.env.HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT = prevHighRiskEnforcement;
    if (prevSpecialistEnforcement === undefined) delete process.env.SPECIALIST_ROUTING_ENFORCEMENT;
    else process.env.SPECIALIST_ROUTING_ENFORCEMENT = prevSpecialistEnforcement;
  });

  await t.test('Check 1: Planner First Enforcement (HIGH complexity)', async () => {
    setState({
      complexity: 'high',
      requiresPlannerFirst: true,
      plannerSpawned: false,
    });

    const result = checkPlannerFirst('Task', {
      subagent_type: 'developer',
      prompt: 'do complex work',
    });

    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.result, 'block');
    assert.match(result.message, /PLANNER-FIRST VIOLATION/);
  });

  await t.test('Check 1: Planner First Allowed if Planner Spawned', async () => {
    setState({
      complexity: 'high',
      requiresPlannerFirst: true,
      plannerSpawned: true,
    });

    const result = checkPlannerFirst('Task', {
      subagent_type: 'developer',
      prompt: 'do complex work',
    });

    assert.strictEqual(result.pass, true);
  });

  await t.test('Check 5: High Risk Specialist Architect Review', async () => {
    setState({
      architectSpawned: false,
    });

    // devops-troubleshooter is in HIGH_RISK_SPECIALISTS_REQUIRING_ARCHITECT
    const result = checkHighRiskSpecialistArchitectReview('Task', {
      subagent_type: 'devops-troubleshooter',
      prompt: 'debug production outage',
    });

    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.result, 'block');
    assert.match(result.message, /ARCH-002/);
  });

  await t.test('Check 7: Specialist Override', async () => {
    // "update docs" should trigger technical-writer
    const result = checkSpecialistOverride('Task', {
      subagent_type: 'developer', // or implicitly developer via prompt
      prompt: 'You are a developer. update documentation for the API',
    });

    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.result, 'block');
    assert.match(result.message, /SPECIALIST-OVERRIDE/);
    assert.match(result.message, /technical-writer/);
  });
});
