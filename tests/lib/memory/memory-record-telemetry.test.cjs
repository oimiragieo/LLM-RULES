#!/usr/bin/env node
/**
 * Memory Record Telemetry Tests (P1-3)
 */
'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let TEST_DIR;
let MEMORY_DIR;
let METRICS_DIR;
let TELEMETRY_FILE;

function setup() {
  TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-mrt-'));
  MEMORY_DIR = path.join(TEST_DIR, '.claude', 'context', 'memory');
  METRICS_DIR = path.join(MEMORY_DIR, 'metrics');
  TELEMETRY_FILE = path.join(METRICS_DIR, 'memory-record-telemetry.jsonl');
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function cleanup() {
  if (TEST_DIR && fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function getRecordingOps() {
  const recordingPath =
    require.resolve('../../../.claude/lib/memory/memory-manager-core-recording.cjs');
  delete require.cache[recordingPath];
  const { createRecordingOps } = require(recordingPath);
  return createRecordingOps({
    PROJECT_ROOT: TEST_DIR,
    validateProjectRoot: root => {
      if (!root) throw new Error('invalid root');
    },
    getMemoryDir: root => path.join(root, '.claude', 'context', 'memory'),
    ensureDir: dir => fs.mkdirSync(dir, { recursive: true }),
    withFileLockSync: (_filePath, fn) => fn(),
    buildEntryId: () => 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2),
    normalizeArea: area => area || 'general',
    maybeSyncMemoryJson: () => {},
    emitMemorySavedEvent: () => {},
  });
}

function readTelemetryLines() {
  if (!fs.existsSync(TELEMETRY_FILE)) return [];
  return fs
    .readFileSync(TELEMETRY_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

describe('MemoryRecord telemetry — recordGotcha', () => {
  before(setup);
  after(cleanup);
  beforeEach(() => {
    if (fs.existsSync(TELEMETRY_FILE)) fs.unlinkSync(TELEMETRY_FILE);
  });

  it('appends a telemetry entry when gotcha is recorded successfully', () => {
    const ops = getRecordingOps();
    const wrote = ops.recordGotcha(
      { text: 'test gotcha for telemetry', area: 'testing' },
      TEST_DIR
    );
    assert.equal(wrote, true, 'recordGotcha should return true');
    const lines = readTelemetryLines();
    assert.equal(lines.length, 1, 'Should have exactly 1 telemetry entry');
    const entry = lines[0];
    assert.equal(entry.type, 'gotcha');
    assert.equal(entry.success, true);
    assert.ok(typeof entry.timestamp === 'string');
    assert.ok(!isNaN(Date.parse(entry.timestamp)), 'ts should be valid ISO-8601');
  });

  it('telemetry entry includes area field', () => {
    const ops = getRecordingOps();
    ops.recordGotcha({ text: 'gotcha with area', area: 'platform' }, TEST_DIR);
    const lines = readTelemetryLines();
    assert.equal(lines.length, 1);
    assert.equal(lines[0].area, 'platform');
  });

  it('does not append telemetry for duplicate gotcha', () => {
    const ops = getRecordingOps();
    ops.recordGotcha({ text: 'duplicate gotcha', area: 'testing' }, TEST_DIR);
    const wrote2 = ops.recordGotcha({ text: 'duplicate gotcha', area: 'testing' }, TEST_DIR);
    assert.equal(wrote2, false, 'Duplicate should return false');
    const lines = readTelemetryLines();
    assert.equal(lines.length, 1, 'Only 1 telemetry entry for the first write');
  });

  it('creates metrics directory automatically if it does not exist', () => {
    if (fs.existsSync(METRICS_DIR)) fs.rmSync(METRICS_DIR, { recursive: true });
    const ops = getRecordingOps();
    ops.recordGotcha({ text: 'auto-create metrics dir', area: 'testing' }, TEST_DIR);
    assert.ok(fs.existsSync(METRICS_DIR), 'metrics directory should be created');
    assert.ok(fs.existsSync(TELEMETRY_FILE), 'telemetry file should be created');
  });
});

describe('MemoryRecord telemetry — recordPattern', () => {
  before(setup);
  after(cleanup);
  beforeEach(() => {
    if (fs.existsSync(TELEMETRY_FILE)) fs.unlinkSync(TELEMETRY_FILE);
  });

  it('appends a telemetry entry when pattern is recorded successfully', () => {
    const ops = getRecordingOps();
    const wrote = ops.recordPattern(
      { text: 'test pattern for telemetry', area: 'security' },
      TEST_DIR
    );
    assert.equal(wrote, true, 'recordPattern should return true');
    const lines = readTelemetryLines();
    assert.equal(lines.length, 1);
    const entry = lines[0];
    assert.equal(entry.type, 'pattern');
    assert.equal(entry.success, true);
    assert.equal(entry.area, 'security');
    assert.ok(typeof entry.timestamp === 'string');
  });

  it('does not append telemetry for duplicate pattern', () => {
    const ops = getRecordingOps();
    ops.recordPattern({ text: 'duplicate pattern', area: 'testing' }, TEST_DIR);
    const wrote2 = ops.recordPattern({ text: 'duplicate pattern', area: 'testing' }, TEST_DIR);
    assert.equal(wrote2, false);
    const lines = readTelemetryLines();
    assert.equal(lines.length, 1);
  });
});

describe('MemoryRecord telemetry — recordDiscovery', () => {
  before(setup);
  after(cleanup);
  beforeEach(() => {
    if (fs.existsSync(TELEMETRY_FILE)) fs.unlinkSync(TELEMETRY_FILE);
  });

  it('appends a telemetry entry when discovery is recorded successfully', () => {
    const ops = getRecordingOps();
    const wrote = ops.recordDiscovery(
      '.claude/lib/test.cjs',
      'A test file for telemetry',
      'library',
      TEST_DIR
    );
    assert.equal(wrote, true, 'recordDiscovery should return true');
    const lines = readTelemetryLines();
    assert.equal(lines.length, 1);
    const entry = lines[0];
    assert.equal(entry.type, 'discovery');
    assert.equal(entry.success, true);
    assert.ok(typeof entry.timestamp === 'string');
  });

  it('multiple discoveries append multiple entries', () => {
    const ops = getRecordingOps();
    ops.recordDiscovery('.claude/lib/a.cjs', 'file A', 'library', TEST_DIR);
    ops.recordDiscovery('.claude/lib/b.cjs', 'file B', 'library', TEST_DIR);
    const lines = readTelemetryLines();
    assert.equal(lines.length, 2);
    assert.equal(lines[0].type, 'discovery');
    assert.equal(lines[1].type, 'discovery');
  });
});

describe('MemoryRecord telemetry — fail-safe behavior', () => {
  before(setup);
  after(cleanup);

  it('main operation succeeds even if telemetry write fails', () => {
    if (fs.existsSync(METRICS_DIR)) fs.rmSync(METRICS_DIR, { recursive: true });
    fs.mkdirSync(TELEMETRY_FILE, { recursive: true });
    let wrote;
    assert.doesNotThrow(() => {
      const ops = getRecordingOps();
      wrote = ops.recordGotcha({ text: 'telemetry fail safe', area: 'testing' }, TEST_DIR);
    }, 'recordGotcha should not throw even if telemetry write fails');
    assert.equal(wrote, true, 'Main operation should still succeed');
    if (fs.existsSync(TELEMETRY_FILE)) fs.rmSync(TELEMETRY_FILE, { recursive: true });
  });
});
