'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

describe('Reflection Cleanup Hook Import Integrity', () => {
  const PROJECT_ROOT = process.cwd();
  const HOOK_PATH = path.join(
    PROJECT_ROOT,
    '.claude',
    'hooks',
    'reflection',
    'reflection-cleanup.cjs'
  );

  test('should execute without TypeError when receiving TaskUpdate completed', () => {
    // Mock input matching the debug log pattern
    const mockInput = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: '1',
        status: 'completed',
      },
    };

    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify(mockInput),
      env: { ...process.env, DEBUG_HOOKS: 'true' },
      encoding: 'utf8',
    });

    // Check for the specific TypeError from the log
    const hasTypeError =
      result.stderr.includes('TypeError [ERR_INVALID_ARG_TYPE]') ||
      result.stderr.includes('Received undefined at Object.join');

    assert.strictEqual(hasTypeError, false, 'Hook should not throw TypeError for PROJECT_ROOT');

    // Note: The hook might still exit 0 if files don't exist, which is fine.
    // We are specifically testing that it doesn't CRASH on the import/path.join.
    assert.strictEqual(result.status, 0, 'Hook should exit with code 0');
  });
});
