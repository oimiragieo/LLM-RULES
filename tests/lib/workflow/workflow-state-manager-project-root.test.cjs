'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_STATE_FILE,
  createWorkflow,
} = require('../../../.claude/lib/workflow/workflow-state-manager.cjs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

test('workflow-state-manager default state file is under PROJECT_ROOT', () => {
  const expected = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'workflow-state.json');
  assert.equal(path.normalize(DEFAULT_STATE_FILE), path.normalize(expected));
});

test('createWorkflow with default path writes state under PROJECT_ROOT runtime dir', () => {
  const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
  const stateFile = path.join(runtimeDir, 'workflow-state.json');

  const previous = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : null;
  try {
    const wfId = createWorkflow('project-root path test', 'LOW');
    assert.ok(typeof wfId === 'string' && wfId.startsWith('wf-'));
    assert.equal(fs.existsSync(stateFile), true);
  } finally {
    if (previous === null) {
      fs.rmSync(stateFile, { force: true });
    } else {
      fs.writeFileSync(stateFile, previous, 'utf8');
    }
  }
});
