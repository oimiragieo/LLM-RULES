'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// We can't call the real Telegram API in tests, so we test the method signatures
// and ensure they don't throw. The actual API calls are integration-tested manually.

describe('TelegramSink', () => {
  // Mock the telegramApi function
  const originalModule = require('../../../../scripts/channels/daemon/sources/telegram.cjs');
  const apiCalls = [];
  const originalApi = originalModule.telegramApi;

  // Patch telegramApi for testing
  before(() => {
    originalModule.telegramApi = async (token, method, body) => {
      apiCalls.push({ token, method, body });
      return { ok: true, result: { message_id: 999 } };
    };
  });

  after(() => {
    originalModule.telegramApi = originalApi;
  });

  it('send() calls sendMessage with correct params', async () => {
    const { TelegramSink } = require('../../../../scripts/channels/daemon/sinks/telegram.cjs');
    const sink = new TelegramSink('test-token');
    apiCalls.length = 0;

    const msgId = await sink.send('123', 'hello', { replyTo: 456 });
    assert.equal(msgId, 999);
    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].method, 'sendMessage');
    assert.equal(apiCalls[0].body.chat_id, '123');
    assert.equal(apiCalls[0].body.text, 'hello');
    assert.equal(apiCalls[0].body.reply_parameters.message_id, 456);
  });

  it('sendTyping() calls sendChatAction with typing', async () => {
    const { TelegramSink } = require('../../../../scripts/channels/daemon/sinks/telegram.cjs');
    const sink = new TelegramSink('test-token');
    apiCalls.length = 0;

    await sink.sendTyping('123');
    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].method, 'sendChatAction');
    assert.equal(apiCalls[0].body.chat_id, '123');
    assert.equal(apiCalls[0].body.action, 'typing');
  });

  it('createStreamSession() returns a StreamSession', () => {
    const { TelegramSink } = require('../../../../scripts/channels/daemon/sinks/telegram.cjs');
    const sink = new TelegramSink('test-token');
    const session = sink.createStreamSession('123', { replyTo: 456 });
    assert.ok(session);
    assert.equal(session.chatId, '123');
    assert.equal(session.replyTo, 456);
    assert.equal(session.finalized, false);
    assert.ok(session.draftId);
  });

  it('StreamSession.update() calls API (fallback mode)', async () => {
    const { TelegramSink } = require('../../../../scripts/channels/daemon/sinks/telegram.cjs');
    const sink = new TelegramSink('test-token');
    sink._draftSupported = false; // Force fallback
    apiCalls.length = 0;

    const session = sink.createStreamSession('123');
    session.minInterval = 0;
    await session.update('Hello');
    assert.ok(apiCalls.length >= 1);
    assert.equal(apiCalls[0].method, 'sendMessage');
    assert.ok(apiCalls[0].body.text.includes('Hello'));
  });

  it('StreamSession.finalize() sends final text', async () => {
    const { TelegramSink } = require('../../../../scripts/channels/daemon/sinks/telegram.cjs');
    const sink = new TelegramSink('test-token');
    sink._draftSupported = false;
    apiCalls.length = 0;

    const session = sink.createStreamSession('123');
    session.messageId = 999;
    await session.finalize('Final response');

    const editCall = apiCalls.find(c => c.method === 'editMessageText');
    assert.ok(editCall);
    assert.equal(editCall.body.text, 'Final response');
    assert.equal(session.finalized, true);
  });

  it('StreamSession.finalize() is idempotent', async () => {
    const { TelegramSink } = require('../../../../scripts/channels/daemon/sinks/telegram.cjs');
    const sink = new TelegramSink('test-token');
    sink._draftSupported = false;
    apiCalls.length = 0;

    const session = sink.createStreamSession('123');
    session.messageId = 999;
    await session.finalize('First');
    const count = apiCalls.length;
    await session.finalize('Second');
    assert.equal(apiCalls.length, count);
  });

  it('sendTyping() does not throw on API error', async () => {
    const { TelegramSink } = require('../../../../scripts/channels/daemon/sinks/telegram.cjs');
    // Temporarily make API fail
    originalModule.telegramApi = async () => {
      throw new Error('network error');
    };
    const sink = new TelegramSink('test-token');

    // Should not throw
    await sink.sendTyping('123');

    // Restore
    originalModule.telegramApi = async (token, method, body) => {
      apiCalls.push({ token, method, body });
      return { ok: true, result: { message_id: 999 } };
    };
  });
});
