const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { atomicWriteJSONSync } = require('../../.claude/lib/utils/atomic-write.cjs');
const {
  withRouterState,
  withTempStateFile,
} = require('../helpers/taskupdate-first-test-utils.cjs');

const {
  checkTaskUpdateFirst,
  readTaskUpdateFirstState,
} = require('../../.claude/hooks/routing/pre-tool-unified.cjs');
const routerState = require('../../.claude/lib/routing/router-state.cjs');

describe('pre-tool-unified taskupdate-first router session fallback', { concurrency: 1 }, () => {
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

  test('skips enforcement when router state has agent mode but no task identity', () => {
    withTempStateFile(deps, stateFile => {
      const priorAgentId = process.env.CLAUDE_AGENT_ID;
      delete process.env.CLAUDE_AGENT_ID;
      withRouterState(
        deps,
        routerStatePath,
        {
          mode: 'agent',
          taskSpawned: true,
          sessionId: 'session-7b',
          lastReset: new Date().toISOString(),
        },
        () => {
          const hookInput = {
            session_id: 'session-7b',
          };
          const result = checkTaskUpdateFirst(
            hookInput,
            'Read',
            { file_path: 'README.md' },
            stateFile
          );
          assert.equal(result.checked, false);
          assert.equal(result.reason, 'not_agent_session');
        }
      );
      if (priorAgentId == null) {
        delete process.env.CLAUDE_AGENT_ID;
      } else {
        process.env.CLAUDE_AGENT_ID = priorAgentId;
      }
    });
  });

  test('auto-marks in_progress from session-matched router state task id when hook task_id is missing', () => {
    withTempStateFile(deps, stateFile => {
      process.env.TASKUPDATE_FIRST_AUTOMARK = 'true';
      withRouterState(
        deps,
        routerStatePath,
        {
          sessionId: 'session-router-autofill',
          currentSpawnTaskId: 'task-router-autofill',
          mode: 'agent',
          taskSpawned: true,
        },
        () => {
          const hookInput = {
            session_id: 'session-router-autofill',
            allowed_tools: ['TaskUpdate', 'Read'],
          };

          const result = checkTaskUpdateFirst(
            hookInput,
            'Read',
            { file_path: 'README.md' },
            stateFile
          );
          assert.equal(result.action, 'allow');
          assert.match(result.warning || '', /AUTO-MARK/);
          assert.match(result.warning || '', /task-router-autofill/);
        }
      );
      const state = readTaskUpdateFirstState(stateFile);
      assert.equal(state.sessions['session-router-autofill'].taskId, 'task-router-autofill');
      assert.equal(state.sessions['session-router-autofill'].inProgress, true);
      delete process.env.TASKUPDATE_FIRST_AUTOMARK;
    });
  });
});
