'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const hook = require('../../.claude/hooks/routing/agent-registry-auto-refresh.cjs');

test('shouldRefreshRegistry returns true for Write to .claude/agents/*.md', () => {
  const yes = hook.shouldRefreshRegistry('Write', '.claude/agents/core/new-agent.md');
  assert.equal(yes, true);
});

test('shouldRefreshRegistry returns false outside agent markdown files', () => {
  assert.equal(hook.shouldRefreshRegistry('Write', '.claude/context/memory/learnings.md'), false);
  assert.equal(hook.shouldRefreshRegistry('Edit', '.claude/agents/core/new-agent.txt'), false);
  assert.equal(hook.shouldRefreshRegistry('Task', '.claude/agents/core/new-agent.md'), false);
});

test('processHookInput triggers refresh for qualifying write', () => {
  let called = 0;
  const outcome = hook.processHookInput(
    {
      tool_name: 'Write',
      tool_input: {
        file_path: '.claude/agents/core/new-agent.md',
      },
    },
    {
      runRegistryRefreshFn: () => {
        called += 1;
        return { status: 0, stdout: '', stderr: '' };
      },
      readLastRunMsFn: () => 0,
      writeLastRunMsFn: () => {},
      nowMs: 9999,
    }
  );

  assert.equal(called, 1);
  assert.equal(outcome.refreshed, true);
  assert.equal(outcome.reason, 'ok');
});

test('processHookInput debounces rapid refresh attempts', () => {
  let called = 0;
  const outcome = hook.processHookInput(
    {
      tool_name: 'Edit',
      tool_input: {
        file_path: '.claude/agents/domain/new-domain-agent.md',
      },
    },
    {
      runRegistryRefreshFn: () => {
        called += 1;
        return { status: 0, stdout: '', stderr: '' };
      },
      readLastRunMsFn: () => 1000,
      writeLastRunMsFn: () => {},
      nowMs: 1001,
    }
  );

  assert.equal(called, 0);
  assert.equal(outcome.refreshed, false);
  assert.equal(outcome.reason, 'debounced');
});
