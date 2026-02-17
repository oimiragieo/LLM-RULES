'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const routerState = require('../../../.claude/lib/routing/router-state.cjs');
const { detectPlanningRequirement } = require('../../../.claude/hooks/routing/user-prompt-unified.core.cjs');

test('Platform Awareness Rule Injection', async (t) => {
  const statePath = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'router-state.json');
  
  // Clean up existing state
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
  }

  await t.test('should save platform awareness rule to state when planning is detected', () => {
    const prompt = 'Please integrate this github repo: https://github.com/test/repo';
    
    // This call should trigger the injection
    detectPlanningRequirement(prompt);
    
    const state = routerState.getState();
    assert.ok(state.platformAwarenessRule, 'platformAwarenessRule should exist in state');
    assert.ok(state.platformAwarenessRule.includes('YOU ARE ON WINDOWS'), 'Should mention Windows');
    assert.ok(state.platformAwarenessRule.includes('USE NATIVE PATHS'), 'Should mention native paths');
  });
});
