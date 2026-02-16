'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const MODULE_PATH = './.claude/lib/utils/hook-input.cjs';

test('parseHookInputAsync reads JSON from stdin when argv[2] is missing', () => {
  const script = `
    const { parseHookInputAsync } = require('${MODULE_PATH}');
    (async () => {
      const v = await parseHookInputAsync({ timeout: 500 });
      process.stdout.write(JSON.stringify(v));
    })().catch(() => process.exit(1));
  `;

  const payload = { tool_name: 'TaskUpdate', tool_input: { taskId: '1', status: 'completed' } };
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    input: JSON.stringify(payload),
  });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout || 'null');
  assert.equal(parsed.tool_name, 'TaskUpdate');
  assert.equal(parsed.tool_input.taskId, '1');
});

test('parseHookInputSync returns null when argv[2] is missing even if stdin has JSON', () => {
  const script = `
    const { parseHookInputSync } = require('${MODULE_PATH}');
    const v = parseHookInputSync();
    process.stdout.write(JSON.stringify(v));
  `;

  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'TaskUpdate' }),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout || '').trim(), 'null');
});
