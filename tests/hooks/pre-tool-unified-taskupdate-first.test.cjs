const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { atomicWriteJSONSync } = require('../../.claude/lib/utils/atomic-write.cjs');

const {
  checkTaskUpdateFirst,
  readTaskUpdateFirstState,
} = require('../../.claude/hooks/routing/pre-tool-unified.cjs');

describe('pre-tool-unified taskupdate-first guard', () => {
  const routerStatePath = path.join(
    __dirname,
    '..',
    '..',
    '.claude',
    'context',
    'runtime',
    'router-state.json'
  );

  function withRouterState(state, fn) {
    const existed = fs.existsSync(routerStatePath);
    const prior = existed ? fs.readFileSync(routerStatePath, 'utf8') : null;
    try {
      fs.mkdirSync(path.dirname(routerStatePath), { recursive: true });
      atomicWriteJSONSync(routerStatePath, state);
      fn();
    } finally {
      if (existed) {
        fs.writeFileSync(routerStatePath, prior, 'utf8');
      } else {
        fs.rmSync(routerStatePath, { force: true });
      }
    }
  }

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
      withRouterState({ mode: 'router', taskSpawned: false, sessionId: 'session-4' }, () => {
        const hookInput = {
          session_id: 'session-4',
          allowed_tools: ['Read', 'Bash'],
        };
        const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo ok' }, stateFile);
        assert.equal(result.checked, false);
        assert.equal(result.reason, 'not_agent_session');
      });
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

  test('enforces for non-router agent sessions even when allowed_tools/task_id are missing', () => {
    withTempStateFile(stateFile => {
      const priorAgentId = process.env.CLAUDE_AGENT_ID;
      process.env.CLAUDE_AGENT_ID = 'developer';
      try {
        const hookInput = {
          session_id: 'session-6',
        };
        const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo ok' }, stateFile);
        assert.equal(result.action, 'block');
        assert.match(result.message, /TASKUPDATE-FIRST/);
      } finally {
        if (priorAgentId == null) {
          delete process.env.CLAUDE_AGENT_ID;
        } else {
          process.env.CLAUDE_AGENT_ID = priorAgentId;
        }
      }
    });
  });

  test('enforces when router state indicates spawned agent context', () => {
    withTempStateFile(stateFile => {
      const priorAgentId = process.env.CLAUDE_AGENT_ID;
      delete process.env.CLAUDE_AGENT_ID;
      withRouterState({ mode: 'agent', taskSpawned: true, sessionId: 'session-7' }, () => {
        const hookInput = {
          session_id: 'session-7',
        };
        const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo ok' }, stateFile);
        assert.equal(result.action, 'block');
        assert.match(result.message, /TASKUPDATE-FIRST/);
      });
      if (priorAgentId == null) {
        delete process.env.CLAUDE_AGENT_ID;
      } else {
        process.env.CLAUDE_AGENT_ID = priorAgentId;
      }
    });
  });

  test('allows when recent router-state TaskUpdate bootstrap marker is present', () => {
    withTempStateFile(stateFile => {
      withRouterState(
        {
          mode: 'agent',
          taskSpawned: true,
          sessionId: 'session-8',
          lastTaskUpdateCall: Date.now(),
          lastTaskUpdateTaskId: 'task-8',
          lastTaskUpdateStatus: 'in_progress',
          taskUpdatesThisSession: 1,
        },
        () => {
          const hookInput = {
            session_id: 'session-8',
            task_id: 'task-8',
          };
          const result = checkTaskUpdateFirst(hookInput, 'Grep', { pattern: 'foo' }, stateFile);
          assert.equal(result.action, 'allow');
        }
      );
    });
  });
});
