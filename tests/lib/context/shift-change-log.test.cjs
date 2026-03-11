// Agent: developer | Task: #7 | Session: 2026-03-10
'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  writeHandoverLog,
  validateHandoverLog,
  SCHEMA_VERSION,
  LOG_FILENAME
} = require('../../../.claude/lib/context/shift-change-log-writer.cjs');

const {
  readHandoverLog,
  claimHandoverLog
} = require('../../../.claude/lib/context/shift-change-log-reader.cjs');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sc-log-test-'));
}

function validLog(overrides = {}) {
  return {
    sessionId: 'test-session-1',
    activePid: 12345,
    currentObjective: 'Implement shift-change system',
    contextPercent: 0.82,
    contextSummary: 'Working on agent-studio. Context management subsystem.',
    memoryPointers: [{ file: 'decisions.md', key: 'ADR-120', summary: 'Archive by threshold' }],
    pendingActions: [{ taskId: 'T1', description: 'Finish Phase 2', priority: 'high' }],
    subagentStates: [{ taskId: 'T2', agentType: 'developer', status: 'completed' }],
    resumeInstructions: 'Read decisions.md, then continue Phase 2 implementation.',
    pendingMemoryWrites: ['Decision: use marker-file over PID kill'],
    drainDeadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides
  };
}

// ─── Schema / Validation Tests ───────────────────────────────────────────────

describe('shift-change-log schema', () => {
  test('validates a well-formed handover log', () => {
    assert.doesNotThrow(() => validateHandoverLog(validLog()));
  });

  test('rejects missing required field: sessionId', () => {
    assert.throws(
      () => validateHandoverLog(validLog({ sessionId: undefined })),
      /Missing required field: sessionId/
    );
  });

  test('rejects missing required field: currentObjective', () => {
    assert.throws(
      () => validateHandoverLog(validLog({ currentObjective: undefined })),
      /Missing required field/
    );
  });

  test('rejects contextPercent < 0', () => {
    assert.throws(
      () => validateHandoverLog(validLog({ contextPercent: -0.1 })),
      /contextPercent/
    );
  });

  test('rejects contextPercent > 1', () => {
    assert.throws(
      () => validateHandoverLog(validLog({ contextPercent: 1.5 })),
      /contextPercent/
    );
  });

  test('rejects invalid priority in pendingActions', () => {
    assert.throws(
      () => validateHandoverLog(validLog({
        pendingActions: [{ taskId: 'T1', description: 'foo', priority: 'critical' }]
      })),
      /priority/
    );
  });

  test('accepts valid status values', () => {
    // validateHandoverLog only checks status if provided; writer sets it
    assert.doesNotThrow(() => validateHandoverLog(validLog({ status: 'READY' })));
  });

  test('rejects invalid status value', () => {
    assert.throws(
      () => validateHandoverLog(validLog({ status: 'INVALID' })),
      /status/
    );
  });
});

// ─── Writer Tests ─────────────────────────────────────────────────────────────

describe('shift-change-log writer', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  after(() => { /* cleanup is OS-handled */ });

  test('writes a valid handover log', () => {
    const outPath = writeHandoverLog(validLog(), tmpDir);
    assert.ok(fs.existsSync(outPath));
    const content = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(content.currentObjective, 'Implement shift-change system');
  });

  test('written log has status READY', () => {
    const outPath = writeHandoverLog(validLog(), tmpDir);
    const content = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(content.status, 'READY');
  });

  test('log is written to LOG_FILENAME in output dir', () => {
    writeHandoverLog(validLog(), tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, LOG_FILENAME)));
  });

  test('uses atomic temp-file-then-rename (no .tmp file remaining)', () => {
    writeHandoverLog(validLog(), tmpDir);
    const files = fs.readdirSync(tmpDir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0, 'No .tmp files should remain after write');
  });

  test('rejects invalid data (missing required fields)', () => {
    assert.throws(() => writeHandoverLog({}), /Missing required field/);
  });

  test('generates handoffId as UUID if not provided', () => {
    const outPath = writeHandoverLog(validLog(), tmpDir);
    const content = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.match(content.handoffId, /^[0-9a-f-]{36}$/i);
  });

  test('preserves provided handoffId', () => {
    const id = crypto.randomUUID();
    const outPath = writeHandoverLog(validLog({ handoffId: id }), tmpDir);
    const content = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(content.handoffId, id);
  });

  test('generates timestamp if not provided', () => {
    const outPath = writeHandoverLog(validLog(), tmpDir);
    const content = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(content.timestamp);
    assert.doesNotThrow(() => new Date(content.timestamp));
  });

  test('sets schemaVersion to current version', () => {
    const outPath = writeHandoverLog(validLog(), tmpDir);
    const content = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(content.schemaVersion, SCHEMA_VERSION);
  });
});

// ─── Reader Tests ─────────────────────────────────────────────────────────────

describe('shift-change-log reader', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });

  test('reads and parses a READY log', () => {
    writeHandoverLog(validLog(), tmpDir);
    const result = readHandoverLog(tmpDir);
    assert.ok(result);
    assert.equal(result.currentObjective, 'Implement shift-change system');
    assert.equal(result.status, 'READY');
  });

  test('returns null when no log exists', () => {
    const result = readHandoverLog(tmpDir);
    assert.equal(result, null);
  });

  test('returns null for corrupt JSON', () => {
    fs.writeFileSync(path.join(tmpDir, LOG_FILENAME), 'not json{{', 'utf8');
    const result = readHandoverLog(tmpDir);
    assert.equal(result, null);
  });

  test('rejects log with status WRITING (incomplete write)', () => {
    writeHandoverLog(validLog(), tmpDir);
    // Manually set status back to WRITING to simulate crash
    const logPath = path.join(tmpDir, LOG_FILENAME);
    const content = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    content.status = 'WRITING';
    fs.writeFileSync(logPath, JSON.stringify(content), 'utf8');
    const result = readHandoverLog(tmpDir);
    assert.equal(result, null);
  });

  test('rejects log with mismatched schemaVersion', () => {
    writeHandoverLog(validLog(), tmpDir);
    const logPath = path.join(tmpDir, LOG_FILENAME);
    const content = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    content.schemaVersion = '99.0.0';
    fs.writeFileSync(logPath, JSON.stringify(content), 'utf8');
    const result = readHandoverLog(tmpDir);
    assert.equal(result, null);
  });

  test('rejects CLAIMED log (not consumable)', () => {
    writeHandoverLog(validLog(), tmpDir);
    claimHandoverLog(tmpDir, 'new-session');
    const result = readHandoverLog(tmpDir);
    assert.equal(result, null);
  });

  test('claimHandoverLog sets status to CLAIMED', () => {
    writeHandoverLog(validLog(), tmpDir);
    const claimed = claimHandoverLog(tmpDir, 'new-session-id');
    assert.equal(claimed, true);
    const logPath = path.join(tmpDir, LOG_FILENAME);
    const content = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    assert.equal(content.status, 'CLAIMED');
    assert.equal(content.claimedBy, 'new-session-id');
  });

  test('claimHandoverLog returns false when no log exists', () => {
    const claimed = claimHandoverLog(tmpDir, 'any-session');
    assert.equal(claimed, false);
  });
});
