#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = path.join(
  process.cwd(),
  '.claude',
  'hooks',
  'routing',
  'pre-tool-unified.cjs'
);

test('pre-tool-unified exits non-zero when internal error occurs (fail-closed)', () => {
  const payload = JSON.stringify({
    tool: 'Read',
    tool_input: { file_path: '.claude/CLAUDE.md' },
    session_id: 'pretool-fail-closed-test',
  });

  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: payload,
    encoding: 'utf8',
    env: {
      ...process.env,
      PRETOOL_UNIFIED_TEST_FORCE_THROW: '1',
    },
    windowsHide: true,
  });

  assert.equal(result.status, 2, `expected exit 2, got ${result.status}\n${result.stderr}`);
  assert.match(result.stderr, /\[pre-tool-unified\] Hook error/, 'expected hook error log');
});
