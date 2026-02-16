'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const contracts = require('../../../.claude/lib/runtime/state-contracts.cjs');

function mkTempJson(initialContent = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-contracts-'));
  const file = path.join(dir, 'state.json');
  if (initialContent !== null) {
    fs.writeFileSync(file, initialContent, 'utf8');
  }
  return { dir, file };
}

test('readRouterStateFile returns defaults on invalid JSON', () => {
  const { dir, file } = mkTempJson('{bad');
  try {
    const fallback = { mode: 'router', taskSpawned: false, version: 0 };
    const state = contracts.readRouterStateFile(file, fallback);
    assert.deepEqual(state, fallback);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readRouterStateFile returns merged validated state on valid JSON', () => {
  const { dir, file } = mkTempJson(
    JSON.stringify({ mode: 'agent', taskSpawned: true, version: 3, unknown: 'ok' })
  );
  try {
    const fallback = { mode: 'router', taskSpawned: false, version: 0 };
    const state = contracts.readRouterStateFile(file, fallback);
    assert.equal(state.mode, 'agent');
    assert.equal(state.taskSpawned, true);
    assert.equal(state.version, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readWorkflowStateFile returns null for invalid workflow shape', () => {
  const { dir, file } = mkTempJson(JSON.stringify({ nope: true }));
  try {
    const state = contracts.readWorkflowStateFile(file, null);
    assert.equal(state, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readWorkflowStateFile accepts valid workflow state', () => {
  const { dir, file } = mkTempJson(
    JSON.stringify({
      workflowId: 'wf-test',
      currentPhase: 'PHASE_1_DESIGN',
      phases: {
        PHASE_1_DESIGN: {
          status: 'in_progress',
          agents: {
            planner: { taskId: '1', status: 'in_progress' },
          },
        },
      },
    })
  );
  try {
    const state = contracts.readWorkflowStateFile(file, null);
    assert.ok(state);
    assert.equal(state.workflowId, 'wf-test');
    assert.equal(state.currentPhase, 'PHASE_1_DESIGN');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readPhaseAdvanceFile returns null for invalid shape', () => {
  const { dir, file } = mkTempJson(JSON.stringify({ workflowId: 'wf' }));
  try {
    const state = contracts.readPhaseAdvanceFile(file, null);
    assert.equal(state, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readPhaseAdvanceFile accepts valid signal shape', () => {
  const { dir, file } = mkTempJson(
    JSON.stringify({
      workflowId: 'wf-test',
      advanceTo: 'PHASE_2_IMPLEMENT',
      previousPhase: 'PHASE_1_DESIGN',
      gatePassed: true,
      timestamp: new Date().toISOString(),
    })
  );
  try {
    const signal = contracts.readPhaseAdvanceFile(file, null);
    assert.ok(signal);
    assert.equal(signal.workflowId, 'wf-test');
    assert.equal(signal.advanceTo, 'PHASE_2_IMPLEMENT');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
