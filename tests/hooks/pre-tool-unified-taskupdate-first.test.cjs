const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  checkTaskUpdateFirst,
  readTaskUpdateFirstState,
} = require('../../.claude/hooks/routing/pre-tool-unified.cjs');

describe('pre-tool-unified taskupdate-first guard', () => {
  function withTempStateFile(fn) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskupdate-first-'));
    const stateFile = path.join(tempDir, 'state.json');
    const priorMode = process.env.TASKUPDATE_FIRST_ENFORCEMENT;
    process.env.TASKUPDATE_FIRST_ENFORCEMENT = 'block';
    try {
      fn(stateFile);
    } finally {
      if (priorMode == null) {
        delete process.env.TASKUPDATE_FIRST_ENFORCEMENT;
      } else {
        process.env.TASKUPDATE_FIRST_ENFORCEMENT = priorMode;
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  test('blocks agent tool calls before TaskUpdate(in_progress)', () => {
    withTempStateFile(stateFile => {
      const hookInput = {
        session_id: 'session-1',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Bash'],
      };

      const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo hello' }, stateFile);
      assert.equal(result.action, 'block');
      assert.match(result.message, /TaskUpdate\(\{ taskId, status: "in_progress" \}\)/);
    });
  });

  test('allows subsequent tool calls after TaskUpdate(in_progress)', () => {
    withTempStateFile(stateFile => {
      const hookInput = {
        session_id: 'session-2',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Bash'],
      };

      const first = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: 'task-2', status: 'in_progress' },
        stateFile
      );
      assert.equal(first.action, 'allow');

      const next = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo ok' }, stateFile);
      assert.equal(next.action, 'allow');

      const state = readTaskUpdateFirstState(stateFile);
      assert.equal(state.sessions['session-2'].inProgress, true);
      assert.equal(state.sessions['session-2'].taskId, 'task-2');
    });
  });

  test('warn mode allows but returns warning payload', () => {
    withTempStateFile(stateFile => {
      process.env.TASKUPDATE_FIRST_ENFORCEMENT = 'warn';
      const hookInput = {
        session_id: 'session-3',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
      };

      const result = checkTaskUpdateFirst(hookInput, 'Read', { file_path: 'README.md' }, stateFile);
      assert.equal(result.action, 'allow');
      assert.match(result.warning || '', /TASKUPDATE-FIRST/);
    });
  });

  test('skips enforcement for non-agent scoped sessions', () => {
    withTempStateFile(stateFile => {
      const hookInput = {
        session_id: 'session-4',
        allowed_tools: ['Read', 'Bash'],
      };
      const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo ok' }, stateFile);
      assert.equal(result.checked, false);
      assert.equal(result.reason, 'not_agent_session');
    });
  });

  test('enforces when task_id is present even without allowed_tools', () => {
    withTempStateFile(stateFile => {
      const hookInput = {
        session_id: 'session-5',
        task_id: 'task-5',
      };
      const result = checkTaskUpdateFirst(hookInput, 'Read', { file_path: 'README.md' }, stateFile);
      assert.equal(result.action, 'block');
      assert.match(result.message, /TASKUPDATE-FIRST/);
    });
  });
});
