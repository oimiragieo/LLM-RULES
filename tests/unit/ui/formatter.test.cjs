'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createStageBanner,
  createCheckpointBox,
  createProgressBar,
  createStatus,
  createSpawningIndicator,
  createCompletionIndicator,
  createNextUpBlock,
  createErrorBox,
  createStatusTable,
} = require('../../../.claude/lib/ui/formatter.cjs');

test('createStageBanner formats banner with stage name', () => {
  const banner = createStageBanner('PLANNING');
  assert.match(banner, /AGENT-STUDIO/);
  assert.match(banner, /PLANNING/);
  assert.equal(banner.split('\n').length, 3);
});

test('createCheckpointBox formats checkpoint content', () => {
  const box = createCheckpointBox(
    'Verification Required',
    'Please verify the implementation',
    'Type approved or describe issues'
  );
  assert.match(box, /CHECKPOINT: Verification Required/);
  assert.match(box, /Please verify the implementation/);
  assert.match(box, /Type approved or describe issues/);
});

test('createProgressBar renders percentage with segments', () => {
  const bar = createProgressBar(80);
  assert.match(bar, /80%/);
  assert.match(bar, /Progress:/);
});

test('createProgressBar handles 0 and 100 percent', () => {
  assert.match(createProgressBar(0), /0%/);
  assert.match(createProgressBar(100), /100%/);
});

test('createStatus joins symbol and text', () => {
  const status = createStatus('OK', 'Complete');
  assert.equal(status, 'OK  Complete');
});

test('createSpawningIndicator supports parallel list', () => {
  const indicator = createSpawningIndicator('', true, ['planner', 'executor']);
  assert.match(indicator, /Spawning 2 agents in parallel/);
  assert.match(indicator, /planner/);
  assert.match(indicator, /executor/);
});

test('createCompletionIndicator formats completion', () => {
  const indicator = createCompletionIndicator('planner', 'PLAN.md written');
  assert.equal(indicator, '✓ planner complete: PLAN.md written');
});

test('createNextUpBlock includes alternatives', () => {
  const block = createNextUpBlock(
    'Task 2.3',
    'Implement Statusline Hook',
    'Create hook for real-time status display',
    '/execute-plan',
    [{ command: '/verify', description: 'verify implementation' }]
  );
  assert.match(block, /Next Up/);
  assert.match(block, /Task 2.3: Implement Statusline Hook/);
  assert.match(block, /\/execute-plan/);
  assert.match(block, /\/verify/);
});

test('createErrorBox renders error text and resolution', () => {
  const box = createErrorBox('Failed to create plan', 'Check file permissions');
  assert.match(box, /ERROR/);
  assert.match(box, /Failed to create plan/);
  assert.match(box, /To fix:/);
});

test('createStatusTable renders rows', () => {
  const table = createStatusTable([
    { phase: '1', status: '✓', plans: '3/3', progress: '100%' },
    { phase: '2', status: '◆', plans: '1/4', progress: '25%' },
  ]);
  assert.match(table, /\| Phase \| Status \| Plans \| Progress \|/);
  assert.match(table, /\| 1 \| ✓ \| 3\/3 \| 100% \|/);
  assert.match(table, /\| 2 \| ◆ \| 1\/4 \| 25% \|/);
});
