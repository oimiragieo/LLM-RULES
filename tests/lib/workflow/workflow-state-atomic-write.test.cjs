'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workflowStateManager = require('../../../.claude/lib/workflow/workflow-state-manager.cjs');

test('workflow-state-manager writes valid JSON and avoids partial target writes on simulated failure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-state-atomic-'));
  const stateFile = path.join(tmpDir, 'workflow-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ workflowId: 'before' }, null, 2), 'utf8');

  const originalWrite = fs.writeFileSync;
  fs.writeFileSync = function patchedWrite(filePath, data, options) {
    // Simulate a crash if code writes directly to target state file.
    if (path.resolve(filePath) === path.resolve(stateFile)) {
      originalWrite.call(fs, filePath, '{"workflowId":"corrupted"', options);
      throw new Error('simulated mid-write crash');
    }
    return originalWrite.call(fs, filePath, data, options);
  };

  try {
    const id = workflowStateManager.createWorkflow('atomic path', 'LOW', stateFile);
    assert.ok(typeof id === 'string' && id.startsWith('wf-'));
  } finally {
    fs.writeFileSync = originalWrite;
  }

  const content = fs.readFileSync(stateFile, 'utf8');
  const parsed = JSON.parse(content);
  assert.ok(parsed.workflowId);
  assert.ok(parsed.currentPhase);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
