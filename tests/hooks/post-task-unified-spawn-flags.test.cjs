'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  createPostTaskUnifiedHelpers,
} = require('../../.claude/hooks/routing/post-task-unified.helpers.cjs');

function createHelpers(callLog) {
  return createPostTaskUnifiedHelpers({
    fs,
    path,
    getCachedState: () => ({}),
    routerState: {
      markPlannerSpawned() {
        callLog.push('planner');
      },
      markSecuritySpawned() {
        callLog.push('security');
      },
      markArchitectSpawned() {
        callLog.push('architect');
      },
    },
    getMemoryManager: () => null,
    PROJECT_ROOT: __dirname,
    LEARNINGS_PATH: path.join(__dirname, 'tmp-learnings.md'),
    EVOLUTION_STATE_PATH: path.join(__dirname, 'tmp-evolution.json'),
    AUDIT_LOG_PATH: path.join(__dirname, 'tmp-audit.log'),
  });
}

test('runAgentContextTracker marks planner spawns after successful task completion', () => {
  const calls = [];
  const helpers = createHelpers(calls);

  helpers.runAgentContextTracker({
    subagent_type: 'planner',
    prompt: 'You are PLANNER. Design the rollout.',
    description: 'Planner designing rollout',
  });

  assert.deepStrictEqual(calls, ['planner']);
});

test('runAgentContextTracker marks security spawns without misclassifying security-architect as architect', () => {
  const calls = [];
  const helpers = createHelpers(calls);

  helpers.runAgentContextTracker({
    subagent_type: 'security-architect',
    prompt: 'You are SECURITY-ARCHITECT. Review the auth flow.',
    description: 'Security review for auth flow',
  });

  assert.deepStrictEqual(calls, ['security']);
});

test('runAgentContextTracker marks architect spawns after successful task completion', () => {
  const calls = [];
  const helpers = createHelpers(calls);

  helpers.runAgentContextTracker({
    subagent_type: 'architect',
    prompt: 'You are ARCHITECT. Review the refactor plan.',
    description: 'Architect review for refactor plan',
  });

  assert.deepStrictEqual(calls, ['architect']);
});
