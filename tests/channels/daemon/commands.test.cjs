'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CommandHandler } = require('../../../scripts/channels/daemon/commands.cjs');

// Mock sink that captures sent messages
function createMockSink() {
  const sent = [];
  return {
    sent,
    async send(chatId, text, opts) {
      sent.push({ chatId, text, opts });
      return 123; // fake message_id
    },
  };
}

// Mock memory
function createMockMemory() {
  return {
    chats: new Map(),
    summaries: new Map(),
    profiles: new Map(),
    _saveHistory() {},
    _saveSummaries() {},
    _saveProfiles() {},
    _compactChat() {},
    getProfile(chatId) {
      return this.profiles.get(chatId) || { facts: [] };
    },
    getStats() {
      return { chats: 0, totalMessages: 0, profiles: 0, messagesSinceDream: 0, lastDream: 'never' };
    },
    dream() {
      return 'Dream complete: 2 facts added';
    },
  };
}

// Mock dispatcher
function createMockDispatcher() {
  return {
    getStats() {
      return {
        received: 10,
        processed: 9,
        errors: 1,
        tasksExecuted: 3,
        lastEvent: null,
        queueLength: 0,
        processing: false,
      };
    },
    getHistory(limit) {
      return [
        {
          timestamp: '2026-01-01',
          user: 'omar',
          message: 'hello',
          response: 'hi',
          sink: 'telegram',
        },
      ];
    },
    activeTasks: new Map(),
    stats: { tasksExecuted: 3 },
  };
}

describe('CommandHandler', () => {
  let handler, sink, memory, dispatcher;

  beforeEach(() => {
    sink = createMockSink();
    memory = createMockMemory();
    dispatcher = createMockDispatcher();
    handler = new CommandHandler(sink, memory, dispatcher, () => {});
  });

  describe('Command routing', () => {
    it('/start returns true (handled)', async () => {
      const result = await handler.handle({ text: '/start', chatId: '123', messageId: 1 });
      assert.equal(result, true);
      assert.ok(sink.sent.length > 0);
      assert.ok(sink.sent[0].text.includes('command'));
    });

    it('/help returns true and lists commands', async () => {
      const result = await handler.handle({ text: '/help', chatId: '123', messageId: 1 });
      assert.equal(result, true);
      assert.ok(sink.sent[0].text.includes('/status'));
      assert.ok(sink.sent[0].text.includes('/memory'));
      assert.ok(sink.sent[0].text.includes('/dream'));
    });

    it('/ping returns pong', async () => {
      const result = await handler.handle({ text: '/ping', chatId: '123', messageId: 1 });
      assert.equal(result, true);
      assert.ok(sink.sent[0].text.includes('Pong'));
    });

    it('/model returns model name', async () => {
      const result = await handler.handle({ text: '/model', chatId: '123', messageId: 1 });
      assert.equal(result, true);
      assert.ok(sink.sent[0].text.includes('sonnet'));
    });

    it('unknown /command returns false (pass to Claude)', async () => {
      const result = await handler.handle({ text: '/unknowncmd', chatId: '123', messageId: 1 });
      assert.equal(result, false);
    });

    it('strips @botname from command', async () => {
      const result = await handler.handle({ text: '/ping@MyBot', chatId: '123', messageId: 1 });
      assert.equal(result, true);
      assert.ok(sink.sent[0].text.includes('Pong'));
    });
  });

  describe('/status', () => {
    it('includes all stat fields', async () => {
      await handler.handle({ text: '/status', chatId: '123', messageId: 1 });
      const text = sink.sent[0].text;
      assert.ok(text.includes('Uptime'));
      assert.ok(text.includes('Messages'));
      assert.ok(text.includes('Errors'));
      assert.ok(text.includes('Memory'));
      assert.ok(text.includes('Dream'));
    });
  });

  describe('/memory', () => {
    it('shows empty message when no profile', async () => {
      await handler.handle({ text: '/memory', chatId: '123', messageId: 1 });
      assert.ok(sink.sent[0].text.includes("don't have"));
    });

    it('shows facts when profile exists', async () => {
      memory.profiles.set('123', { facts: ['Name is Omar', 'Likes TypeScript'] });
      await handler.handle({ text: '/memory', chatId: '123', messageId: 1 });
      assert.ok(sink.sent[0].text.includes('Name is Omar'));
      assert.ok(sink.sent[0].text.includes('Likes TypeScript'));
    });
  });

  describe('/forget', () => {
    it('clears all tiers for the chat', async () => {
      memory.chats.set('123', [{ role: 'user', text: 'hello' }]);
      memory.summaries.set('123', 'some summary');
      memory.profiles.set('123', { facts: ['a fact'] });

      await handler.handle({ text: '/forget', chatId: '123', messageId: 1 });

      assert.equal(memory.chats.has('123'), false);
      assert.equal(memory.summaries.has('123'), false);
      assert.equal(memory.profiles.has('123'), false);
    });
  });

  describe('/new', () => {
    it('clears Tier 1+2 but preserves Tier 3', async () => {
      memory.chats.set('123', [{ role: 'user', text: 'hello' }]);
      memory.summaries.set('123', 'some summary');
      memory.profiles.set('123', { facts: ['Name is Omar'] });

      await handler.handle({ text: '/new', chatId: '123', messageId: 1 });

      assert.equal(memory.chats.has('123'), false);
      assert.equal(memory.summaries.has('123'), false);
      assert.equal(memory.profiles.has('123'), true); // preserved!
      assert.equal(memory.profiles.get('123').facts[0], 'Name is Omar');
    });
  });

  describe('/history', () => {
    it('shows recent events', async () => {
      await handler.handle({ text: '/history', chatId: '123', messageId: 1 });
      assert.ok(sink.sent[0].text.includes('omar'));
      assert.ok(sink.sent[0].text.includes('hello'));
    });
  });

  describe('/tasks', () => {
    it('shows empty when no tasks', async () => {
      await handler.handle({ text: '/tasks', chatId: '123', messageId: 1 });
      assert.ok(sink.sent[0].text.includes('No tasks'));
    });

    it('shows task list when tasks exist', async () => {
      dispatcher.activeTasks.set('task-1', {
        status: 'completed',
        description: 'Run tests',
        startTime: Date.now() - 5000,
        endTime: Date.now(),
        chatId: '123',
        user: 'omar',
      });
      await handler.handle({ text: '/tasks', chatId: '123', messageId: 1 });
      assert.ok(sink.sent[0].text.includes('Run tests'));
      assert.ok(sink.sent[0].text.includes('task-1'));
    });
  });

  describe('/dream', () => {
    it('triggers dream and shows result', async () => {
      await handler.handle({ text: '/dream', chatId: '123', messageId: 1 });
      // First message is "Dreaming...", second is result
      assert.ok(sink.sent.length >= 2);
      assert.ok(sink.sent[0].text.includes('Dreaming'));
      assert.ok(sink.sent[1].text.includes('Dream complete'));
    });
  });
});
