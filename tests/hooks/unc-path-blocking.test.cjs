'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'safety',
  'unified-pre-write-hook.cjs'
);

const BASE_ENV = {
  CONTEXT_MODE_TOOL_GUARD: 'off',
  FILE_PLACEMENT_GUARD: 'block',
  WRITE_CONTENT_SCANNER: 'off',
  WRITE_SIZE_VALIDATOR: 'off',
  ROUTER_WRITE_GUARD: 'off',
  TDD_CHECK: 'off',
  PLAN_EVOLUTION_GUARD: 'off',
  CREATOR_GUARD: 'off',
  PROJECT_ROOT_WRITE_GUARD: 'off',
  REFLECTION_FILE_LOCKDOWN: 'off',
};

function runWriteHook(filePath) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({
      tool_name: 'Write',
      tool_input: {
        file_path: filePath,
        content: 'module.exports = 1;\n',
      },
      allowed_tools: ['Read', 'Write', 'Edit'],
    }),
    encoding: 'utf8',
    env: { ...process.env, ...BASE_ENV },
    timeout: 5000,
  });

  const stdout = (result.stdout || '').trim();
  let parsed = null;
  if (stdout) {
    parsed = JSON.parse(stdout);
  }

  return {
    exitCode: result.status,
    stdout,
    stderr: result.stderr || '',
    parsed,
  };
}

function assertBlockedWithUncMessage(filePath) {
  const result = runWriteHook(filePath);
  assert.strictEqual(result.exitCode, 2, `Expected ${filePath} to be blocked with exit code 2`);
  assert.ok(result.parsed, `Expected JSON hook output for ${filePath}`);
  assert.strictEqual(result.parsed.permissionDecision, 'deny', `Expected deny for ${filePath}`);
  assert.match(result.parsed.message, /unc|network/i, `Unexpected block message for ${filePath}`);
}

function assertAllowed(filePath) {
  const result = runWriteHook(filePath);
  assert.strictEqual(result.exitCode, 0, `Expected ${filePath} to be allowed`);
  if (result.parsed) {
    assert.notStrictEqual(result.parsed.permissionDecision, 'deny');
  }
}

test('backslash UNC paths are blocked with UNC/network guidance', () => {
  assertBlockedWithUncMessage('\\\\server\\share\\file.js');
});

test('forward-slash UNC paths are blocked with UNC/network guidance', () => {
  assertBlockedWithUncMessage('//server/share/file.js');
});

test('normal absolute Windows paths remain allowed', () => {
  assertAllowed('C:\\Users\\example\\project\\src\\index.js');
});

test('normal relative paths remain allowed', () => {
  assertAllowed('src/index.js');
});

test('UNC path blocks exit with status 2', () => {
  for (const filePath of ['\\\\server\\share\\file.js', '//server/share/file.js']) {
    const result = runWriteHook(filePath);
    assert.strictEqual(result.exitCode, 2, `Expected exit code 2 for ${filePath}`);
  }
});
