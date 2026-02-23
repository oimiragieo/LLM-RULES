'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runWatchdogOnce } = require('../../../.claude/lib/workflow/workflow-watchdog.cjs');

const TEMP_DIR = path.join(process.cwd(), '.claude', 'context', 'tmp', 'watchdog-test');
const STATE = path.join(TEMP_DIR, 'state.json');
const DLQ = path.join(TEMP_DIR, 'dlq.jsonl');

test('workflow watchdog sweeps exceeded SLA phases', async () => {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const tenMinutesAgoMs = Date.now() - 10 * 60 * 1000;
  const mockState = {
    workflowId: 'wf-watchdog-123',
    status: 'in_progress',
    phases: {
      analysis: {
        status: 'in_progress',
        startedAt: tenMinutesAgoMs,
      },
    },
  };
  fs.writeFileSync(STATE, JSON.stringify(mockState, null, 2), 'utf8');
  if (fs.existsSync(DLQ)) fs.unlinkSync(DLQ);

  const result = await runWatchdogOnce(STATE, DLQ, 5 * 60 * 1000); // 5 min SLA
  assert.strictEqual(result.swept, 1, 'Should have swept 1 phase');

  const rawNewState = fs.readFileSync(STATE, 'utf8');
  const newState = JSON.parse(rawNewState);
  assert.strictEqual(
    newState.phases.analysis.status,
    'BLOCKED_TIMEOUT',
    'State should be mutated to BLOCKED_TIMEOUT'
  );

  const dlqContent = fs.readFileSync(DLQ, 'utf8').trim().split('\n');
  assert.strictEqual(dlqContent.length, 1, 'DLQ should contain 1 log');
  assert.ok(dlqContent[0].includes('BLOCKED_TIMEOUT'), 'DLQ contains blocked reason');

  // Cleanup
  fs.unlinkSync(STATE);
  fs.unlinkSync(DLQ);
});

test('workflow watchdog ignores completed and fresh phases', async () => {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const oneMinuteAgoMs = Date.now() - 60 * 1000;
  const mockState = {
    workflowId: 'wf-watchdog-321',
    status: 'in_progress',
    phases: {
      step1: {
        status: 'completed',
        startedAt: Date.now() - 20 * 60 * 1000,
      },
      step2: {
        status: 'in_progress',
        startedAt: oneMinuteAgoMs,
      },
    },
  };

  fs.writeFileSync(STATE, JSON.stringify(mockState, null, 2), 'utf8');
  if (fs.existsSync(DLQ)) fs.unlinkSync(DLQ);

  const result = await runWatchdogOnce(STATE, DLQ, 5 * 60 * 1000); // 5 min SLA
  assert.strictEqual(result.swept, 0, 'Should have swept 0 phases');

  const rawNewState = fs.readFileSync(STATE, 'utf8');
  const newState = JSON.parse(rawNewState);
  assert.strictEqual(newState.phases.step1.status, 'completed');
  assert.strictEqual(newState.phases.step2.status, 'in_progress');

  // Cleanup
  fs.unlinkSync(STATE);
});
