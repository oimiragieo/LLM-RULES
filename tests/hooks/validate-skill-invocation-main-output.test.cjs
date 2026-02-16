const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('validate-skill-invocation emits advisory on stderr and keeps stdout clean', () => {
  const hookScript = path.join(
    __dirname,
    '..',
    '..',
    '.claude',
    'hooks',
    'safety',
    'validate-skill-invocation.cjs'
  );

  const payload = JSON.stringify({
    tool_name: 'Read',
    tool_input: { file_path: '.claude/skills/tdd/SKILL.md' },
    session_id: 'test-session',
  });

  const result = spawnSync(process.execPath, [hookScript], {
    cwd: path.join(__dirname, '..', '..'),
    input: payload,
    encoding: 'utf8',
  });

  assert.strictEqual(result.status, 0);
  assert.strictEqual((result.stdout || '').trim(), '');
  assert.ok((result.stderr || '').includes('[SKILL-INVOCATION]'));
});

