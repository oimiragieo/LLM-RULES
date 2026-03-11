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

  // Step 0 pre-flight header must be present
  assert.ok(res.message.includes('Step 0'), 'Should include Step 0');
  assert.ok(
    res.message.includes('DO NOT call TaskList()'),
    'Should include TaskList block warning'
  );
  assert.ok(
    res.message.includes('reflection-reminder.txt'),
    'Should reference reflection-reminder.txt'
  );
  assert.ok(res.message.includes('Step 0.4'), 'Should include Step 0.4');
  assert.ok(res.message.includes('stale-tasks.json'), 'Should reference stale-tasks.json');
  assert.ok(res.message.includes('Step 0.5'), 'Should include Step 0.5');
  assert.ok(
    res.message.includes('integration-queue.jsonl'),
    'Should reference integration-queue.jsonl'
  );

  // Handover context must still be present
  assert.ok(res.message.includes('Resume the refactor task'), 'Should include resumeInstructions');

  // Clean up
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  if (fs.existsSync(ackPath)) fs.unlinkSync(ackPath);
  fs.unlinkSync(path.join(tmpDir, 'shift-change-log.json'));
});
