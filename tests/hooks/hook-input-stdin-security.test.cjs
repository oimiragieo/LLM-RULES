'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(
  process.cwd(),
  '.claude',
  'hooks',
  'validation',
  'taskupdate-contract-validator.cjs'
);

test('taskupdate-contract-validator blocks invalid TaskUpdate when input is provided via stdin only', () => {
  const payload = {
    tool_name: 'TaskUpdate',
    tool_input: { status: 'completed' },
  };

  const child = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });

  assert.equal(child.status, 0, `hook process failed: ${child.stderr}`);
  const out = JSON.parse((child.stdout || '').trim() || '{}');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.message || out.permissionDecisionReason || '', /taskId|required/i);
});
