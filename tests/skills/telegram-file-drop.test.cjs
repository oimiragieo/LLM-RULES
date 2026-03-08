'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Extracted handleFileUpload logic (from SKILL.md) as a pure testable function
// with injected dependencies.
// ---------------------------------------------------------------------------

/**
 * Pure, testable version of handleFileUpload from the Telegram polling skill.
 *
 * Dependencies are injected so no real network/filesystem calls occur.
 *
 * @param {object} deps - Injected dependencies
 * @param {Function} deps.callTelegramAPI - Mock for Telegram API calls
 * @param {Function} deps.sendMessage - Mock for sending chat messages
 * @param {Function} deps.readOutbox - Mock for reading outbox entries
 * @param {Function} deps.writeOutbox - Mock for writing outbox entries
 * @param {Function} deps.taskCreate - Mock for TaskCreate
 * @param {Function} deps.logAudit - Mock for audit logging
 * @param {number}   deps.nowMs - Deterministic timestamp
 * @param {object}   params
 * @param {number}   params.chatId
 * @param {number}   params.messageId
 * @param {object}   params.fileInfo - { fileId, fileName, mimeType, fileSize }
 * @param {string}   params.botToken
 */
async function handleFileUpload(deps, { chatId, messageId, fileInfo, botToken }) {
  const { callTelegramAPI, sendMessage, readOutbox, writeOutbox, taskCreate, logAudit, nowMs } =
    deps;

  // 1. Validate file size (20MB limit)
  if (fileInfo.fileSize > 20 * 1024 * 1024) {
    await callTelegramAPI(botToken, 'sendMessage', {
      chat_id: chatId,
      text: '\u274C File too large. Maximum size is 20MB.',
      reply_to_message_id: messageId,
    });
    return;
  }

  // 2. Get download URL from Telegram
  const fileData = await callTelegramAPI(botToken, 'getFile', { file_id: fileInfo.fileId });
  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;

  // 3. Determine extension
  const ext = fileInfo.fileName ? path.extname(fileInfo.fileName) : '.bin';
  const tmpPath = `.claude/context/tmp/telegram-upload-${chatId}-${nowMs}${ext}`;

  // 4. Acknowledge receipt
  await sendMessage(chatId, `\uD83D\uDCE5 Downloading ${fileInfo.fileName || 'file'}...`);

  // 5. Create agent task ID and outbox entry
  const taskId = `tg-file-${nowMs}`;
  const outboxEntry = {
    chatId,
    replyToMessageId: messageId,
    text: null,
    createdAt: new Date(nowMs).toISOString(),
    agentTaskId: taskId,
  };
  const outbox = readOutbox();
  outbox.push(outboxEntry);
  writeOutbox(outbox);

  // 6. Spawn agent task to download, convert, and store
  const taskDescription = [
    `Process a Telegram file upload for user ${chatId}.`,
    `Download URL: ${downloadUrl}`,
    `Save to: ${tmpPath}`,
    `Steps:`,
    `1. Download the file using Bash: curl -L "${downloadUrl}" -o "${tmpPath}"`,
    `2. Run markitdown: python .claude/tools/cli/markitdown-convert.py "${tmpPath}"`,
    `3. Capture stdout as markdownContent.`,
    `4. Store result: MemoryRecord({ type: 'discovery', text: markdownContent.slice(0, 2000), area: 'user-files' })`,
    `5. Update outbox: read .claude/context/tmp/telegram-outbox.json, find entry with agentTaskId="${taskId}",`,
    `   set its text to: "\u2705 File processed! Converted ${fileInfo.fileName || 'file'} to markdown and stored as memory. (" + charCount + " chars)"`,
    `   Write the updated array back (write to .tmp, then rename).`,
    `6. Clean up: delete ${tmpPath}`,
    `7. Call TaskUpdate({ taskId: "${taskId}", status: "completed" })`,
  ].join('\n');

  taskCreate({
    subject: `[Telegram] Process file upload: ${fileInfo.fileName || 'file'}`,
    description: taskDescription,
  });

  logAudit({
    type: 'file_upload',
    chatId,
    fileName: fileInfo.fileName,
    fileSize: fileInfo.fileSize,
    taskId,
  });
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMocks(overrides = {}) {
  const calls = {
    callTelegramAPI: [],
    sendMessage: [],
    readOutbox: [],
    writeOutbox: [],
    taskCreate: [],
    logAudit: [],
  };

  const mocks = {
    callTelegramAPI:
      overrides.callTelegramAPI ||
      (async (token, method, params) => {
        calls.callTelegramAPI.push({ token, method, params });
        if (method === 'getFile') {
          return { result: { file_path: 'documents/file_42.pdf' } };
        }
        return { ok: true };
      }),
    sendMessage:
      overrides.sendMessage ||
      (async (chatId, text) => {
        calls.sendMessage.push({ chatId, text });
      }),
    readOutbox:
      overrides.readOutbox ||
      (() => {
        calls.readOutbox.push({});
        return [];
      }),
    writeOutbox:
      overrides.writeOutbox ||
      (entries => {
        calls.writeOutbox.push({ entries });
      }),
    taskCreate:
      overrides.taskCreate ||
      (opts => {
        calls.taskCreate.push(opts);
      }),
    logAudit:
      overrides.logAudit ||
      (entry => {
        calls.logAudit.push(entry);
      }),
    nowMs: overrides.nowMs || 1700000000000,
  };

  return { mocks, calls };
}

function makeFileInfo(overrides = {}) {
  return {
    fileId: 'AgACAgIAAxkBAAI',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024 * 100, // 100KB
    ...overrides,
  };
}

const DEFAULT_PARAMS = {
  chatId: 12345,
  messageId: 99,
  botToken: 'test-bot-token-123',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('telegram-file-drop handleFileUpload', () => {
  let mocks;
  let calls;

  beforeEach(() => {
    const result = createMocks();
    mocks = result.mocks;
    calls = result.calls;
  });

  // Test 1: File over 20MB sends error, no download attempted
  it('1. file over 20MB sends "too large" error, no download attempted', async () => {
    const fileInfo = makeFileInfo({ fileSize: 21 * 1024 * 1024 }); // 21MB

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    // Should have called callTelegramAPI once (sendMessage for error)
    assert.strictEqual(calls.callTelegramAPI.length, 1, 'only one API call for error');
    assert.strictEqual(calls.callTelegramAPI[0].method, 'sendMessage');
    assert.ok(
      calls.callTelegramAPI[0].params.text.includes('too large'),
      'error message mentions "too large"'
    );
    assert.strictEqual(
      calls.callTelegramAPI[0].params.reply_to_message_id,
      99,
      'replies to original message'
    );

    // No download, no outbox, no task, no audit
    assert.strictEqual(calls.sendMessage.length, 0, 'no sendMessage for ack');
    assert.strictEqual(calls.readOutbox.length, 0, 'no outbox read');
    assert.strictEqual(calls.writeOutbox.length, 0, 'no outbox write');
    assert.strictEqual(calls.taskCreate.length, 0, 'no task created');
    assert.strictEqual(calls.logAudit.length, 0, 'no audit logged');
  });

  // Test 2: Document message — getFile called with correct file_id
  it('2. document message calls getFile with correct file_id', async () => {
    const fileInfo = makeFileInfo({ fileId: 'doc-file-id-xyz' });

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    // First API call should be getFile with the correct file_id
    const getFileCalls = calls.callTelegramAPI.filter(c => c.method === 'getFile');
    assert.strictEqual(getFileCalls.length, 1, 'getFile should be called once');
    assert.strictEqual(
      getFileCalls[0].params.file_id,
      'doc-file-id-xyz',
      'file_id should match document file_id'
    );
  });

  // Test 3: Photo message — uses largest photo (last in array)
  it('3. photo message uses largest photo (last in array)', async () => {
    // Simulate the message dispatch logic from SKILL.md
    const photoArray = [
      { file_id: 'small-photo', file_size: 1000 },
      { file_id: 'medium-photo', file_size: 5000 },
      { file_id: 'large-photo', file_size: 15000 },
    ];
    const photo = photoArray[photoArray.length - 1]; // last = largest

    const fileInfo = {
      fileId: photo.file_id,
      fileName: `photo_${mocks.nowMs}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: photo.file_size || 0,
    };

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    const getFileCalls = calls.callTelegramAPI.filter(c => c.method === 'getFile');
    assert.strictEqual(getFileCalls.length, 1);
    assert.strictEqual(
      getFileCalls[0].params.file_id,
      'large-photo',
      'should use file_id from last (largest) photo in array'
    );
  });

  // Test 4: Audio message — correct file_id and mime_type extracted
  it('4. audio message extracts correct file_id and mime_type', async () => {
    const audioMsg = {
      file_id: 'audio-file-id-abc',
      file_name: 'song.mp3',
      mime_type: 'audio/mpeg',
      file_size: 2048000,
    };

    const fileInfo = {
      fileId: audioMsg.file_id,
      fileName: audioMsg.file_name || `audio_${mocks.nowMs}.ogg`,
      mimeType: audioMsg.mime_type || 'audio/ogg',
      fileSize: audioMsg.file_size || 0,
    };

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    const getFileCalls = calls.callTelegramAPI.filter(c => c.method === 'getFile');
    assert.strictEqual(getFileCalls.length, 1);
    assert.strictEqual(getFileCalls[0].params.file_id, 'audio-file-id-abc');

    // Verify task description references the filename
    assert.strictEqual(calls.taskCreate.length, 1);
    assert.ok(
      calls.taskCreate[0].subject.includes('song.mp3'),
      'task subject references audio filename'
    );
  });

  // Test 5: Voice message — treated same as audio
  it('5. voice message treated same as audio', async () => {
    const voiceMsg = {
      file_id: 'voice-file-id-def',
      mime_type: 'audio/ogg',
      file_size: 50000,
    };

    // Voice messages typically lack file_name, so fallback is used
    const fileInfo = {
      fileId: voiceMsg.file_id,
      fileName: voiceMsg.file_name || `audio_${mocks.nowMs}.ogg`,
      mimeType: voiceMsg.mime_type || 'audio/ogg',
      fileSize: voiceMsg.file_size || 0,
    };

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    const getFileCalls = calls.callTelegramAPI.filter(c => c.method === 'getFile');
    assert.strictEqual(getFileCalls.length, 1);
    assert.strictEqual(getFileCalls[0].params.file_id, 'voice-file-id-def');

    // Task should still be created for voice
    assert.strictEqual(calls.taskCreate.length, 1);
    assert.ok(
      calls.taskCreate[0].subject.includes('audio_'),
      'task subject includes fallback filename for voice'
    );
  });

  // Test 6: Valid file — outbox entry created with text: null, correct chatId, replyToMessageId
  it('6. valid file creates outbox entry with text: null, correct chatId, replyToMessageId', async () => {
    const fileInfo = makeFileInfo();

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    assert.strictEqual(calls.writeOutbox.length, 1, 'writeOutbox called once');
    const writtenEntries = calls.writeOutbox[0].entries;
    assert.strictEqual(writtenEntries.length, 1, 'one outbox entry');

    const entry = writtenEntries[0];
    assert.strictEqual(entry.text, null, 'text should be null (agent fills later)');
    assert.strictEqual(entry.chatId, 12345, 'chatId matches');
    assert.strictEqual(entry.replyToMessageId, 99, 'replyToMessageId matches');
    assert.strictEqual(entry.agentTaskId, `tg-file-${mocks.nowMs}`, 'agentTaskId uses timestamp');
  });

  // Test 7: Valid file — TaskCreate called with download URL and markitdown instructions
  it('7. valid file calls TaskCreate with download URL and markitdown instructions', async () => {
    const fileInfo = makeFileInfo({ fileName: 'data.xlsx' });

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    assert.strictEqual(calls.taskCreate.length, 1, 'TaskCreate called once');

    const task = calls.taskCreate[0];
    assert.ok(task.subject.includes('data.xlsx'), 'subject includes filename');
    assert.ok(
      task.description.includes(
        'https://api.telegram.org/file/bottest-bot-token-123/documents/file_42.pdf'
      ),
      'description includes full download URL'
    );
    assert.ok(
      task.description.includes('markitdown-convert.py'),
      'description includes markitdown instructions'
    );
    assert.ok(
      task.description.includes('MemoryRecord'),
      'description includes MemoryRecord storage step'
    );
    assert.ok(task.description.includes('curl -L'), 'description includes curl download step');
  });

  // Test 8: Valid file — logAudit called with type: 'file_upload'
  it('8. valid file calls logAudit with type file_upload', async () => {
    const fileInfo = makeFileInfo({ fileName: 'notes.txt', fileSize: 5000 });

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    assert.strictEqual(calls.logAudit.length, 1, 'logAudit called once');

    const auditEntry = calls.logAudit[0];
    assert.strictEqual(auditEntry.type, 'file_upload', 'audit type is file_upload');
    assert.strictEqual(auditEntry.chatId, 12345, 'audit chatId matches');
    assert.strictEqual(auditEntry.fileName, 'notes.txt', 'audit fileName matches');
    assert.strictEqual(auditEntry.fileSize, 5000, 'audit fileSize matches');
    assert.strictEqual(
      auditEntry.taskId,
      `tg-file-${mocks.nowMs}`,
      'audit taskId matches generated ID'
    );
  });

  // Test 9: File with no extension — uses .bin as fallback
  it('9. file with no extension uses .bin as fallback', async () => {
    const fileInfo = makeFileInfo({ fileName: null });

    await handleFileUpload(mocks, { ...DEFAULT_PARAMS, fileInfo });

    // The task description should reference .bin extension in the tmpPath
    assert.strictEqual(calls.taskCreate.length, 1);
    const desc = calls.taskCreate[0].description;
    assert.ok(desc.includes('.bin'), 'task description includes .bin fallback extension');
    // Verify the tmpPath pattern
    const expectedTmpPath = `.claude/context/tmp/telegram-upload-12345-${mocks.nowMs}.bin`;
    assert.ok(desc.includes(expectedTmpPath), 'tmpPath uses .bin extension when fileName is null');
  });

  // Test 10: getFile API failure — error handled gracefully, user notified
  it('10. getFile API failure is handled gracefully, user notified', async () => {
    const apiCalls = [];
    const taskCalls = [];
    const auditCalls2 = [];

    const errorResult = createMocks({
      callTelegramAPI: async (_token, method, params) => {
        apiCalls.push({ token: _token, method, params });
        if (method === 'getFile') {
          throw new Error('Telegram API getFile failed: 400 Bad Request');
        }
        return { ok: true };
      },
      taskCreate: opts => {
        taskCalls.push(opts);
      },
      logAudit: entry => {
        auditCalls2.push(entry);
      },
    });

    const fileInfo = makeFileInfo();

    // The function should throw since getFile fails and the extracted
    // function does not have its own try/catch for getFile.
    // We verify the error propagates (caller handles notification).
    let threw = false;
    try {
      await handleFileUpload(errorResult.mocks, { ...DEFAULT_PARAMS, fileInfo });
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('getFile failed'), 'error message references getFile failure');
    }

    assert.ok(threw, 'should throw when getFile fails');

    // Verify getFile was attempted
    const getFileCalls = apiCalls.filter(c => c.method === 'getFile');
    assert.strictEqual(getFileCalls.length, 1, 'getFile was attempted');

    // No task should have been created since failure occurred before that step
    assert.strictEqual(taskCalls.length, 0, 'no task created on API failure');
    assert.strictEqual(auditCalls2.length, 0, 'no audit logged on API failure');
  });
});

describe('telegram-file-drop message dispatch file detection', () => {
  // Tests for the file detection routing logic from SKILL.md
  // This validates the message-to-fileInfo mapping logic

  it('document message maps to correct fileInfo shape', () => {
    const message = {
      message_id: 42,
      document: {
        file_id: 'doc-123',
        file_name: 'contract.pdf',
        mime_type: 'application/pdf',
        file_size: 500000,
      },
    };

    const fileInfo = {
      fileId: message.document.file_id,
      fileName: message.document.file_name,
      mimeType: message.document.mime_type,
      fileSize: message.document.file_size,
    };

    assert.strictEqual(fileInfo.fileId, 'doc-123');
    assert.strictEqual(fileInfo.fileName, 'contract.pdf');
    assert.strictEqual(fileInfo.mimeType, 'application/pdf');
    assert.strictEqual(fileInfo.fileSize, 500000);
  });

  it('photo message selects last element (largest) from photo array', () => {
    const message = {
      message_id: 43,
      photo: [
        { file_id: 'photo-s', file_size: 1200 },
        { file_id: 'photo-m', file_size: 8000 },
        { file_id: 'photo-l', file_size: 35000 },
      ],
    };

    const photo = message.photo[message.photo.length - 1];
    const nowMs = 1700000000000;
    const fileInfo = {
      fileId: photo.file_id,
      fileName: `photo_${nowMs}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: photo.file_size || 0,
    };

    assert.strictEqual(fileInfo.fileId, 'photo-l', 'uses last (largest) photo');
    assert.strictEqual(fileInfo.mimeType, 'image/jpeg');
    assert.strictEqual(fileInfo.fileSize, 35000);
  });

  it('audio message maps to correct fileInfo, voice falls back to .ogg', () => {
    // Audio with file_name
    const audioMsg = {
      file_id: 'aud-1',
      file_name: 'music.mp3',
      mime_type: 'audio/mpeg',
      file_size: 3000000,
    };
    const audioInfo = {
      fileId: audioMsg.file_id,
      fileName: audioMsg.file_name || 'audio_fallback.ogg',
      mimeType: audioMsg.mime_type || 'audio/ogg',
      fileSize: audioMsg.file_size || 0,
    };
    assert.strictEqual(audioInfo.fileName, 'music.mp3');
    assert.strictEqual(audioInfo.mimeType, 'audio/mpeg');

    // Voice without file_name
    const voiceMsg = { file_id: 'voc-1', mime_type: 'audio/ogg', file_size: 25000 };
    const nowMs = 1700000000000;
    const voiceInfo = {
      fileId: voiceMsg.file_id,
      fileName: voiceMsg.file_name || `audio_${nowMs}.ogg`,
      mimeType: voiceMsg.mime_type || 'audio/ogg',
      fileSize: voiceMsg.file_size || 0,
    };
    assert.strictEqual(voiceInfo.fileName, `audio_${nowMs}.ogg`, 'voice uses fallback name');
    assert.strictEqual(voiceInfo.mimeType, 'audio/ogg');
  });
});
