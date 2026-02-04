'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const {
  recordIteration,
  getIterationHistory,
  hasRecurringIssues,
  getRecurringIssueSummary,
  escalateToHuman,
} = require('../../../.claude/lib/qa/report.cjs');

function makePlanDir() {
  const base = path.join(PROJECT_ROOT, '.claude', 'context', 'plans');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, 'qa-report-'));
}

test('report records and reads iteration history', () => {
  const planDir = makePlanDir();
  assert.equal(recordIteration(planDir, 'rejected', ['Issue A']), true);
  const history = getIterationHistory(planDir);
  assert.equal(history.length, 1);
  assert.equal(history[0].verdict, 'rejected');
});

test('report detects recurring issues', () => {
  const planDir = makePlanDir();
  recordIteration(planDir, 'rejected', ['Issue A']);
  recordIteration(planDir, 'rejected', ['Issue A']);
  recordIteration(planDir, 'rejected', ['Issue A']);
  assert.equal(hasRecurringIssues(planDir, 3), true);
  const summary = getRecurringIssueSummary(planDir, 2);
  assert.equal(summary[0].issue, 'Issue A');
});

test('report escalation writes file', () => {
  const planDir = makePlanDir();
  const filePath = escalateToHuman(planDir, 'Too many failures');
  assert.ok(filePath);
  assert.equal(fs.existsSync(filePath), true);
});
