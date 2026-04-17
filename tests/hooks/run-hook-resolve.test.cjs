'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { detectProjectRoot, resolveHookScriptPath } = require('../../.claude/hooks/run-hook.cjs');

test('detectProjectRoot resolves current repo root', () => {
  const root = detectProjectRoot(process.cwd());
  assert.equal(root, process.cwd());
});

test('detectProjectRoot falls back to actual project root when cwd is outside repo', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-hook-root-'));
  try {
    const root = detectProjectRoot(tmpDir);
    assert.equal(root, process.cwd());
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolveHookScriptPath resolves hooks under detected project root', () => {
  const { scriptPath, hooksDir } = resolveHookScriptPath('reflection/force-step0-execution');
  assert.equal(
    scriptPath.endsWith(path.join('.claude', 'hooks', 'reflection', 'force-step0-execution.cjs')),
    true
  );
  assert.equal(hooksDir.endsWith(path.join('.claude', 'hooks')), true);
});

test('run-hook compatibility shim executes the underlying CLI when invoked directly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-hook-cli-'));
  const sampleFile = path.join(tmpDir, 'sample.js');
  fs.writeFileSync(sampleFile, 'console.log("debug");\n', 'utf8');

  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(process.cwd(), '.claude', 'hooks', 'run-hook.cjs'),
        'validation/check-console-log',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          CONSOLE_LOG_CHECK_FILES: sampleFile,
        },
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stderr, /console\.log found/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
