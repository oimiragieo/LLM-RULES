// F-LIFECYCLE regression test: TaskUpdate(deleted) removes session entries from taskupdate-first-state.json
'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { atomicWriteJSONSync } = require('../../.claude/lib/utils/atomic-write.cjs');
const { withTempStateFile } = require('../helpers/taskupdate-first-test-utils.cjs');
const {
  checkTaskUpdateFirst,
  readTaskUpdateFirstState,
} = require('../../.claude/hooks/routing/pre-tool-unified.cjs');
const routerState = require('../../.claude/lib/routing/router-state.cjs');

const deps = { fs, path, os, routerState, atomicWriteJSONSync };

describe('pre-tool-unified TaskUpdate(deleted) propagation', { concurrency: 1 }, () => {
  test('TaskUpdate(deleted) removes the calling session entry from state', () => {
    withTempStateFile(deps, stateFile => {
      // Seed a live in-progress session entry
      const seedState = {
        sessions: {
          'ghost-session': {
            inProgress: true,
            taskId: 'phantom-X',
            updatedAt: Date.now(),
          },
        },
      };
      fs.writeFileSync(stateFile, JSON.stringify(seedState, null, 2), 'utf8');

      const hookInput = {
        session_id: 'ghost-session',
        allowed_tools: ['TaskUpdate'],
      };
      const result = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: 'phantom-X', status: 'deleted' },
        stateFile
      );

      assert.equal(result.action, 'allow', 'deleted status should be allowed');
      const post = readTaskUpdateFirstState(stateFile);
      assert.ok(
        !post.sessions || !post.sessions['ghost-session'],
        'ghost-session entry must be removed after deleted status'
      );
    });
  });

  test('TaskUpdate(deleted) removes orphan sessions matching the target taskId', () => {
    withTempStateFile(deps, stateFile => {
      // Seed an orphan entry from a different session (simulates test fixture contamination)
      const seedState = {
        sessions: {
          'orphan-session-A': {
            inProgress: true,
            taskId: 'phantom-X',
            updatedAt: Date.now(),
          },
          'orphan-session-B': {
            inProgress: true,
            taskId: 'phantom-X',
            updatedAt: Date.now(),
          },
          'unrelated-session': {
            inProgress: true,
            taskId: 'task-other',
            updatedAt: Date.now(),
          },
        },
      };
      fs.writeFileSync(stateFile, JSON.stringify(seedState, null, 2), 'utf8');

      const hookInput = {
        session_id: 'new-session-deleter',
        allowed_tools: ['TaskUpdate'],
      };
      const result = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: 'phantom-X', status: 'deleted' },
        stateFile
      );

      assert.equal(result.action, 'allow', 'deleted status should be allowed');
      const post = readTaskUpdateFirstState(stateFile);
      const sessions = post.sessions || {};
      // All phantom-X orphans must be gone
      for (const [sid, entry] of Object.entries(sessions)) {
        assert.notEqual(
          entry && entry.taskId,
          'phantom-X',
          `session ${sid} should not reference phantom-X after deletion`
        );
      }
      // Unrelated session must be preserved
      assert.ok(sessions['unrelated-session'], 'unrelated-session must be preserved');
    });
  });

  test('TaskUpdate(cancelled) also removes session entries', () => {
    withTempStateFile(deps, stateFile => {
      const seedState = {
        sessions: {
          'cancel-session': {
            inProgress: true,
            taskId: 'task-cancel-99',
            updatedAt: Date.now(),
          },
        },
      };
      fs.writeFileSync(stateFile, JSON.stringify(seedState, null, 2), 'utf8');

      const hookInput = {
        session_id: 'cancel-session',
        allowed_tools: ['TaskUpdate'],
      };
      const result = checkTaskUpdateFirst(
        hookInput,
        'TaskUpdate',
        { taskId: 'task-cancel-99', status: 'cancelled' },
        stateFile
      );

      assert.equal(result.action, 'allow', 'cancelled status should be allowed');
      const post = readTaskUpdateFirstState(stateFile);
      assert.ok(
        !post.sessions || !post.sessions['cancel-session'],
        'cancel-session entry must be removed after cancelled status'
      );
    });
  });
});
