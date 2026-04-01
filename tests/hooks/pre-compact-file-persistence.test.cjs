#!/usr/bin/env node
'use strict';

// Tests for pre-compact hook activeFiles persistence (VAL-CM-001, VAL-CM-002, VAL-CM-010)

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
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
  // Remove files so each test starts clean
  for (const file of TRACKED_FILES) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
});

afterEach(() => {
  restoreFiles();
});

// VAL-CM-001: activeFiles present in snapshot from edit-counter
test('activeFiles is saved from edit-counter.json files field', () => {
  fs.writeFileSync(
    EDIT_COUNTER_FILE,
    JSON.stringify({ count: 3, files: ['src/a.js', 'src/b.js'] }),
    'utf8'
  );

  const result = runHook('{"hook_event_name":"PreCompact"}');
  assert.strictEqual(
    result.status,
    0,
    `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`
  );
  assert.ok(fs.existsSync(SNAPSHOT_FILE), 'Snapshot file must exist');

  const snapshot = readJson(SNAPSHOT_FILE);
  assert.deepStrictEqual(
    snapshot.activeFiles,
    ['src/a.js', 'src/b.js'],
    'activeFiles must match files from edit-counter.json'
  );
});

// VAL-CM-002: all 7 fields present in snapshot
test('snapshot contains all 7 required fields', () => {
  fs.writeFileSync(EDIT_COUNTER_FILE, JSON.stringify({ count: 5, files: ['foo.ts'] }), 'utf8');
  fs.writeFileSync(
    SESSION_METRICS_FILE,
    JSON.stringify({ corrections_count: 2, prompt_count: 10 }),
    'utf8'
  );
  fs.writeFileSync(
    DRIFT_STATE_FILE,
    JSON.stringify({ originalIntent: 'Build feature X', editCount: 3 }),
    'utf8'
  );

  const result = runHook('{"hook_event_name":"PreCompact"}');
  assert.strictEqual(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);

  const snapshot = readJson(SNAPSHOT_FILE);

  // All 7 fields must be present
  assert.ok('timestamp' in snapshot, 'snapshot must have timestamp');
  assert.ok('editCount' in snapshot, 'snapshot must have editCount');
  assert.ok('correctionCount' in snapshot, 'snapshot must have correctionCount');
  assert.ok('promptCount' in snapshot, 'snapshot must have promptCount');
  assert.ok('originalIntent' in snapshot, 'snapshot must have originalIntent');
  assert.ok('driftEditCount' in snapshot, 'snapshot must have driftEditCount');
  assert.ok('activeFiles' in snapshot, 'snapshot must have activeFiles');

  // Verify types and values
  assert.strictEqual(typeof snapshot.timestamp, 'string', 'timestamp must be a string');
  assert.strictEqual(snapshot.editCount, 5, 'editCount must match count field');
  assert.strictEqual(snapshot.correctionCount, 2, 'correctionCount must match corrections_count');
  assert.strictEqual(snapshot.promptCount, 10, 'promptCount must match prompt_count');
  assert.strictEqual(snapshot.originalIntent, 'Build feature X', 'originalIntent must match');
  assert.strictEqual(
    snapshot.driftEditCount,
    3,
    'driftEditCount must match editCount from drift-state'
  );
  assert.deepStrictEqual(snapshot.activeFiles, ['foo.ts'], 'activeFiles must match files array');
});

// VAL-CM-010: fail-open with missing files — activeFiles defaults to []
test('activeFiles defaults to [] when edit-counter.json is missing', () => {
  // No files at all — fully missing state
  const result = runHook('{"hook_event_name":"PreCompact"}');
  assert.strictEqual(
    result.status,
    0,
    `Hook must exit 0 with missing files. stderr: ${result.stderr}`
  );
  assert.ok(
    fs.existsSync(SNAPSHOT_FILE),
    'Snapshot file must be written even with missing sources'
  );

  const snapshot = readJson(SNAPSHOT_FILE);
  assert.deepStrictEqual(
    snapshot.activeFiles,
    [],
    'activeFiles must default to [] when file missing'
  );
});

test('activeFiles defaults to [] when edit-counter.json has no files field', () => {
  // count present but no files field
  fs.writeFileSync(EDIT_COUNTER_FILE, JSON.stringify({ count: 7 }), 'utf8');

  const result = runHook('{"hook_event_name":"PreCompact"}');
  assert.strictEqual(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);

  const snapshot = readJson(SNAPSHOT_FILE);
  assert.deepStrictEqual(
    snapshot.activeFiles,
    [],
    'activeFiles must default to [] when files field absent'
  );
});

test('activeFiles defaults to [] when edit-counter.json is malformed JSON', () => {
  fs.writeFileSync(EDIT_COUNTER_FILE, '{not valid json', 'utf8');

  const result = runHook('{"hook_event_name":"PreCompact"}');
  assert.strictEqual(
    result.status,
    0,
    `Hook must exit 0 with malformed JSON. stderr: ${result.stderr}`
  );

  const snapshot = readJson(SNAPSHOT_FILE);
  assert.deepStrictEqual(
    snapshot.activeFiles,
    [],
    'activeFiles must default to [] on malformed JSON'
  );
});

test('activeFiles defaults to [] when files field is not an array', () => {
  fs.writeFileSync(EDIT_COUNTER_FILE, JSON.stringify({ count: 2, files: 'notanarray' }), 'utf8');

  const result = runHook('{"hook_event_name":"PreCompact"}');
  assert.strictEqual(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);

  const snapshot = readJson(SNAPSHOT_FILE);
  assert.deepStrictEqual(
    snapshot.activeFiles,
    [],
    'activeFiles must default to [] when files is not an array'
  );
});

// Stdin passthrough unchanged
test('stdin is passed through to stdout unchanged', () => {
  const input = '{"hook_event_name":"PreCompact","session_id":"abc123","extra":"data"}';
  const result = runHook(input);
  assert.strictEqual(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
  assert.strictEqual(result.stdout, input, 'stdout must be identical to stdin input');
});

test('stdin passthrough works with empty object', () => {
  const result = runHook('{}');
  assert.strictEqual(result.status, 0, `Expected exit 0. stderr: ${result.stderr}`);
  assert.strictEqual(result.stdout, '{}', 'stdout must be identical to stdin input');
});
