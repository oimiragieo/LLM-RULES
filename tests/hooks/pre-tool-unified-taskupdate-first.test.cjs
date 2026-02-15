const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { atomicWriteJSONSync } = require('../../.claude/lib/utils/atomic-write.cjs');
const {
  withMockedRouterSnapshot,
  withRouterState,
  withTempStateFile,
} = require('../helpers/taskupdate-first-test-utils.cjs');

const {
  checkTaskUpdateFirst,
  readTaskUpdateFirstState,
} = require('../../.claude/hooks/routing/pre-tool-unified.cjs');
const routerState = require('../../.claude/lib/routing/router-state.cjs');

describe('pre-tool-unified taskupdate-first guard', { concurrency: 1 }, () => {
  const routerStatePath = path.join(
    __dirname,
    '..',
    '..',
    '.claude',
    'context',
    'runtime',
    'router-state.json'
  );

  const deps = { fs, path, os, routerState, atomicWriteJSONSync };

  test('blocks agent tool calls before TaskUpdate(in_progress)', () => {
    withTempStateFile(deps, stateFile => {
      const hookInput = {
        session_id: 'session-1',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Bash'],
      };

      const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo hello' }, stateFile);
      assert.equal(result.action, 'block');
      assert.match(result.message || '', /TaskUpdate\(\{ taskId: /);
      assert.match(result.message || '', /in_progress/);
    });
  });

  test('returns auto-reroute guidance on first preflight violation', () => {
    withTempStateFile(deps, stateFile => {
      const hookInput = {
        session_id: 'session-reroute-1',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Bash'],
        task_id: 'task-canonical-reroute-1',
      };

      const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo hello' }, stateFile);
      assert.equal(result.action, 'block');
      assert.match(result.message || '', /AUTO-REROUTE/);
      assert.match(result.message || '', /task-canonical-reroute-1/);
    });
  });

  test('hard-fails on repeated preflight violations before in_progress', () => {
    withTempStateFile(deps, stateFile => {
      const hookInput = {
        session_id: 'session-reroute-2',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Bash'],
        task_id: 'task-canonical-reroute-2',
      };

      const first = checkTaskUpdateFirst(hookInput, 'Read', { file_path: 'README.md' }, stateFile);
      assert.equal(first.action, 'block');
      assert.match(first.message || '', /AUTO-REROUTE/);

      const second = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo hello' }, stateFile);
      assert.equal(second.action, 'block');
      assert.match(second.message || '', /HARD-FAIL/);
    });
  });

  test('blocks repeated TaskList preflight loops before in_progress', () => {
    withTempStateFile(deps, stateFile => {
      const hookInput = {
        session_id: 'session-tasklist-loop',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
        task_id: 'task-canonical-loop',
      };

      const first = checkTaskUpdateFirst(hookInput, 'TaskList', {}, stateFile);
      assert.equal(first.action, 'allow');

      const second = checkTaskUpdateFirst(hookInput, 'TaskList', {}, stateFile);
      assert.equal(second.action, 'block');
      assert.match(second.message || '', /HARD-FAIL/);
      assert.match(second.message || '', /task-canonical-loop/);
    });
  });

  test('uses router-state currentSpawnTaskId in reroute guidance when hook task_id is missing', () => {
    withTempStateFile(deps, stateFile => {
      withRouterState(
        deps,
        routerStatePath,
        {
          mode: 'agent',
          taskSpawned: true,
          sessionId: 'session-guidance-fallback',
          currentSpawnTaskId: 'task-canonical-fallback-42',
        },
        () => {
          const hookInput = {
            session_id: 'session-guidance-fallback',
            allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
          };
          const result = checkTaskUpdateFirst(
            hookInput,
            'Read',
            { file_path: 'README.md' },
            stateFile
          );
          assert.equal(result.action, 'block');
          assert.match(result.message || '', /task-canonical-fallback-42/);
        }
      );
    });
  });

  test('self-heal allows first non-preflight tool when canonical task id is resolvable', () => {
    withTempStateFile(deps, stateFile => {
      process.env.TASKUPDATE_FIRST_SELF_HEAL = 'on';
      withRouterState(
        deps,
        routerStatePath,
        {
          mode: 'agent',
          taskSpawned: true,
          sessionId: 'session-self-heal',
          currentSpawnTaskId: 'task-self-heal-1',
        },
        () => {
          const hookInput = {
            session_id: 'session-self-heal',
            allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
          };
          const result = checkTaskUpdateFirst(
            hookInput,
            'Read',
            { file_path: 'README.md' },
            stateFile
          );
          assert.equal(result.action, 'allow');
          assert.match(result.warning || '', /SELF-HEAL/);

          const state = readTaskUpdateFirstState(stateFile);
          assert.equal(state.sessions['session-self-heal'].inProgress, true);
          assert.equal(state.sessions['session-self-heal'].taskId, 'task-self-heal-1');
        }
      );
    });
  });

  test('self-heal can be disabled and preserves block behavior', () => {
    withTempStateFile(deps, stateFile => {
      process.env.TASKUPDATE_FIRST_SELF_HEAL = 'off';
      withRouterState(
        deps,
        routerStatePath,
        {
          mode: 'agent',
          taskSpawned: true,
          sessionId: 'session-self-heal-off',
          currentSpawnTaskId: 'task-self-heal-off-1',
        },
        () => {
          const hookInput = {
            session_id: 'session-self-heal-off',
            allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
          };
          const result = checkTaskUpdateFirst(
            hookInput,
            'Read',
            { file_path: 'README.md' },
            stateFile
          );
          assert.equal(result.action, 'block');
          assert.match(result.message || '', /AUTO-REROUTE|HARD-FAIL|TASKUPDATE-FIRST/);
        }
      );
    });
  });

  test('does not enforce on Task spawns', () => {
    withTempStateFile(deps, stateFile => {
      const hookInput = {
        session_id: 'session-task-spawn',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Task'],
      };

      const result = checkTaskUpdateFirst(
        hookInput,
        'Task',
        { subagent_type: 'code-reviewer', prompt: 'Run audit' },
        stateFile
      );
      assert.equal(result.checked, false);
      assert.equal(result.reason, 'task_spawn');
    });
  });

  test('allows subsequent tool calls after TaskUpdate(in_progress)', () => {
    withTempStateFile(deps, stateFile => {
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
    withTempStateFile(deps, stateFile => {
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

  test('default mode is block when TASKUPDATE_FIRST_ENFORCEMENT is unset', () => {
    withTempStateFile(deps, stateFile => {
      delete process.env.TASKUPDATE_FIRST_ENFORCEMENT;
      const hookInput = {
        session_id: 'session-default-mode',
        allowed_tools: ['TaskUpdate', 'Read'],
      };
      const result = checkTaskUpdateFirst(hookInput, 'Read', { file_path: 'README.md' }, stateFile);
      assert.equal(result.action, 'block');
    });
  });

  test('skips enforcement for non-agent scoped sessions', () => {
    withTempStateFile(deps, stateFile => {
      withRouterState(
        deps,
        routerStatePath,
        { mode: 'router', taskSpawned: false, sessionId: 'session-4' },
        () => {
          const hookInput = {
            session_id: 'session-4',
            allowed_tools: ['Read', 'Bash'],
          };
          const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo ok' }, stateFile);
          assert.equal(result.checked, false);
          assert.equal(result.reason, 'not_agent_session');
        }
      );
    });
  });

  test('enforces when task_id is present even without allowed_tools', () => {
    withTempStateFile(deps, stateFile => {
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
    withTempStateFile(deps, stateFile => {
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
    withTempStateFile(deps, stateFile => {
      const priorAgentId = process.env.CLAUDE_AGENT_ID;
      delete process.env.CLAUDE_AGENT_ID;
      withRouterState(
        deps,
        routerStatePath,
        {
          mode: 'agent',
          taskSpawned: true,
          sessionId: 'session-7',
          lastReset: new Date().toISOString(),
        },
        () => {
          const hookInput = {
            session_id: 'session-7',
          };
          const result = checkTaskUpdateFirst(hookInput, 'Bash', { command: 'echo ok' }, stateFile);
          assert.equal(result.action, 'block');
          assert.match(result.message, /TASKUPDATE-FIRST/);
        }
      );
      if (priorAgentId == null) {
        delete process.env.CLAUDE_AGENT_ID;
      } else {
        process.env.CLAUDE_AGENT_ID = priorAgentId;
      }
    });
  });

  test('allows when recent router-state TaskUpdate bootstrap marker is present', () => {
    withTempStateFile(deps, stateFile => {
      process.env.TASKUPDATE_FIRST_BOOTSTRAP = 'true';
      withRouterState(
        deps,
        routerStatePath,
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

  test('auto-marks in_progress when task id is present and auto-mark is enabled', () => {
    withTempStateFile(deps, stateFile => {
      process.env.TASKUPDATE_FIRST_AUTOMARK = 'true';
      const hookInput = {
        session_id: 'session-9',
        task_id: 'task-9',
      };
      const result = checkTaskUpdateFirst(hookInput, 'Read', { file_path: 'README.md' }, stateFile);
      assert.equal(result.action, 'allow');
      if (result.warning) {
        assert.match(result.warning, /AUTO-MARK/);
      }

      const state = readTaskUpdateFirstState(stateFile);
      assert.equal(state.sessions['session-9'].inProgress, true);
      assert.equal(state.sessions['session-9'].taskId, 'task-9');
    });
  });

  test('normalizes TaskUpdate taskId to canonical hook task_id when mismatch occurs', () => {
    withTempStateFile(deps, stateFile => {
      const hookInput = {
        session_id: 'session-10',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
        task_id: 'task-canonical-10',
      };

      const update = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: '2', status: 'in_progress' },
        stateFile
      );
      assert.equal(update.action, 'allow');
      assert.match(update.warning || '', /TASK-ID NORMALIZED/);

      const state = readTaskUpdateFirstState(stateFile);
      assert.equal(state.sessions['session-10'].taskId, 'task-canonical-10');
      assert.equal(state.sessions['session-10'].inProgress, true);
    });
  });

  test('completed TaskUpdate clears inProgress and re-enforces before next tool call', () => {
    withTempStateFile(deps, stateFile => {
      const hookInput = {
        session_id: 'session-11',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
        task_id: 'task-canonical-11',
      };

      const start = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: 'task-canonical-11', status: 'in_progress' },
        stateFile
      );
      assert.equal(start.action, 'allow');

      const done = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: 'task-canonical-11', status: 'completed' },
        stateFile
      );
      assert.equal(done.action, 'allow');

      const afterDone = checkTaskUpdateFirst(
        hookInput,
        'Read',
        { file_path: 'README.md' },
        stateFile
      );
      assert.equal(afterDone.action, 'block');
      assert.match(afterDone.message, /TASKUPDATE-FIRST/);

      const state = readTaskUpdateFirstState(stateFile);
      assert.equal(state.sessions['session-11'].inProgress, false);
      assert.equal(state.sessions['session-11'].status, 'completed');
    });
  });

  test('blocks TaskUpdate(completed) when taskId mismatches canonical hook task_id', () => {
    withTempStateFile(deps, stateFile => {
      const hookInput = {
        session_id: 'session-12',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Read'],
        task_id: 'task-canonical-12',
      };

      const start = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: 'task-canonical-12', status: 'in_progress' },
        stateFile
      );
      assert.equal(start.action, 'allow');

      const badComplete = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: '2', status: 'completed' },
        stateFile
      );
      assert.equal(badComplete.action, 'block');
      assert.match(badComplete.message || '', /TASK-ID MISMATCH/);

      const state = readTaskUpdateFirstState(stateFile);
      assert.equal(state.sessions['session-12'].inProgress, true);
      assert.equal(state.sessions['session-12'].taskId, 'task-canonical-12');
      assert.equal(state.sessions['session-12'].status, 'in_progress');
    });
  });
  test('bootstrap gating respects normalized IDs and router-session constraints', () => {
    withTempStateFile(deps, stateFile => {
      process.env.TASKUPDATE_FIRST_BOOTSTRAP = 'true';
      const cases = [
        {
          snapshot: {
            mode: 'agent',
            taskSpawned: true,
            sessionId: 'session-13',
            lastTaskUpdateCall: Date.now(),
            lastTaskUpdateTaskId: 'Task-13',
            lastTaskUpdateStatus: 'in_progress',
            taskUpdatesThisSession: 1,
          },
          hookInput: { session_id: 'session-13', task_id: 'task-13' },
          expectedAction: 'allow',
        },
        {
          snapshot: {
            mode: 'agent',
            taskSpawned: true,
            sessionId: null,
            lastTaskUpdateCall: Date.now(),
            lastTaskUpdateTaskId: 'task-14',
            lastTaskUpdateStatus: 'in_progress',
            taskUpdatesThisSession: 1,
          },
          hookInput: {
            session_id: 'session-14',
            task_id: 'task-14',
            allowed_tools: ['TaskUpdate', 'Read'],
          },
          expectedAction: 'block',
        },
        {
          snapshot: {
            mode: 'agent',
            taskSpawned: true,
            sessionId: 'session-A',
            lastTaskUpdateCall: Date.now(),
            lastTaskUpdateTaskId: 'task-15',
            lastTaskUpdateStatus: 'in_progress',
            taskUpdatesThisSession: 1,
          },
          hookInput: {
            session_id: 'session-B',
            task_id: 'task-15',
            allowed_tools: ['TaskUpdate', 'Read'],
          },
          expectedAction: 'block',
        },
      ];

      for (const c of cases) {
        withMockedRouterSnapshot(routerState, c.snapshot, () => {
          const result = checkTaskUpdateFirst(
            c.hookInput,
            'Read',
            { file_path: 'README.md' },
            stateFile
          );
          assert.equal(result.action, c.expectedAction);
        });
      }
    });
  });
});
