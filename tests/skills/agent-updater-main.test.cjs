#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const agentUpdater = require('../../.claude/skills/agent-updater/scripts/main.cjs');

test('agent-updater resolves existing agent and computes risk', () => {
  const result = agentUpdater.main({
    agent: 'reflection-agent',
    trigger: 'reflection',
    changes: 'update tools and security hooks',
  });

  assert.equal(result.ok, true);
  assert.equal(result.target.exists, true);
  assert.equal(result.risk, 'high');
});

test('agent-updater recommends creator for missing target', () => {
  const result = agentUpdater.main({ agent: 'no-agent-xyz' });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'resolve_target');
  assert.match(result.recommendation, /agent-creator/i);
});

test('agent-updater patch plan includes orchestrator routing docs when target is orchestrator', () => {
  const result = agentUpdater.main({
    agent: 'artifact-integrator',
    changes: 'tighten routing and orchestration protocol',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.patchPlan.orchestratorRequiredFiles, [
    '.claude/CLAUDE.md',
    '.claude/workflows/core/router-decision.md',
    '.claude/workflows/core/ecosystem-creation-workflow.md',
  ]);
});
