#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const workflowUpdater = require('../../.claude/skills/workflow-updater/scripts/main.cjs');

test('workflow-updater resolves core workflow path', () => {
  const result = workflowUpdater.main({ workflow: 'evolution-workflow', trigger: 'evolve' });
  assert.equal(result.ok, true);
  assert.equal(result.target.exists, true);
  assert.match(result.target.workflowPath, /evolution-workflow\.md$/);
});

test('workflow-updater recommends creator for missing workflow', () => {
  const result = workflowUpdater.main({ workflow: 'missing-workflow-xyz' });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'resolve_target');
  assert.match(result.recommendation, /workflow-creator/i);
});
