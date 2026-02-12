'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../../../.claude/tools/cli/runtime-health-snapshot.cjs');

test('parseArgs returns defaults', () => {
  const parsed = parseArgs(['node', 'runtime-health-snapshot.cjs']);
  assert.equal(parsed.component, 'runtime-health-snapshot');
  assert.equal(parsed.status, 'ok');
  assert.equal(parsed.sessionId, null);
  assert.equal(parsed.json, false);
});

test('parseArgs reads explicit flags', () => {
  const parsed = parseArgs([
    'node',
    'runtime-health-snapshot.cjs',
    '--component',
    'nightly-bootstrap',
    '--status',
    'warn',
    '--session-id',
    's-123',
    '--json',
    'true',
  ]);
  assert.equal(parsed.component, 'nightly-bootstrap');
  assert.equal(parsed.status, 'warn');
  assert.equal(parsed.sessionId, 's-123');
  assert.equal(parsed.json, true);
});
