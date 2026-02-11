const test = require('node:test');
const assert = require('node:assert/strict');

const hook = require('../../.claude/hooks/safety/unified-pre-write-hook.cjs');

test('unified-pre-write-hook detects subordinate context when allowed_tools excludes Task', () => {
  const isRouter = hook.isRouterInvocation({
    allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Write', 'Edit'],
  });
  assert.strictEqual(isRouter, false);
});

test('unified-pre-write-hook router-write-guard allows subordinate write context', async () => {
  const routerGuard = hook.CHECKS.find(c => c.name === 'router-write-guard');
  assert.ok(routerGuard, 'router-write-guard check should exist');

  const result = await routerGuard.run(
    'Write',
    { file_path: '.claude/context/reports/subagent.md' },
    { allowed_tools: ['TaskUpdate', 'TaskList', 'Read', 'Write', 'Edit'] }
  );

  assert.strictEqual(result.pass, true);
});

test('unified-pre-write-hook router-write-guard blocks router context', async () => {
  const routerGuard = hook.CHECKS.find(c => c.name === 'router-write-guard');
  assert.ok(routerGuard, 'router-write-guard check should exist');

  const result = await routerGuard.run(
    'Write',
    { file_path: '.claude/context/reports/router.md' },
    { allowed_tools: ['Task', 'TaskList', 'Read'] }
  );

  assert.strictEqual(result.pass, false);
  assert.strictEqual(result.result, 'block');
});
