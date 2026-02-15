#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createReflectionEventHandlers,
} = require('../../.claude/hooks/reflection/unified-reflection-events.cjs');

function buildHandlers(callLog) {
  return createReflectionEventHandlers({
    getToolName: input => input.tool_name,
    getToolInput: input => input.tool_input || {},
    getToolOutput: input => input.tool_output,
    debugLog: () => {},
    routerState: {
      recordTaskUpdate: (taskId, status) => callLog.push(`router:${taskId}:${status}`),
    },
    taskClaimLedger: {
      releaseClaim: (taskId, status) => callLog.push(`claim:${taskId}:${status}`),
    },
    parseAndValidateTaskUpdate: input => ({
      normalized: {
        taskId: String(input?.taskId ?? input?.task_id ?? ''),
        status: String(input?.status ?? '').toLowerCase(),
      },
    }),
    gatherSessionInsights: () => ({}),
    errorSummaryExtractor: null,
    sessionEndEvents: ['SessionEnd', 'Stop'],
    minOutputLength: 50,
  });
}

describe('unified-reflection-events task claim lifecycle wiring', () => {
  it('updates claim heartbeat on non-terminal TaskUpdate status', () => {
    const calls = [];
    const handlers = buildHandlers(calls);

    handlers.handleTaskUpdate({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: 'task-1', status: 'in_progress' },
    });

    assert.deepEqual(calls, ['router:task-1:in_progress', 'claim:task-1:in_progress']);
  });

  it('releases claim on completed TaskUpdate status', () => {
    const calls = [];
    const handlers = buildHandlers(calls);

    handlers.handleTaskCompletion({
      tool_name: 'TaskUpdate',
      tool_input: { taskId: 'task-2', status: 'completed' },
    });

    assert.deepEqual(calls, ['router:task-2:completed', 'claim:task-2:completed']);
  });
});
