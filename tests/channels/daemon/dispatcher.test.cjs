'use strict';

/* eslint-disable max-lines -- comprehensive dispatcher test suite */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Dispatcher } = require('../../../scripts/channels/daemon/dispatcher.cjs');
const { Router } = require('../../../scripts/channels/daemon/router.cjs');

// Mock renderer
function createMockRenderer(response = 'Mock response') {
  return {
    render(_event) {
      return response;
    },
    renderProactive(_event) {
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
    addMessage() {},
    _saveHistory() {},
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
      dispatcher.executor.executeTaskAsync = () => ({
        promise: Promise.resolve('Result: task complete'),
        cancel: () => {},
        child: null,
      });
      dispatcher.missionExecutor.executeAsync = () => ({
        promise: Promise.resolve({
          grade: { passed: true, grade: 'good', score: 100 },
          handoff: { summary: 'Result: task complete' },
          structured: true,
        }),
        cancel: () => {},
      });
      dispatcher.missionExecutor.formatResult = result =>
        result.handoff?.summary || 'Result: task complete';

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'run tests', user: 'omar', messageId: 1 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 200));

      // Should have sent task notification + result
      assert.ok(sinks.telegram.sent.length >= 1);
      // First message should be the task notification (plain or mission-aware)
      const taskNotification = sinks.telegram.sent.find(
        m =>
          m.text.includes('Running task') ||
          m.text.includes('Mission task') ||
          m.text.includes('Task complete') ||
          m.text.includes('Error')
      );
      assert.ok(taskNotification, 'Should have task notification or result');
      assert.equal(dispatcher.stats.tasksExecuted, 1);
      await dispatcher.taskPool.drain();
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

  describe('Interview (multi-round)', () => {
    it('[INTERVIEW] starts multi-round questioning', async () => {
      renderer = createMockRenderer(
        '[INTERVIEW]\n1. What modules?\n2. What pattern?\n3. Test coverage?'
      );
      dispatcher = new Dispatcher(router, renderer, sinks, () => {}, memory, {});

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'refactor everything', user: 'omar', messageId: 1 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 100));

      assert.ok(dispatcher.pendingInterviews.has('123'));
      const interview = dispatcher.pendingInterviews.get('123');
      assert.equal(interview.questions.length, 3);
      assert.equal(interview.currentRound, 0);
      assert.ok(sinks.telegram.sent.find(m => m.text.includes('What modules')));
    });

    it('interview collects answers and proceeds', async () => {
      // Set up pending interview mid-way
      dispatcher.pendingInterviews.set('123', {
        originalText: 'refactor',
        questions: ['Q1?', 'Q2?'],
        answers: ['answer1'],
        currentRound: 1,
        timestamp: Date.now(),
      });

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'answer2', user: 'omar', messageId: 2 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 100));

      // Interview should be complete and deleted
      assert.equal(dispatcher.pendingInterviews.has('123'), false);
    });

    it('"just do it" skips remaining questions', async () => {
      dispatcher.pendingInterviews.set('123', {
        originalText: 'refactor',
        questions: ['Q1?', 'Q2?', 'Q3?'],
        answers: ['answer1'],
        currentRound: 1,
        timestamp: Date.now(),
      });

      dispatcher.enqueue({
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId: '123', text: 'just do it', user: 'omar', messageId: 3 },
        timestamp: new Date().toISOString(),
      });

      await new Promise(r => setTimeout(r, 100));
      assert.equal(dispatcher.pendingInterviews.has('123'), false);
    });
  });

  describe('Rate Limiting', () => {
    it('allows messages under limit', () => {
      assert.equal(dispatcher._checkRateLimit('123'), true);
      assert.equal(dispatcher._checkRateLimit('123'), true);
    });

    it('blocks messages over limit', () => {
      dispatcher.rateLimitMax = 3;
      for (let i = 0; i < 3; i++) dispatcher._checkRateLimit('456');
      assert.equal(dispatcher._checkRateLimit('456'), false); // 4th blocked
    });

    it('different users have independent limits', () => {
      dispatcher.rateLimitMax = 2;
      dispatcher._checkRateLimit('a');
      dispatcher._checkRateLimit('a');
      assert.equal(dispatcher._checkRateLimit('a'), false); // a blocked
      assert.equal(dispatcher._checkRateLimit('b'), true); // b not blocked
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

  // Phase 4: Non-blocking async task dispatch
  describe('Async Task Pool Integration', () => {
    /**
     * Helper to create a dispatcher with a mock executor that supports async.
     * The renderer returns [TASK] so we can test the async flow.
     */
    function createAsyncDispatcher(taskResponse, taskDelay = 20) {
      const r = new (require('../../../scripts/channels/daemon/router.cjs').Router)([
        { event: 'telegram.*', handler: 'claude', sink: 'telegram' },
      ]);
      const taskRenderer = createMockRenderer(taskResponse);
      const s = { telegram: createMockSink() };
      const m = createMockMemory();
      // Disable progress heartbeat timers in tests by using very large interval
      const d = new Dispatcher(r, taskRenderer, s, () => {}, m, { progressIntervalMs: 999999 });

      // Mock the executor's async methods
      d.executor.executeTaskAsync = task => ({
        promise: new Promise(resolve =>
          setTimeout(() => resolve(`Result: ${task.slice(0, 30)}`), taskDelay)
        ),
        cancel: () => {},
        child: null,
      });
      d.executor.executeRalphLoopAsync = (task, opts) => {
        const onProgress = opts?.onProgress || (() => {});
        return {
          promise: new Promise(resolve => {
            setTimeout(() => {
              onProgress('\u{1f504} Ralph iteration 1/3...');
              setTimeout(() => {
                onProgress('\u{1f504} Ralph iteration 2/3...');
                resolve('\u{2705} Completed in 2 iteration(s)\n\nFixed!');
              }, taskDelay);
            }, taskDelay);
          }),
          cancel: () => {},
        };
      };
      d.executor.executeParallelAsync = task => {
        return Promise.resolve(
          `\u{26a1} Ultrawork: 2/2 subtasks completed\n\n${task.slice(0, 50)}`
        );
      };

      // Keep async task tests hermetic even when the skill router classifies
      // a [TASK] prompt as coding and routes it through the mission executor.
      d.missionExecutor.executeAsync = task => ({
        promise: new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                grade: { passed: true, grade: 'good', score: 100 },
                handoff: { summary: `Result: ${task.slice(0, 30)}` },
                structured: true,
              }),
            taskDelay
          )
        ),
        cancel: () => {},
      });
      d.missionExecutor.formatResult = result => result.handoff?.summary || 'Mission complete';

      return { dispatcher: d, sinks: s, memory: m };
    }

    function makeEvent(text, chatId = '123', user = 'omar') {
      return {
        type: 'telegram.message',
        source: 'telegram',
        data: { chatId, text, user, messageId: Date.now() },
        timestamp: new Date().toISOString(),
      };
    }

    it('4.1 — [TASK] does NOT block the queue', async () => {
      // Create a dispatcher where tasks take 200ms
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[TASK] slow task', 200);

      // Send a task event
      d.enqueue(makeEvent('do task'));

      // Wait just enough for the renderer to run and the task to be spawned
      await new Promise(r => setTimeout(r, 50));

      // Now send a regular chat event — with a different renderer response
      d.renderer = createMockRenderer('Quick reply!');
      d.enqueue(makeEvent('hello'));

      // Wait for the chat response
      await new Promise(r => setTimeout(r, 100));

      // The chat message should have been processed already (not blocked by the task)
      const chatReply = s.telegram.sent.find(m => m.text === 'Quick reply!');
      assert.ok(chatReply, 'Chat message should be processed while task runs');

      // Wait for the task to complete
      await d.taskPool.drain();
    });

    it('4.2 — [TASK] sends "task started" notification immediately', async () => {
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[TASK] Run tests', 200);
      d.enqueue(makeEvent('run tests'));

      await new Promise(r => setTimeout(r, 50));

      const notification = s.telegram.sent.find(
        m =>
          m.text.includes('Running task') ||
          m.text.includes('Mission task') ||
          m.text.includes('\u{2699}\u{fe0f}') ||
          m.text.includes('\u{1f527}')
      );
      assert.ok(notification, 'Should send task started notification');
      await d.taskPool.drain();
    });

    it('4.3 — [TASK] delivers result when task completes', async () => {
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[TASK] Get info', 30);
      d.enqueue(makeEvent('get info'));

      await d.taskPool.drain();
      await new Promise(r => setTimeout(r, 50));

      const resultMsg = s.telegram.sent.find(m => m.text.includes('Result:'));
      assert.ok(resultMsg, 'Should deliver task result to chat');
    });

    it('4.4 — [TASK] delivers error when task fails', async () => {
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[TASK] Bad task', 10);
      d.executor.executeTaskAsync = () => ({
        promise: Promise.reject(new Error('something exploded')),
        cancel: () => {},
        child: null,
      });
      d.enqueue(makeEvent('bad task'));

      await new Promise(r => setTimeout(r, 100));

      const errMsg = s.telegram.sent.find(
        m => m.text.includes('failed') || m.text.includes('exploded') || m.text.includes('Error')
      );
      assert.ok(errMsg, 'Should deliver error to chat');
    });

    it('4.5 — multiple [TASK]s can run concurrently', async () => {
      const { dispatcher: d } = createAsyncDispatcher('[TASK] Task A', 100);

      d.enqueue(makeEvent('task 1', '100'));
      d.enqueue(makeEvent('task 2', '200'));
      d.enqueue(makeEvent('task 3', '300'));

      await new Promise(r => setTimeout(r, 50));

      const running = d.taskPool.getRunning();
      assert.ok(running.length >= 2, `Expected >= 2 running tasks, got ${running.length}`);

      await d.taskPool.drain();
    });

    it('4.6 — chat messages processed while tasks run', async () => {
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[TASK] Slow', 500);

      // Start a slow task
      d.enqueue(makeEvent('start task'));
      await new Promise(r => setTimeout(r, 30));

      // Now switch renderer to return normal responses
      d.renderer = createMockRenderer('Chat response');

      // Send 3 chat messages
      d.enqueue(makeEvent('msg1'));
      d.enqueue(makeEvent('msg2'));
      d.enqueue(makeEvent('msg3'));

      await new Promise(r => setTimeout(r, 200));

      // All 3 should have gotten responses
      const chatReplies = s.telegram.sent.filter(m => m.text === 'Chat response');
      assert.ok(chatReplies.length >= 3, `Expected 3 chat replies, got ${chatReplies.length}`);

      await d.taskPool.drain();
    });

    it('4.7 — [RALPH] spawns async and continues queue', async () => {
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[RALPH] Fix bugs', 50);

      d.enqueue(makeEvent('fix bugs'));
      await new Promise(r => setTimeout(r, 30));

      // Switch to normal response
      d.renderer = createMockRenderer('Quick reply');
      d.enqueue(makeEvent('hello'));
      await new Promise(r => setTimeout(r, 100));

      const chatReply = s.telegram.sent.find(m => m.text === 'Quick reply');
      assert.ok(chatReply, 'Chat should not be blocked by RALPH');

      await d.taskPool.drain();
    });

    it('4.8 — [RALPH] delivers progress updates', async () => {
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[RALPH] Fix tests', 20);
      d.enqueue(makeEvent('fix tests'));

      await d.taskPool.drain();
      await new Promise(r => setTimeout(r, 50));

      const progressMsgs = s.telegram.sent.filter(
        m => m.text.includes('Ralph') || m.text.includes('iteration')
      );
      assert.ok(progressMsgs.length >= 1, 'Should send progress updates');
    });

    it('4.9 — [ULTRAWORK] spawns async', async () => {
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[ULTRAWORK] Fix all', 10);

      d.enqueue(makeEvent('fix all'));
      await new Promise(r => setTimeout(r, 30));

      // Switch to normal response
      d.renderer = createMockRenderer('Quick reply');
      d.enqueue(makeEvent('hello'));
      await new Promise(r => setTimeout(r, 100));

      const chatReply = s.telegram.sent.find(m => m.text === 'Quick reply');
      assert.ok(chatReply, 'Chat should not be blocked by ULTRAWORK');

      await d.taskPool.drain();
    });

    it('4.10 — task result updates memory', async () => {
      const { dispatcher: d, memory: m } = createAsyncDispatcher('[TASK] Do thing', 10);
      let memoryUpdated = false;
      m.addMessage = (_chatId, role) => {
        if (role === 'assistant') memoryUpdated = true;
      };

      d.enqueue(makeEvent('do thing'));
      await d.taskPool.drain();
      await new Promise(r => setTimeout(r, 50));

      assert.ok(memoryUpdated, 'Memory should be updated with task result');
    });

    it('4.11 — task result triggers skill extraction', async () => {
      const { dispatcher: d } = createAsyncDispatcher('[TASK] Research', 10);
      let skillExtracted = false;
      d.skillStore = {
        extractSkill: () => {
          skillExtracted = true;
          return 'test-skill';
        },
      };

      d.enqueue(makeEvent('research'));
      await d.taskPool.drain();
      await new Promise(r => setTimeout(r, 100));

      assert.ok(skillExtracted, 'Skill extraction should be called');
    });

    it('4.13 — getStats includes running task count', async () => {
      const { dispatcher: d } = createAsyncDispatcher('[TASK] Slow task', 200);
      d.enqueue(makeEvent('slow'));
      await new Promise(r => setTimeout(r, 50));

      const stats = d.getStats();
      assert.equal(typeof stats.runningTasks, 'number');
      assert.ok(stats.runningTasks >= 1, `Expected >= 1 running, got ${stats.runningTasks}`);

      await d.taskPool.drain();
    });

    it('4.16 — task result chunked for long output', async () => {
      const { dispatcher: d, sinks: s } = createAsyncDispatcher('[TASK] Big task', 10);
      // Return a very long result
      d.executor.executeTaskAsync = () => ({
        promise: Promise.resolve('A'.repeat(5000)),
        cancel: () => {},
        child: null,
      });

      d.enqueue(makeEvent('big'));
      await d.taskPool.drain();
      await new Promise(r => setTimeout(r, 50));

      // Should have been chunked
      const resultMsgs = s.telegram.sent.filter(m => m.text.includes('AAA'));
      assert.ok(resultMsgs.length >= 2, `Expected >= 2 chunks, got ${resultMsgs.length}`);
    });

    it('4.17 — activeTasks map updated by pool events', async () => {
      const { dispatcher: d } = createAsyncDispatcher('[TASK] Track me', 30);
      d.enqueue(makeEvent('track'));
      await new Promise(r => setTimeout(r, 10));

      assert.ok(d.activeTasks.size >= 1, 'activeTasks should have the task');

      await d.taskPool.drain();
      await new Promise(r => setTimeout(r, 30));

      const entry = [...d.activeTasks.values()][0];
      assert.equal(entry.status, 'completed');
    });
  });
});
