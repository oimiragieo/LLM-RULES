#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const assimilate = require('../../.claude/skills/assimilate/scripts/main.cjs');

test('assimilate main returns planning mode when repos are missing', () => {
  const result = assimilate.main({});
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'planning');
  assert.equal(Array.isArray(result.phases), true);
  assert.equal(result.phases.length, 4);
});

test('assimilate main parses repos and returns execution mode', () => {
  const result = assimilate.main({
    repos: 'https://github.com/example/a,https://github.com/example/b',
    runId: 'unit-test-run',
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'execution');
  assert.deepEqual(result.repos, ['https://github.com/example/a', 'https://github.com/example/b']);
  assert.match(result.workspace, /unit-test-run/);
  assert.match(result.kickoff, /four phases/i);
});
