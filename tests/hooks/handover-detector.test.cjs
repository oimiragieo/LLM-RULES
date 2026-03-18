const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { getOrCreateSessionId } = require('../../.claude/lib/context/session-id-manager.cjs');

test('session-id-manager > generates a new sessionId on first call', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-session-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const id = getOrCreateSessionId(tmpDir);
  assert.ok(id);
  assert.strictEqual(typeof id, 'string');
  assert.ok(id.length > 10);

  const fileExists = fs.existsSync(path.join(tmpDir, 'session-id.json'));
  assert.ok(fileExists, 'session-id.json should be created');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('session-id-manager > returns same sessionId on subsequent calls', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-session-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const id1 = getOrCreateSessionId(tmpDir);
  const id2 = getOrCreateSessionId(tmpDir);
  assert.strictEqual(id1, id2, 'Should return the same ID');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('session-id-manager > generates NEW sessionId when called with force=true', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-session-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  const id1 = getOrCreateSessionId(tmpDir);
  const id2 = getOrCreateSessionId(tmpDir, { force: true });
  assert.notStrictEqual(id1, id2, 'Should return a new ID when forced');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('session-id-manager > reads sessionId from env CLAUDE_SESSION_ID if set', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-session-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  process.env.CLAUDE_SESSION_ID = 'test-env-session';
  try {
    const id = getOrCreateSessionId(tmpDir);
    assert.strictEqual(id, 'test-env-session', 'Should read from env val');
  } finally {
    delete process.env.CLAUDE_SESSION_ID;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

const { execFileSync } = require('child_process');
const { writeHandoverLog } = require('../../.claude/lib/context/shift-change-log-writer.cjs');
const { enterDrainMode } = require('../../.claude/lib/context/drain-state.cjs');

function runHook(inputJson, env = {}) {
  try {
    const hookPath = path.join(process.cwd(), '.claude/hooks/routing/handover-detector.cjs');
    if (!fs.existsSync(hookPath)) {
      throw new Error(`Hook file not found: ${hookPath}`);
    }
    const result = execFileSync('node', [hookPath], {
      input: JSON.stringify(inputJson),
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return JSON.parse(result);
  } catch (err) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch (_e) {
        /* ignore */
      }
    }
    throw err;
  }
}

test('handover-detector > detects existing READY handover log on fresh session', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  writeHandoverLog(
    {
      schemaVersion: '1.0.0',
      generation: 1,
      sessionId: 'old-session',
      resumeInstructions: 'Run tests',
      contextSummary: 'Did stuff',
      pendingActions: [{ taskId: '1', description: 'do thing', priority: 'high' }],
    },
    tmpDir
  );

  const res = runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' }); // ensure env empty

  assert.strictEqual(res.allow, true);
  assert.ok(res.message, 'Should inject message');
  assert.ok(res.message.includes('SHIFT CHANGE RESUME'));
  assert.ok(res.message.includes('Run tests'));

  // Clean up
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  const logPath = path.join(tmpDir, 'shift-change-log.json');
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
});

test('handover-detector > does nothing when no handover log exists', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const logPath = path.join(tmpDir, 'shift-change-log.json');
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  const sessionPath = path.join(tmpDir, 'session-id.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  const res = runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  assert.strictEqual(res.allow, true);
  assert.ok(!res.message, 'Should not have a message');

  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
});

test('handover-detector > does nothing when handover log is CLAIMED', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  const log = writeHandoverLog({ schemaVersion: '1.0.0', generation: 1, sessionId: 'old' }, tmpDir);
  log.status = 'CLAIMED';
  fs.writeFileSync(path.join(tmpDir, 'shift-change-log.json'), JSON.stringify(log));

  const res = runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });
  assert.strictEqual(res.allow, true);
  assert.ok(!res.message, 'Should not inject message for CLAIMED log');

  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  fs.unlinkSync(path.join(tmpDir, 'shift-change-log.json'));
});

test('handover-detector > claims the log after injecting resume context', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  writeHandoverLog({ schemaVersion: '1.0.0', generation: 1, sessionId: 'old' }, tmpDir);

  runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  const content = JSON.parse(fs.readFileSync(path.join(tmpDir, 'shift-change-log.json'), 'utf8'));
  assert.strictEqual(content.status, 'CLAIMED');

  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  fs.unlinkSync(path.join(tmpDir, 'shift-change-log.json'));
});

test('handover-detector > generates a new sessionId for the fresh session', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  writeHandoverLog({ schemaVersion: '1.0.0', generation: 1, sessionId: 'old' }, tmpDir);

  runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  assert.ok(fs.existsSync(sessionPath), 'Should generate a new session id');

  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  fs.unlinkSync(path.join(tmpDir, 'shift-change-log.json'));
});

test('handover-detector > clears stale drain-state.json from old session', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  writeHandoverLog({ schemaVersion: '1.0.0', generation: 1, sessionId: 'old' }, tmpDir);
  enterDrainMode({ sessionId: 'old', drainDeadlineMinutes: 5 }, tmpDir);

  runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  assert.strictEqual(
    fs.existsSync(path.join(tmpDir, 'drain-state.json')),
    false,
    'Should remove stale drain state'
  );

  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  fs.unlinkSync(path.join(tmpDir, 'shift-change-log.json'));
});

test('handover-detector > writes pending memory writes from handover log to handoff_inbox.md', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  const memoryDir = path.join(process.cwd(), '.claude/context/memory');
  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
  const inboxPath = path.join(memoryDir, 'handoff_inbox.md');
  const origInbox = fs.existsSync(inboxPath) ? fs.readFileSync(inboxPath, 'utf8') : '';

  writeHandoverLog(
    {
      schemaVersion: '1.0.0',
      generation: 1,
      sessionId: 'old',
      pendingMemoryWrites: ['Decision: use JWT in M3'],
    },
    tmpDir
  );

  runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  const newInbox = fs.readFileSync(inboxPath, 'utf8');
  assert.ok(
    newInbox.includes('Decision: use JWT in M3'),
    'Should append memory writes to handoff_inbox'
  );
  assert.ok(
    newInbox.includes('Memory items from session old'),
    'Should include attribution header'
  );

  // Clean up
  fs.writeFileSync(inboxPath, origInbox);
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  fs.unlinkSync(path.join(tmpDir, 'shift-change-log.json'));
});

test('handover-detector > MT-A: Restores CLAIMED logs older than 5 minutes to READY', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const logPath = path.join(tmpDir, 'shift-change-log.json');
  const ackPath = path.join(tmpDir, 'shift-change-ack.json');
  const sessionPath = path.join(tmpDir, 'session-id.json');

  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);

  // Create a log in CLAIMED state exactly 6 minutes old
  const oldLog = {
    schemaVersion: '1.0.0',
    status: 'CLAIMED',
    sessionId: 'stuck-session',
    generation: 1,
  };
  fs.writeFileSync(logPath, JSON.stringify(oldLog));
  const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
  fs.utimesSync(logPath, new Date(sixMinutesAgo), new Date(sixMinutesAgo));

  runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  assert.ok(fs.existsSync(logPath), 'Log should still exist after recovery attempt');
  const recoveredLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  assert.strictEqual(
    recoveredLog.status,
    'CLAIMED',
    'Log should now be claimed by the current session since it was reset to READY first'
  );

  // Clean up
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
});

test('handover-detector > generates Sentinel ACK json upon successful claim', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const ackPath = path.join(tmpDir, 'shift-change-ack.json');
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);

  writeHandoverLog({ schemaVersion: '1.0.0', generation: 1, sessionId: 'old' }, tmpDir);

  runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: 'new-ack-session' });

  assert.ok(fs.existsSync(ackPath), 'Sentinel ACK should be created');
  const ack = JSON.parse(fs.readFileSync(ackPath, 'utf8'));
  assert.strictEqual(ack.claimedBy, 'new-ack-session');
  assert.strictEqual(ack.originalSession, 'old');

  // Clean up
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  fs.unlinkSync(path.join(tmpDir, 'shift-change-log.json'));
});

test('handover-detector > M8.1: injected message contains Step 0 pre-flight block', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  const ackPath = path.join(tmpDir, 'shift-change-ack.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);

  writeHandoverLog(
    {
      schemaVersion: '1.0.0',
      generation: 1,
      sessionId: 'old-session',
      resumeInstructions: 'Resume the refactor task',
      contextSummary: 'Working on Phase 8',
    },
    tmpDir
  );

  const res = runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  assert.strictEqual(res.allow, true);
  assert.ok(res.message, 'Should inject message');

  // IMMEDIATE ACTION must come FIRST (before any pre-flight)
  assert.ok(res.message.includes('IMMEDIATE ACTION'), 'Should include IMMEDIATE ACTION header');
  assert.ok(res.message.includes('Resume the refactor task'), 'Should include resumeInstructions');

  // Pre-flight section must exist but labeled as BACKGROUND (not blocking)
  assert.ok(res.message.includes('Pre-flight'), 'Should include pre-flight section');
  assert.ok(res.message.includes('BACKGROUND'), 'Pre-flight should be labeled BACKGROUND');
  assert.ok(res.message.includes('stale-tasks.json'), 'Should reference stale-tasks.json');
  assert.ok(res.message.includes('reflection-spawn-request.json'), 'Should reference reflection queue');

  // IMMEDIATE ACTION must appear BEFORE pre-flight in the message
  const actionIdx = res.message.indexOf('IMMEDIATE ACTION');
  const preflightIdx = res.message.indexOf('Pre-flight');
  assert.ok(actionIdx < preflightIdx, 'IMMEDIATE ACTION must come before Pre-flight');

  // Clean up
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  fs.unlinkSync(path.join(tmpDir, 'shift-change-log.json'));
});

test('handover-detector > FRESH_SPAWN: clears inherited session-id.json and injects resume message', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  const ackPath = path.join(tmpDir, 'shift-change-ack.json');
  const logPath = path.join(tmpDir, 'shift-change-log.json');

  // Ensure clean slate
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);

  // Simulate old session's session-id.json inherited by new window
  const oldSessionId = 'old-session-inherited-abc123';
  fs.writeFileSync(sessionPath, JSON.stringify({ sessionId: oldSessionId }), 'utf8');

  // Write READY handover log from the old session
  writeHandoverLog(
    {
      schemaVersion: '1.0.0',
      generation: 1,
      sessionId: oldSessionId,
      resumeInstructions: 'Continue the FRESH_SPAWN test task',
      contextSummary: 'Testing FRESH_SPAWN env var behavior',
      pendingMemoryWrites: [],
      pendingActions: [],
    },
    tmpDir
  );

  // Run hook WITH CLAUDE_FRESH_SPAWN=1 (simulates newly spawned window)
  const res = runHook({ command: 'continue' }, { CLAUDE_SESSION_ID: '', CLAUDE_FRESH_SPAWN: '1' });

  assert.strictEqual(res.allow, true);
  assert.ok(res.message, 'Should inject resume message');
  assert.ok(
    res.message.includes('SHIFT CHANGE RESUME'),
    'Should include SHIFT CHANGE RESUME header'
  );
  assert.ok(
    res.message.includes('Continue the FRESH_SPAWN test task'),
    'Should include resumeInstructions from handover log'
  );

  // ACK sentinel should have been written
  assert.ok(fs.existsSync(ackPath), 'ACK sentinel should be written');

  // Clean up
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
});

// ============================================================
// TDD RED Phase: New tests for structured JSON handoff format
// These tests should FAIL until handover-detector.cjs is updated
// to handle the new structured resumeInstructions format.
// ============================================================

test('handover-detector > correctly parses structured JSON handoff log (new format)', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  const ackPath = path.join(tmpDir, 'shift-change-ack.json');
  const logPath = path.join(tmpDir, 'shift-change-log.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);

  // Write a handover log with structured resumeInstructions (v2.0.0 format)
  const structuredLog = {
    schemaVersion: '2.0.0',
    generation: 1,
    sessionId: 'structured-test-session',
    status: 'READY',
    tokenCount: 155000,
    resumeInstructions: {
      objective: 'Implement session handoff auto-trigger',
      nextStep: 'Run failing tests and implement session-budget-watchdog.cjs',
      openTasks: ['task-5: Write auto-trigger hook', 'task-6: Update handover-detector'],
      keyFiles: ['.claude/hooks/session/session-budget-watchdog.cjs'],
      recentDecisions: ['ADR: Use 3-tier threshold model (140K/160K/180K)'],
      risks: ['budget-tracker.json may not be updated by any hook'],
      resumePrompt: 'You are resuming a session-handoff overhaul. Start with TaskList().',
    },
    contextSummary: 'Working on TDD RED phase',
    fallbackInstruction: 'Run TaskList() to discover pending work',
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(logPath, JSON.stringify(structuredLog, null, 2), 'utf8');

  const res = runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  assert.strictEqual(res.allow, true);
  assert.ok(res.message, 'Should inject message for structured log');

  // The resume message should include the objective from structured format
  assert.ok(
    res.message.includes('Implement session handoff auto-trigger'),
    'Should include objective from structured resumeInstructions'
  );

  // Should include the nextStep
  assert.ok(
    res.message.includes('session-budget-watchdog'),
    'Should include nextStep content from structured resumeInstructions'
  );

  // Should include openTasks
  assert.ok(
    res.message.includes('task-5') || res.message.includes('Write auto-trigger hook'),
    'Should include openTasks from structured resumeInstructions'
  );

  // Clean up
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
});

test('handover-detector > falls back gracefully to legacy string format', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  const ackPath = path.join(tmpDir, 'shift-change-ack.json');
  const logPath = path.join(tmpDir, 'shift-change-log.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);

  // Write a legacy handover log with string resumeInstructions (v1.0.0 format)
  writeHandoverLog(
    {
      schemaVersion: '1.0.0',
      generation: 1,
      sessionId: 'legacy-session',
      resumeInstructions: 'Resume the auth refactor task',
      contextSummary: 'Working on authentication',
    },
    tmpDir
  );

  const res = runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  assert.strictEqual(res.allow, true);
  assert.ok(res.message, 'Should inject message for legacy format');
  assert.ok(
    res.message.includes('Resume the auth refactor task'),
    'Should still render legacy string resumeInstructions'
  );

  // Clean up
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
});

test('handover-detector > injects objective and nextStep into session context', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  const sessionPath = path.join(tmpDir, 'session-id.json');
  const ackPath = path.join(tmpDir, 'shift-change-ack.json');
  const logPath = path.join(tmpDir, 'shift-change-log.json');
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);

  const structuredLog = {
    schemaVersion: '2.0.0',
    generation: 1,
    sessionId: 'context-inject-session',
    status: 'READY',
    resumeInstructions: {
      objective: 'Complete the TDD test suite for session handoff',
      nextStep: 'Implement session-budget-watchdog.cjs to make failing tests pass',
      openTasks: [],
      keyFiles: [],
      recentDecisions: [],
      risks: [],
      resumePrompt: 'Start by running the failing test suite.',
    },
    contextSummary: 'TDD RED phase complete',
    fallbackInstruction: 'Run TaskList()',
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(logPath, JSON.stringify(structuredLog, null, 2), 'utf8');

  const res = runHook({ command: 'hello' }, { CLAUDE_SESSION_ID: '' });

  assert.strictEqual(res.allow, true);
  assert.ok(res.message, 'Should inject message');

  // Both objective and nextStep must appear in the injected message
  assert.ok(
    res.message.includes('Complete the TDD test suite'),
    'Injected message must contain the objective'
  );
  assert.ok(
    res.message.includes('Implement session-budget-watchdog'),
    'Injected message must contain the nextStep'
  );

  // Clean up
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
});
