'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  formatStatusline,
  buildContextBar,
  getCurrentTask,
  truncate,
} = require('../../../.claude/hooks/statusline.cjs');

function withEnv(vars, fn) {
  const original = {};
  Object.keys(vars).forEach(key => {
    original[key] = process.env[key];
    process.env[key] = vars[key];
  });
  try {
    fn();
  } finally {
    Object.keys(vars).forEach(key => {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    });
  }
}

test('buildContextBar returns empty for missing percentage', () => {
  assert.equal(buildContextBar(null), '');
  assert.equal(buildContextBar(undefined), '');
});

test('truncate shortens long text', () => {
  const value = truncate('a'.repeat(50), 10);
  assert.equal(value.length, 10);
  assert.match(value, /\.\.\.$/);
});

test('formatStatusline includes model and directory', () => {
  const tmpState = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-state-'));
  withEnv({ STATUSLINE_STATE_DIR: tmpState, NO_COLOR: '1' }, () => {
    const payload = {
      model: { display_name: 'Claude Sonnet' },
      workspace: { current_dir: '/test/project' },
      context_window: { remaining_percentage: 75 },
    };
    const line = formatStatusline(payload);
    assert.match(line, /Claude Sonnet/);
    assert.match(line, /project/);
  });
});

test('formatStatusline includes current task when state file exists', () => {
  const tmpState = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-state-'));
  const stateFile = path.join(tmpState, 'current-task.json');
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ currentTask: 'Implement statusline hook' }, null, 2)
  );
  withEnv({ STATUSLINE_STATE_DIR: tmpState, NO_COLOR: '1' }, () => {
    const payload = {
      model: { display_name: 'Claude Sonnet' },
      workspace: { current_dir: '/test/project' },
    };
    const line = formatStatusline(payload);
    assert.match(line, /Implement statusline hook/);
  });
});

test('getCurrentTask reads state file when available', () => {
  const tmpState = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-state-'));
  const stateFile = path.join(tmpState, 'current-task.json');
  fs.writeFileSync(stateFile, JSON.stringify({ currentTask: 'Task from state' }, null, 2));
  withEnv({ STATUSLINE_STATE_DIR: tmpState }, () => {
    const task = getCurrentTask('');
    assert.equal(task, 'Task from state');
  });
});

test('formatStatusline returns empty string on invalid payload', () => {
  assert.equal(formatStatusline(null), '');
  assert.equal(formatStatusline('invalid'), '');
});
