'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Extracted outbox logic (from SKILL.md) as testable pure functions
// ---------------------------------------------------------------------------

const OUTBOX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function readOutbox(outboxFile) {
  try {
    const raw = fs.readFileSync(outboxFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeOutbox(outboxFile, entries) {
  const tmp = outboxFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, outboxFile);
}

async function processOutbox(outboxFile, sendFn, auditFn, nowMs) {
  const entries = readOutbox(outboxFile);
  if (entries.length === 0) return;

  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const remaining = [];

  for (const entry of entries) {
    const age = now - new Date(entry.createdAt).getTime();

    if (entry.text) {
      // Has content — send it
      const payload = {
        chat_id: entry.chatId,
        text: entry.text.slice(0, 4096),
        parse_mode: 'HTML',
      };
      if (entry.replyToMessageId) {
        payload.reply_to_message_id = entry.replyToMessageId;
      }
      await sendFn('sendMessage', payload);
      auditFn({
        type: 'outbox_delivered',
        chatId: entry.chatId,
        agentTaskId: entry.agentTaskId,
      });
    } else if (age > OUTBOX_TIMEOUT_MS) {
      // Timed out — notify user
      await sendFn('sendMessage', {
        chat_id: entry.chatId,
        text: '\u23F1 Agent task timed out after 5 minutes. Please try again.',
        reply_to_message_id: entry.replyToMessageId,
      });
      auditFn({
        type: 'outbox_timeout',
        chatId: entry.chatId,
        agentTaskId: entry.agentTaskId,
      });
    } else {
      // Still pending — keep it
      remaining.push(entry);
    }
  }

  writeOutbox(outboxFile, remaining);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tg-outbox-test-'));
}

function makeEntry(overrides = {}) {
  return {
    messageId: 100,
    chatId: 12345,
    replyToMessageId: 100,
    createdAt: new Date().toISOString(),
    agentTaskId: 'tg-ask-1234',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('telegram-outbox processOutbox', () => {
  let tmpDir;
  let outboxFile;
  let sendCalls;
  let auditCalls;
  let mockSend;
  let mockAudit;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    outboxFile = path.join(tmpDir, 'telegram-outbox.json');
    sendCalls = [];
    auditCalls = [];
    mockSend = async (method, payload) => {
      sendCalls.push({ method, payload });
    };
    mockAudit = entry => {
      auditCalls.push(entry);
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('1. empty outbox — no messages sent, file unchanged', async () => {
    fs.writeFileSync(outboxFile, '[]');
    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    assert.strictEqual(sendCalls.length, 0, 'no messages should be sent');
    assert.strictEqual(auditCalls.length, 0, 'no audit entries');
    const after = readOutbox(outboxFile);
    assert.deepStrictEqual(after, [], 'outbox should remain empty');
  });

  it('2. entry with text — sendMessage called with correct chatId and text', async () => {
    const entry = makeEntry({ text: 'Hello from agent' });
    fs.writeFileSync(outboxFile, JSON.stringify([entry]));

    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    assert.strictEqual(sendCalls.length, 1);
    assert.strictEqual(sendCalls[0].method, 'sendMessage');
    assert.strictEqual(sendCalls[0].payload.chat_id, 12345);
    assert.strictEqual(sendCalls[0].payload.text, 'Hello from agent');
    assert.strictEqual(sendCalls[0].payload.parse_mode, 'HTML');
  });

  it('3. entry with text — reply_to_message_id included in payload', async () => {
    const entry = makeEntry({ text: 'Reply text', replyToMessageId: 999 });
    fs.writeFileSync(outboxFile, JSON.stringify([entry]));

    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    assert.strictEqual(sendCalls.length, 1);
    assert.strictEqual(
      sendCalls[0].payload.reply_to_message_id,
      999,
      'should include reply_to_message_id'
    );
  });

  it('4. entry with text — entry removed from outbox after sending', async () => {
    const entry = makeEntry({ text: 'Will be removed' });
    fs.writeFileSync(outboxFile, JSON.stringify([entry]));

    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    const after = readOutbox(outboxFile);
    assert.strictEqual(after.length, 0, 'sent entry should be removed');
  });

  it('5. old entry without text (>5min) — timeout message sent, entry removed', async () => {
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const entry = makeEntry({ createdAt: sixMinAgo });
    // no text field
    delete entry.text;
    fs.writeFileSync(outboxFile, JSON.stringify([entry]));

    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    assert.strictEqual(sendCalls.length, 1, 'timeout message should be sent');
    assert.ok(sendCalls[0].payload.text.includes('timed out'), 'message should mention timeout');
    assert.strictEqual(auditCalls.length, 1);
    assert.strictEqual(auditCalls[0].type, 'outbox_timeout');

    const after = readOutbox(outboxFile);
    assert.strictEqual(after.length, 0, 'timed-out entry should be removed');
  });

  it('6. young entry without text (<5min) — kept in outbox, no message sent', async () => {
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const entry = makeEntry({ createdAt: twoMinAgo });
    delete entry.text;
    fs.writeFileSync(outboxFile, JSON.stringify([entry]));

    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    assert.strictEqual(sendCalls.length, 0, 'no message should be sent');
    assert.strictEqual(auditCalls.length, 0, 'no audit entry');

    const after = readOutbox(outboxFile);
    assert.strictEqual(after.length, 1, 'pending entry should remain');
    assert.strictEqual(after[0].agentTaskId, entry.agentTaskId);
  });

  it('7. multiple entries: mix of ready + pending + timed-out', async () => {
    const now = Date.now();
    const readyEntry = makeEntry({
      text: 'Ready answer',
      agentTaskId: 'ready-1',
    });
    const pendingEntry = makeEntry({
      createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
      agentTaskId: 'pending-1',
    });
    delete pendingEntry.text;
    const timedOutEntry = makeEntry({
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
      agentTaskId: 'timeout-1',
    });
    delete timedOutEntry.text;

    fs.writeFileSync(outboxFile, JSON.stringify([readyEntry, pendingEntry, timedOutEntry]));

    await processOutbox(outboxFile, mockSend, mockAudit, now);

    // 2 sends: 1 for ready, 1 for timeout
    assert.strictEqual(sendCalls.length, 2, 'should send 2 messages');
    assert.strictEqual(sendCalls[0].payload.text, 'Ready answer', 'first send is the ready entry');
    assert.ok(
      sendCalls[1].payload.text.includes('timed out'),
      'second send is timeout notification'
    );

    // 2 audit entries
    assert.strictEqual(auditCalls.length, 2);
    assert.strictEqual(auditCalls[0].type, 'outbox_delivered');
    assert.strictEqual(auditCalls[1].type, 'outbox_timeout');

    // Only pending entry remains
    const after = readOutbox(outboxFile);
    assert.strictEqual(after.length, 1, 'only pending entry should remain');
    assert.strictEqual(after[0].agentTaskId, 'pending-1');
  });

  it('8. outbox file missing — handled gracefully (no crash)', async () => {
    // outboxFile does not exist — should not throw
    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    assert.strictEqual(sendCalls.length, 0, 'no messages sent');
    assert.strictEqual(auditCalls.length, 0, 'no audit entries');
  });

  it('9. outbox with invalid JSON — handled gracefully (treated as empty)', async () => {
    fs.writeFileSync(outboxFile, '{not valid json!!!');

    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    assert.strictEqual(sendCalls.length, 0, 'no messages sent');
    assert.strictEqual(auditCalls.length, 0, 'no audit entries');
  });

  it('10. text longer than 4096 chars — sliced to 4096 before send', async () => {
    const longText = 'A'.repeat(5000);
    const entry = makeEntry({ text: longText });
    fs.writeFileSync(outboxFile, JSON.stringify([entry]));

    await processOutbox(outboxFile, mockSend, mockAudit, Date.now());

    assert.strictEqual(sendCalls.length, 1);
    assert.strictEqual(sendCalls[0].payload.text.length, 4096, 'text should be truncated to 4096');
    assert.strictEqual(
      sendCalls[0].payload.text,
      'A'.repeat(4096),
      'truncated text should be the first 4096 chars'
    );
  });
});

describe('telegram-outbox readOutbox / writeOutbox', () => {
  let tmpDir;
  let outboxFile;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    outboxFile = path.join(tmpDir, 'telegram-outbox.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('readOutbox returns empty array when file does not exist', () => {
    const result = readOutbox(outboxFile);
    assert.deepStrictEqual(result, []);
  });

  it('readOutbox returns empty array for non-array JSON', () => {
    fs.writeFileSync(outboxFile, JSON.stringify({ not: 'an array' }));
    const result = readOutbox(outboxFile);
    assert.deepStrictEqual(result, []);
  });

  it('writeOutbox writes valid JSON atomically', () => {
    const entries = [makeEntry({ text: 'hello' })];
    writeOutbox(outboxFile, entries);

    const raw = fs.readFileSync(outboxFile, 'utf8');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].text, 'hello');

    // tmp file should not remain
    assert.ok(!fs.existsSync(outboxFile + '.tmp'), 'temp file should be cleaned up by rename');
  });
});
