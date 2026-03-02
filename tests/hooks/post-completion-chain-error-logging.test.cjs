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

function withCapturedStderr(fn) {
  const logs = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk, ..._rest) => {
    logs.push(String(chunk));
    return true;
  };
  return Promise.resolve()
    .then(fn)
    .then(
      result => {
        process.stderr.write = original;
        return { result, logs };
      },
      error => {
        process.stderr.write = original;
        throw error;
      }
    );
}

test('post-completion-chain fail-opens when workflow state file is missing', async () => {
  if (fs.existsSync(WORKFLOW_STATE_FILE)) {
    fs.unlinkSync(WORKFLOW_STATE_FILE);
  }

  const { result } = await withCapturedStderr(() =>
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

  // Source silently returns pass-through when workflow state file is missing
  assert.deepEqual(result, { result: {} });
});

test('post-completion-chain logs invalid workflow JSON via auditLog and returns pass-through', async () => {
  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, '{invalid-json', 'utf8');

  try {
    const { logs, result } = await withCapturedStderr(() =>
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
    // auditLog writes structured JSON to stderr
    assert.ok(logs.some(line => line.includes('Invalid workflow state file')));
  } finally {
    if (fs.existsSync(WORKFLOW_STATE_FILE)) fs.unlinkSync(WORKFLOW_STATE_FILE);
  }
});
