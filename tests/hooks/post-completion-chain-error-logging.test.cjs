#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  processTaskCompletion,
  WORKFLOW_STATE_FILE,
} = require('../../.claude/hooks/workflow/post-completion-chain.cjs');

function withCapturedConsoleError(fn) {
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.map(String).join(' '));
  return Promise.resolve()
    .then(fn)
    .then(
      result => {
        console.error = original;
        return { result, logs };
      },
      error => {
        console.error = original;
        throw error;
      }
    );
}

test('post-completion-chain logs and fail-opens when workflow state file is missing', async () => {
  if (fs.existsSync(WORKFLOW_STATE_FILE)) {
    fs.unlinkSync(WORKFLOW_STATE_FILE);
  }

  const { logs, result } = await withCapturedConsoleError(() =>
    processTaskCompletion({
      toolUse: {
        tool: 'TaskUpdate',
        input: {
          taskId: 'task-missing-state',
          status: 'completed',
          metadata: { summary: 'done' },
        },
      },
    })
  );

  assert.deepEqual(result, { result: {} });
  assert.ok(logs.some(line => line.includes('No workflow state file found')));
});

test('post-completion-chain logs invalid workflow JSON and returns pass-through', async () => {
  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, '{invalid-json', 'utf8');

  try {
    const { logs, result } = await withCapturedConsoleError(() =>
      processTaskCompletion({
        toolUse: {
          tool: 'TaskUpdate',
          input: {
            taskId: 'task-invalid-state',
            status: 'completed',
            metadata: { summary: 'done' },
          },
        },
      })
    );

    assert.deepEqual(result, { result: {} });
    assert.ok(logs.some(line => line.includes('Invalid workflow state file')));
  } finally {
    if (fs.existsSync(WORKFLOW_STATE_FILE)) fs.unlinkSync(WORKFLOW_STATE_FILE);
  }
});
