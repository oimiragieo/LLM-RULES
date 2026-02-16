#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  WorkflowStateMachine,
} = require('../../../.claude/lib/workflow/workflow-state-machine.cjs');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-state-machine-json-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('initializes with defaults when persisted state file is malformed JSON', async () => {
  await withTempDir(async tmpDir => {
    const stateFile = path.join(tmpDir, 'state.json');
    fs.writeFileSync(stateFile, '{bad json', 'utf8');

    const machine = new WorkflowStateMachine({
      workflowId: 'wf-malformed-init',
      stateFile,
      initialState: 'pending',
    });

    assert.strictEqual(await machine.getCurrentState(), 'pending');
  });
});

test('ignores malformed child state files when aggregating progress', async () => {
  await withTempDir(async tmpDir => {
    const parentFile = path.join(tmpDir, 'parent.json');
    const childFile = path.join(tmpDir, 'child-bad.json');

    const machine = new WorkflowStateMachine({
      workflowId: 'wf-parent',
      stateFile: parentFile,
      initialState: 'pending',
    });

    machine.children.push({ workflowId: 'child-bad', stateFile: childFile });
    fs.writeFileSync(childFile, '{bad json', 'utf8');

    const progress = await machine.getAggregatedProgress();
    assert.strictEqual(progress, 0);
  });
});
