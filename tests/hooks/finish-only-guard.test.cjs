// Agent: developer | Task: #9 | Session: 2026-03-10
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  enterDrainMode,
  isDraining,
  exitDrainMode,
  getDrainState,
  DRAIN_FILENAME
} = require('../../.claude/lib/context/drain-state.cjs');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'drain-test-'));
}

// ─── Drain State Manager Tests ────────────────────────────────────────────────

describe('drain-state', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });

  test('enterDrainMode writes drain-state.json with sessionId and deadline', () => {
    enterDrainMode({ sessionId: 'abc', drainDeadlineMinutes: 5 }, tmpDir);
    const drainPath = path.join(tmpDir, DRAIN_FILENAME);
    assert.ok(fs.existsSync(drainPath));
    const content = JSON.parse(fs.readFileSync(drainPath, 'utf8'));
    assert.equal(content.sessionId, 'abc');
    assert.ok(content.drainDeadline);
    const deadline = new Date(content.drainDeadline);
    const now = new Date();
    // Deadline should be ~5 minutes from now (within 10 second tolerance)
    assert.ok(deadline > now);
    assert.ok(deadline < new Date(Date.now() + 5 * 60 * 1000 + 10000));
    assert.ok(content.activatedAt);
  });

  test('isDraining returns true when drain-state.json exists with matching sessionId', () => {
    enterDrainMode({ sessionId: 'abc', drainDeadlineMinutes: 5 }, tmpDir);
    assert.equal(isDraining('abc', tmpDir), true);
  });

  test('isDraining returns false when no drain-state.json', () => {
    assert.equal(isDraining('abc', tmpDir), false);
  });

  test('isDraining returns false for DIFFERENT sessionId (new session)', () => {
    enterDrainMode({ sessionId: 'old-session', drainDeadlineMinutes: 5 }, tmpDir);
    assert.equal(isDraining('new-session', tmpDir), false);
  });

  test('isDraining returns false when drainDeadline has passed', () => {
    // Write expired drain state manually
    const expiredState = {
      sessionId: 'abc',
      drainDeadline: new Date(Date.now() - 60 * 1000).toISOString(),
      activatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString()
    };
    fs.writeFileSync(path.join(tmpDir, DRAIN_FILENAME), JSON.stringify(expiredState), 'utf8');
    assert.equal(isDraining('abc', tmpDir), false);
  });

  test('exitDrainMode removes drain-state.json', () => {
    enterDrainMode({ sessionId: 'abc' }, tmpDir);
    exitDrainMode(tmpDir);
    assert.equal(fs.existsSync(path.join(tmpDir, DRAIN_FILENAME)), false);
  });

  test('exitDrainMode is idempotent (no error if file already gone)', () => {
    assert.doesNotThrow(() => exitDrainMode(tmpDir));
  });

  test('getDrainState returns parsed state when file exists', () => {
    enterDrainMode({ sessionId: 'abc', drainDeadlineMinutes: 5 }, tmpDir);
    const state = getDrainState(tmpDir);
    assert.ok(state);
    assert.equal(state.sessionId, 'abc');
  });

  test('getDrainState returns null when file does not exist', () => {
    const state = getDrainState(tmpDir);
    assert.equal(state, null);
  });

  test('enterDrainMode throws if sessionId is missing', () => {
    assert.throws(() => enterDrainMode({}, tmpDir), /sessionId is required/);
  });
});

// ─── Finish-Only Guard Hook Tests (stdin/stdout simulation) ───────────────────

const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '../../.claude/hooks/routing/finish-only-guard.cjs');

function runHook(toolName, sessionId, drainDir) {
  const input = JSON.stringify({ tool_name: toolName });
  const env = {
    ...process.env,
    CLAUDE_SESSION_ID: sessionId,
    SHIFT_CHANGE_RUNTIME_DIR: drainDir
  };
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input,
    encoding: 'utf8',
    env,
    shell: false
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { allow: true, _raw: result.stdout, _err: result.stderr };
  }
}

describe('finish-only-guard hook', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });

  test('allows TaskCreate when NOT draining', () => {
    const result = runHook('TaskCreate', 'session-1', tmpDir);
    assert.equal(result.allow, true);
  });

  test('allows TaskUpdate even during drain', () => {
    enterDrainMode({ sessionId: 'session-1', drainDeadlineMinutes: 5 }, tmpDir);
    const result = runHook('TaskUpdate', 'session-1', tmpDir);
    assert.equal(result.allow, true);
  });

  test('allows TaskList even during drain', () => {
    enterDrainMode({ sessionId: 'session-1', drainDeadlineMinutes: 5 }, tmpDir);
    const result = runHook('TaskList', 'session-1', tmpDir);
    assert.equal(result.allow, true);
  });

  test('allows TaskCreate when drainDeadline has expired', () => {
    const expiredState = {
      sessionId: 'session-1',
      drainDeadline: new Date(Date.now() - 60 * 1000).toISOString(),
      activatedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(tmpDir, DRAIN_FILENAME), JSON.stringify(expiredState), 'utf8');
    const result = runHook('TaskCreate', 'session-1', tmpDir);
    assert.equal(result.allow, true);
  });

  test('allows non-task tools unconditionally', () => {
    enterDrainMode({ sessionId: 'session-1', drainDeadlineMinutes: 5 }, tmpDir);
    const result = runHook('Read', 'session-1', tmpDir);
    assert.equal(result.allow, true);
  });

  test('fails open on corrupt drain-state.json', () => {
    fs.writeFileSync(path.join(tmpDir, DRAIN_FILENAME), 'NOT JSON {{', 'utf8');
    const result = runHook('TaskCreate', 'session-1', tmpDir);
    assert.equal(result.allow, true);
  });
});
