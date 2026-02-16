#!/usr/bin/env node
'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'session', 'pre-compact.cjs');

const EDIT_COUNTER_FILE = path.join(RUNTIME_DIR, 'edit-counter.json');
const SESSION_METRICS_FILE = path.join(RUNTIME_DIR, 'session-metrics.json');
const DRIFT_STATE_FILE = path.join(RUNTIME_DIR, 'drift-state.json');
const SNAPSHOT_FILE = path.join(RUNTIME_DIR, 'pre-compact-snapshot.json');

const TRACKED_FILES = [EDIT_COUNTER_FILE, SESSION_METRICS_FILE, DRIFT_STATE_FILE, SNAPSHOT_FILE];

let backups = new Map();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function backupFiles() {
  backups = new Map();
  for (const file of TRACKED_FILES) {
    if (fs.existsSync(file)) {
      backups.set(file, fs.readFileSync(file, 'utf8'));
    } else {
      backups.set(file, null);
    }
  }
}

function restoreFiles() {
  for (const [file, content] of backups.entries()) {
    if (content === null) {
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
}

function runHook(input = '{}') {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

beforeEach(() => {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  backupFiles();
});

afterEach(() => {
  restoreFiles();
});

test('pre-compact ignores malformed runtime JSON and writes snapshot defaults', () => {
  fs.writeFileSync(EDIT_COUNTER_FILE, '{bad json', 'utf8');
  fs.writeFileSync(SESSION_METRICS_FILE, '{bad json', 'utf8');
  fs.writeFileSync(DRIFT_STATE_FILE, '{bad json', 'utf8');

  const result = runHook('{"hook_event_name":"PreCompact"}');
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout.trim(), '{"hook_event_name":"PreCompact"}');
  assert.ok(fs.existsSync(SNAPSHOT_FILE));

  const snapshot = readJson(SNAPSHOT_FILE);
  assert.strictEqual(snapshot.editCount, 0);
  assert.strictEqual(snapshot.correctionCount, 0);
  assert.strictEqual(snapshot.promptCount, 0);
  assert.strictEqual(snapshot.originalIntent, '');
  assert.strictEqual(snapshot.driftEditCount, 0);
});
