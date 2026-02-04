'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const { save, createMinimal } = require('../../../.claude/lib/plan/implementation-plan.cjs');
const {
  isBuildComplete,
  countSubtasks,
  countCompletedSubtasks,
  getNextSubtask,
} = require('../../../.claude/lib/plan/progress.cjs');

function makePlanDir() {
  const base = path.join(PROJECT_ROOT, '.claude', 'context', 'plans');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, 'progress-'));
}

test('progress helpers report completion', () => {
  const planDir = makePlanDir();
  const plan = createMinimal('Feature Y');
  plan.subtasks = [
    { id: 1, status: 'completed' },
    { id: 2, status: 'pending' },
  ];
  save(planDir, plan);
  assert.equal(countSubtasks(planDir), 2);
  assert.equal(countCompletedSubtasks(planDir), 1);
  assert.equal(isBuildComplete(planDir), false);
  assert.equal(getNextSubtask(planDir).id, 2);
});
