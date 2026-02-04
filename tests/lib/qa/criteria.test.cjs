'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const {
  saveImplementationPlan,
  loadImplementationPlan,
  isBuildComplete,
  shouldRunQa,
  shouldRunFixes,
  getQaIterationCount,
} = require('../../../.claude/lib/qa/criteria.cjs');

function makePlanDir() {
  const base = path.join(PROJECT_ROOT, '.claude', 'context', 'plans');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, 'test-plan-'));
}

test('criteria loads and saves implementation plan', () => {
  const planDir = makePlanDir();
  const plan = {
    feature: 'Test',
    subtasks: [{ id: 1, status: 'completed' }],
    qa_signoff: { status: 'rejected', qa_session: 1 },
  };
  assert.equal(saveImplementationPlan(planDir, plan), true);
  const loaded = loadImplementationPlan(planDir);
  assert.equal(loaded.feature, 'Test');
});

test('criteria computes build completion and qa flags', () => {
  const planDir = makePlanDir();
  const plan = {
    feature: 'Test',
    subtasks: [{ id: 1, status: 'completed' }],
    qa_signoff: { status: 'rejected', qa_session: 2 },
  };
  saveImplementationPlan(planDir, plan);
  assert.equal(isBuildComplete(planDir), true);
  assert.equal(shouldRunQa(planDir), true);
  assert.equal(shouldRunFixes(planDir), true);
  assert.equal(getQaIterationCount(planDir), 2);
});
