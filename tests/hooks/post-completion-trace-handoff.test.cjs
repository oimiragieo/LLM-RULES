#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHookEnv } = require('../../.claude/hooks/run-hook.cjs');

test('buildHookEnv preserves existing trace id for hook handoff', () => {
  const env = buildHookEnv({ CLAUDE_TRACE_ID: 'trace-existing' });
  assert.equal(env.CLAUDE_TRACE_ID, 'trace-existing');
  assert.equal(env.HOOK_TRACE_ID, 'trace-existing');
});
