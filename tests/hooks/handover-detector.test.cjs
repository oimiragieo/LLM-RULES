// Agent: developer | Task: #10 | Session: 2026-03-10
'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getOrCreateSessionId,
  SESSION_ID_FILENAME
} = require('../../.claude/lib/context/session-id-manager.cjs');

const {
  writeHandoverLog,
  LOG_FILENAME
} = require('../../.claude/lib/context/shift-change-log-writer.cjs');

const {
  enterDrainMode,
  DRAIN_FILENAME
} = require('../../.claude/lib/context/drain-state.cjs');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handover-test-'));
}

function validLog(overrides = {}) {
  return {
    sessionId: 'old-session',
    activePid: 12345,
    currentObjective: 'Implement shift-change system',
    contextPercent: 0.85,
    contextSummary: 'Working on agent-studio context mgmt.',
    memoryPointers: [{ file: 'decisions.md', key: 'ADR-120', summary: 'Archive by threshold' }],
    pendingActions: [{ taskId: 'T9', description: 'Finish Phase 2', priority: 'high' }],
    subagentStates: [],
    resumeInstructions: 'Run TaskList, then continue Phase 2.',
    pendingMemoryWrites: ['Decision: marker-file over PID kill'],
    drainDeadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides
  };
}

// ─── Session ID Manager Tests ─────────────────────────────────────────────────

describe('session-id-manager', () => {
  let tmpDir;
  let origEnv;
  beforeEach(() => {
    tmpDir = makeTmpDir();
    origEnv = process.env.CLAUDE_SESSION_ID;
    delete process.env.CLAUDE_SESSION_ID;
  });
  afterEach(() => {
    if (origEnv !== undefined) process.env.CLAUDE_SESSION_ID = origEnv;
    else delete process.env.CLAUDE_SESSION_ID;
  });

  test('generates a new sessionId on first call', () => {
    const id = getOrCreateSessionId(tmpDir);
    assert.ok(id && id.length > 0);
    assert.ok(fs.existsSync(path.join(tmpDir, SESSION_ID_FILENAME)));
  });

  test('returns same sessionId on subsequent calls', () => {
    const id1 = getOrCreateSessionId(tmpDir);
    const id2 = getOrCreateSessionId(tmpDir);
    assert.equal(id1, id2);
  });

  test('generates NEW sessionId when called with force=true', () => {
    const id1 = getOrCreateSessionId(tmpDir);
    const id2 = getOrCreateSessionId(tmpDir, { force: true });
    assert.notEqual(id1, id2);
  });

  test('reads sessionId from env CLAUDE_SESSION_ID if set', () => {
    process.env.CLAUDE_SESSION_ID = 'env-provided-id';
    const id = getOrCreateSessionId(tmpDir);
    assert.equal(id, 'env-provided-id');
    delete process.env.CLAUDE_SESSION_ID;
  });
});

// ─── Handover Detector Hook Tests (stdin/stdout simulation) ──────────────────

const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '../../.claude/hooks/routing/handover-detector.cjs');

function runHook(runtimeDir) {
  const input = JSON.stringify({ prompt: 'hello' });
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    env: { ...process.env, SHIFT_CHANGE_RUNTIME_DIR: runtimeDir },
    shell: false
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { allow: true, _raw: result.stdout, _err: result.stderr };
  }
}

describe('handover-detector hook', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });

  test('allows through when no handover log exists', () => {
    const result = runHook(tmpDir);
    assert.equal(result.allow, true);
    assert.ok(!result.message || result.message === '');
  });

  test('does nothing when session-id.json already exists (not fresh session)', () => {
    // Pre-create session-id.json to simulate existing session
    const sessionPath = path.join(tmpDir, SESSION_ID_FILENAME);
    fs.writeFileSync(sessionPath, JSON.stringify({ sessionId: 'existing-id', createdAt: new Date().toISOString() }), 'utf8');
    writeHandoverLog(validLog(), tmpDir);
    const result = runHook(tmpDir);
    assert.equal(result.allow, true);
    // Should not have injected resume content (message should be empty or undefined)
    assert.ok(!result.message || !result.message.includes('SHIFT CHANGE RESUME'));
  });

  test('detects existing READY handover log on fresh session and injects resume context', () => {
    writeHandoverLog(validLog(), tmpDir);
    const result = runHook(tmpDir);
    assert.equal(result.allow, true);
    assert.ok(result.message && result.message.includes('SHIFT CHANGE RESUME'));
    assert.ok(result.message.includes('Implement shift-change system'));
  });

  test('claims the log after injecting resume context', () => {
    writeHandoverLog(validLog(), tmpDir);
    runHook(tmpDir);
    const logPath = path.join(tmpDir, LOG_FILENAME);
    const content = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    assert.equal(content.status, 'CLAIMED');
  });

  test('generates a new sessionId for the fresh session', () => {
    writeHandoverLog(validLog(), tmpDir);
    runHook(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, SESSION_ID_FILENAME)));
  });

  test('clears stale drain-state.json from old session', () => {
    writeHandoverLog(validLog(), tmpDir);
    // Write drain state belonging to old session
    enterDrainMode({ sessionId: 'old-session', drainDeadlineMinutes: 5 }, tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, DRAIN_FILENAME)));
    runHook(tmpDir);
    // After hook, stale drain should be cleared (old sessionId != new sessionId)
    assert.equal(fs.existsSync(path.join(tmpDir, DRAIN_FILENAME)), false);
  });

  test('does nothing when handover log is CLAIMED', () => {
    writeHandoverLog(validLog(), tmpDir);
    const logPath = path.join(tmpDir, LOG_FILENAME);
    const content = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    content.status = 'CLAIMED';
    fs.writeFileSync(logPath, JSON.stringify(content), 'utf8');
    const result = runHook(tmpDir);
    assert.equal(result.allow, true);
    assert.ok(!result.message || !result.message.includes('SHIFT CHANGE RESUME'));
  });

  test('fails open on error (no session-id, corrupt log)', () => {
    fs.writeFileSync(path.join(tmpDir, LOG_FILENAME), 'CORRUPT{{', 'utf8');
    const result = runHook(tmpDir);
    assert.equal(result.allow, true);
  });
});
