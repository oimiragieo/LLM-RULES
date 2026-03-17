#!/usr/bin/env node
'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'monitoring',
  'hook-error-detector.cjs'
);

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const SIGNAL_FILE = path.join(RUNTIME_DIR, 'hook-recovery-needed.txt');

let signalFileBackup = null;

beforeEach(() => {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  signalFileBackup = fs.existsSync(SIGNAL_FILE) ? fs.readFileSync(SIGNAL_FILE, 'utf8') : null;
});

afterEach(() => {
  if (signalFileBackup === null) {
    if (fs.existsSync(SIGNAL_FILE)) fs.rmSync(SIGNAL_FILE, { force: true });
  } else {
    fs.writeFileSync(SIGNAL_FILE, signalFileBackup, 'utf8');
  }
});

function runHook(input = '{}') {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

test('hook-error-detector exits 0 on normal tool result (no error)', () => {
  const input = JSON.stringify({ tool: 'Bash', output: 'ok' });
  const result = runHook(input);
  assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}: ${result.stderr}`);
});

test('hook-error-detector exits 0 on malformed stdin', () => {
  const result = runHook('not valid json {{{');
  assert.strictEqual(result.status, 0, `Expected exit 0, got ${result.status}: ${result.stderr}`);
});

test('hook-error-detector uses safeParseJSON', () => {
  const source = fs.readFileSync(HOOK_PATH, 'utf8');
  assert.ok(
    source.includes('safeParseJSON'),
    'Hook must use safeParseJSON for stdin parsing (SE-02 compliance)'
  );
});
