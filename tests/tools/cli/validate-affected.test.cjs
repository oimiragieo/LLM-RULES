'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const { parseArgs } = require('../../../.claude/tools/cli/validate-affected.cjs');

const CLI = path.join(process.cwd(), '.claude', 'tools', 'cli', 'validate-affected.cjs');

test('parseArgs reads json and repeated file flags', () => {
  const opts = parseArgs([
    'node',
    'validate-affected.cjs',
    '--json',
    '--file',
    '.claude/lib/routing/router.cjs',
    '--file',
    '.claude/hooks/session/worktree-prune-on-start.cjs',
  ]);

  assert.equal(opts.json, true);
  assert.deepEqual(opts.files, [
    '.claude/lib/routing/router.cjs',
    '.claude/hooks/session/worktree-prune-on-start.cjs',
  ]);
});

test('validate-affected emits JSON recommendations for provided files', () => {
  const result = spawnSync(
    'node',
    [
      CLI,
      '--json',
      '--file',
      '.claude/lib/routing/router.cjs',
      '--file',
      '.claude/agents/core/developer.md',
    ],
    {
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);

  assert.equal(parsed.plan.recommendedCommands.includes('pnpm validate:routing'), true);
  assert.equal(parsed.plan.recommendedCommands.includes('pnpm validate:agent-skill-refs'), true);
  assert.equal(parsed.plan.conservativeFallback, false);
});
