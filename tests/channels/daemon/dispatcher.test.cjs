'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Dispatcher } = require('../../../scripts/channels/daemon/dispatcher.cjs');
const { Router } = require('../../../scripts/channels/daemon/router.cjs');

// Mock renderer
function createMockRenderer(response = 'Mock response') {
  return {
    render(event) {
      return response;
    },
    renderProactive(event) {
      return 'Proactive message';
    },
  };
}

// Mock sink
function createMockSink() {
  const sent = [];
  return {
    sent,
    async send(chatId, text, opts) {
      sent.push({ chatId, text, opts });
      return 123;
    },
  };
}

// Mock memory
function createMockMemory() {
  return {
    chats: new Map(),
    shouldDream() {
      return false;
    },
    dream() {
      return null;
    },
  };
}

describe('Dispatcher', () => {
  let dispatcher, router, renderer, sinks, memory;

  beforeEach(() => {
    router = new Router([{ event: 'telegram.*', handler: 'claude', sink: 'telegram' }]);
    renderer = createMockRenderer();
    sinks = { telegram: createMockSink() };
    memory = createMockMemory();
    dispatcher = new Dispatcher(router, renderer, sinks, () => {}, memory, {});
  });

  describe('enqueue()', () => {
    it('increments received counter', () => {
      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'hello', user: 'omar', messageId: 1 },
        timestamp: new Date().toISOString(),
      });
      assert.equal(dispatcher.stats.received, 1);
    });

    it('updates lastEvent timestamp', () => {
      const ts = '2026-04-03T12:00:00Z';
      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'hello', user: 'omar', messageId: 1 },
        timestamp: ts,
      });
      assert.equal(dispatcher.stats.lastEvent, ts);
    });
  });

  describe('Event processing', () => {
    it('processes event and delivers to sink', async () => {
      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'hello', user: 'omar', messageId: 1 },
        timestamp: new Date().toISOString(),
      });

      // Wait for async processing
      await new Promise(r => setTimeout(r, 100));

      assert.equal(dispatcher.stats.processed, 1);
      assert.equal(sinks.telegram.sent.length, 1);
      assert.equal(sinks.telegram.sent[0].chatId, '123');
      assert.equal(sinks.telegram.sent[0].text, 'Mock response');
    });

    it('[TASK] tag triggers executor flow', async () => {
      renderer = createMockRenderer('[TASK] Run the tests');
      dispatcher = new Dispatcher(router, renderer, sinks, () => {}, memory, {});

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'run tests', user: 'omar', messageId: 1 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 200));

      // Should have sent "Running task..." notification + result
      assert.ok(sinks.telegram.sent.length >= 1);
      // First message should be the task notification
      const taskNotification = sinks.telegram.sent.find(m => m.text.includes('Running task'));
      assert.ok(
        taskNotification ||
          sinks.telegram.sent.find(
            m => m.text.includes('Task complete') || m.text.includes('Error')
          )
      );
      assert.equal(dispatcher.stats.tasksExecuted, 1);
    });

    it('echo handler returns echoed text', async () => {
      router = new Router([{ event: 'telegram.*', handler: 'echo', sink: 'telegram' }]);
      dispatcher = new Dispatcher(router, renderer, sinks, () => {}, memory, {});

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'hello', user: 'omar', messageId: 1 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 100));
      assert.ok(sinks.telegram.sent[0].text.includes('Echo: hello'));
    });

    it('ignore handler skips delivery', async () => {
      router = new Router([{ event: 'telegram.*', handler: 'ignore', sink: 'telegram' }]);
      dispatcher = new Dispatcher(router, renderer, sinks, () => {}, memory, {});

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'hello', user: 'omar', messageId: 1 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 100));
      assert.equal(sinks.telegram.sent.length, 0);
    });
  });

  describe('History tracking', () => {
    it('getHistory() returns processed events', async () => {
      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'hello', user: 'omar', messageId: 1 },
        timestamp: '2026-04-03T12:00:00Z',
      });

      await new Promise(r => setTimeout(r, 100));

      const history = dispatcher.getHistory(10);
      assert.equal(history.length, 1);
      assert.equal(history[0].user, 'omar');
      assert.equal(history[0].message, 'hello');
      assert.ok(history[0].response);
    });

    it('getHistory() respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        dispatcher.enqueue({
          type: 'telegram.message',
          source: 'telegram',
          data: { chatId: '123', text: `msg ${i}`, user: 'omar', messageId: i },
          timestamp: new Date().toISOString(),
        });
      }

      await new Promise(r => setTimeout(r, 500));

      const limited = dispatcher.getHistory(2);
      assert.equal(limited.length, 2);
    });
  });

  describe('Clarification loop', () => {
    it('[CLARIFY] response stores pending and sends question', async () => {
      renderer = createMockRenderer('[CLARIFY] Which environment — staging or production?');
      dispatcher = new Dispatcher(router, renderer, sinks, () => {}, memory, {});

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'deploy the app', user: 'omar', messageId: 1 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 100));

      // Should have sent the clarification question
      const clarifyMsg = sinks.telegram.sent.find(m => m.text.includes('Which environment'));
      assert.ok(clarifyMsg, 'Should send clarification question');

      // Should have stored pending clarification
      assert.ok(dispatcher.pendingClarifications.has('123'));
      const pending = dispatcher.pendingClarifications.get('123');
      assert.equal(pending.originalText, 'deploy the app');
    });

    it('next message from same chat resolves clarification', async () => {
      // Set up a pending clarification
      dispatcher.pendingClarifications.set('123', {
        originalText: 'deploy the app',
        question: 'Which environment?',
        timestamp: Date.now(),
      });

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'production', user: 'omar', messageId: 2 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 100));

      // Clarification should be resolved
      assert.equal(dispatcher.pendingClarifications.has('123'), false);
      // Response should have been rendered with context
      assert.equal(dispatcher.stats.processed, 1);
    });

    it('clarification expires after 5 minutes', async () => {
      dispatcher.pendingClarifications.set('123', {
        originalText: 'deploy the app',
        question: 'Which environment?',
        timestamp: Date.now() - 400000, // 6+ minutes ago
      });

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'hello', user: 'omar', messageId: 3 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 100));

      // Expired clarification should be deleted, message processed normally
      assert.equal(dispatcher.pendingClarifications.has('123'), false);
    });
  });

  describe('Stats', () => {
    it('getStats() returns correct shape', () => {
      const stats = dispatcher.getStats();
      assert.equal(typeof stats.received, 'number');
      assert.equal(typeof stats.processed, 'number');
      assert.equal(typeof stats.errors, 'number');
      assert.equal(typeof stats.tasksExecuted, 'number');
      assert.equal(typeof stats.queueLength, 'number');
      assert.equal(typeof stats.processing, 'boolean');
    });
  });
});
