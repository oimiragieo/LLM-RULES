'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { WorkflowStateMachine } = require('../../../.claude/lib/workflow/workflow-state-machine.cjs');

test('workflow state persistence avoids direct target writes during persist', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-atomic-persist-'));
  const stateFile = path.join(tmpDir, 'state.json');

  const machine = new WorkflowStateMachine({
    workflowId: 'wf-atomic',
    stateFile,
    initialState: 'pending',
  });

  const originalContent = fs.readFileSync(stateFile, 'utf8');
  const originalWrite = fs.writeFileSync;

  fs.writeFileSync = function patchedWrite(filePath, data, options) {
    if (path.resolve(filePath) === path.resolve(stateFile)) {
      originalWrite.call(fs, filePath, '{"currentState":', options);
      throw new Error('simulated crash during persist');
    }
    return originalWrite.call(fs, filePath, data, options);
  };

  try {
    await machine.transition('running');
  } finally {
    fs.writeFileSync = originalWrite;
  }

  const after = fs.readFileSync(stateFile, 'utf8');
  const parsed = JSON.parse(after);
  assert.equal(parsed.currentState, 'running');
  assert.notEqual(after, originalContent);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
