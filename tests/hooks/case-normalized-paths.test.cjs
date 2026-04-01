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

function assertBlocked(filePath, messagePattern = /protected path|path traversal/i) {
  const result = runWriteHook(filePath);
  assert.strictEqual(result.exitCode, 2, `Expected ${filePath} to be blocked`);
  assert.ok(result.parsed, `Expected JSON hook output for ${filePath}`);
  assert.strictEqual(result.parsed.permissionDecision, 'deny', `Expected deny for ${filePath}`);
  assert.match(result.parsed.message, messagePattern, `Unexpected message for ${filePath}`);
}

function assertAllowed(filePath) {
  const result = runWriteHook(filePath);
  assert.strictEqual(result.exitCode, 0, `Expected ${filePath} to be allowed`);
  if (result.parsed) {
    assert.notStrictEqual(result.parsed.permissionDecision, 'deny');
  }
}

test('mixed-case protected paths are blocked identically to lowercase paths', async t => {
  const blockedPaths = [
    '.cLauDe/hooks/safety/evil.cjs',
    '.GIT/config',
    'NODE_MODULES/pkg/index.js',
    '.Claude/Context/Code-Index/x',
  ];

  for (const filePath of blockedPaths) {
    await t.test(filePath, () => {
      assertBlocked(filePath);
    });
  }
});

test('all Claude Code protected paths from mission guidance are blocked', async t => {
  const blockedPaths = [
    '.gitconfig',
    '.gitmodules',
    '.bashrc',
    '.bash_profile',
    '.zshrc',
    '.zprofile',
    '.profile',
    '.ripgreprc',
    '.mcp.json',
    '.claude.json',
    '.git/config',
    '.vscode/settings.json',
    '.idea/workspace.xml',
    '.claude/settings.json',
  ];

  for (const filePath of blockedPaths) {
    await t.test(filePath, () => {
      assertBlocked(filePath);
    });
  }
});

test('safe project files remain allowed', async t => {
  const safePaths = [
    'src/index.js',
    'tests/hooks/case-normalized-paths.test.cjs',
    'scripts/validation/check-security.cjs',
  ];

  for (const filePath of safePaths) {
    await t.test(filePath, () => {
      assertAllowed(filePath);
    });
  }
});

test('URL-encoded and backslash traversal variants are blocked', async t => {
  const traversalPaths = [
    '..\\..\\src\\secret.txt',
    '.claude/%2e%2e/%2e%2e/.git/config',
    'src/%2E%2E/%2E%2E/.claude/settings.json',
    '..%2f..%2f.vscode/settings.json',
  ];

  for (const filePath of traversalPaths) {
    await t.test(filePath, () => {
      assertBlocked(filePath, /path traversal/i);
    });
  }
});
