#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const eventBus = require('../../../.claude/lib/events/event-bus.cjs');
const stateManager = require('../../../.claude/lib/workflow/workflow-state-manager.cjs');

test('createWorkflow persists active eventBus trace id', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-trace-'));
  const statePath = path.join(tempRoot, 'workflow-state.json');
  try {
    const traceId = 'trace-workflow-1';
    let workflowId = '';
    const sub = eventBus.on('TASK_CREATED', () => {
      workflowId = stateManager.createWorkflow('trace workflow', 'LOW', statePath);
    }, 100);
    await eventBus.emit(
      'TASK_CREATED',
      {
        type: 'TASK_CREATED',
        taskId: 'task-1',
        subject: 'trace test',
        description: 'trace test',
        traceId,
        timestamp: new Date().toISOString(),
      },
      { mode: 'sequential' }
    );
    eventBus.off(sub);

    assert.ok(workflowId);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.traceId, traceId);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
