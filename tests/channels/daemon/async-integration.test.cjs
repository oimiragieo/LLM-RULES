'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Dispatcher } = require('../../../scripts/channels/daemon/dispatcher.cjs');
const { Router } = require('../../../scripts/channels/daemon/router.cjs');

// Shared test helpers
function createMockSink() {
  const sent = [];
  return {
    sent,
    async send(chatId, text, opts) {
      sent.push({ chatId, text, opts, time: Date.now() });
      return 123;
    },
  };
}

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

function makeEvent(text, chatId = '123', user = 'james') {
  return {
    type: 'telegram.message',
    source: 'telegram',
    data: { chatId, text, user, messageId: Date.now() },
    timestamp: new Date().toISOString(),
  };
}

describe('Async Integration Smoke Tests', () => {
  it('6.1 — full lifecycle: message → [TASK] → background → result', async () => {
    const router = new Router([{ event: 'telegram.*', handler: 'claude', sink: 'telegram' }]);
    const sink = createMockSink();
    const memory = createMockMemory();

    let callCount = 0;
    const renderer = {
      render() {
        callCount++;
        // First call returns a task, subsequent return chat
        return callCount === 1 ? '[TASK] Find the answer' : 'Chat response';
      },
      renderProactive() {
        return 'proactive';
      },
    };

    const dispatcher = new Dispatcher(router, renderer, { telegram: sink }, () => {}, memory, {
      progressIntervalMs: 999999,
    });

    // Mock async executor
    dispatcher.executor.executeTaskAsync = task => ({
      promise: new Promise(resolve =>
        setTimeout(() => resolve(`Answer found: ${task.slice(0, 20)}`), 50)
      ),
      cancel: () => {},
      child: null,
    });

    // Send message that triggers a task
    dispatcher.enqueue(makeEvent('find the answer'));

    // Wait for task to complete
    await dispatcher.taskPool.drain();
    await new Promise(r => setTimeout(r, 50));

    // Verify lifecycle:
    // 1. "Running task" notification
    const notification = sink.sent.find(m => m.text.includes('Running task'));
    assert.ok(notification, 'Should send task notification');

    // 2. Task result delivered
    const result = sink.sent.find(m => m.text.includes('Answer found'));
    assert.ok(result, 'Should deliver task result');

    // 3. Result came after notification
    assert.ok(result.time >= notification.time, 'Result should come after notification');
  });

  it('6.2 — concurrent: 2 tasks + 3 chat messages interleaved', async () => {
    const router = new Router([{ event: 'telegram.*', handler: 'claude', sink: 'telegram' }]);
    const sink = createMockSink();

    let renderCount = 0;
    const renderer = {
      render(event) {
        renderCount++;
        // First 2 messages trigger tasks, rest are chat
        if (renderCount <= 2) return `[TASK] Task ${renderCount}`;
        return `Chat reply to: ${event.data.text}`;
      },
      renderProactive() {
        return 'proactive';
      },
    };

    const dispatcher = new Dispatcher(
      router,
      renderer,
      { telegram: sink },
      () => {},
      createMockMemory(),
      { progressIntervalMs: 999999 }
    );

    dispatcher.executor.executeTaskAsync = task => ({
      promise: new Promise(resolve => setTimeout(() => resolve(`Done: ${task.slice(0, 20)}`), 100)),
      cancel: () => {},
      child: null,
    });

    // Send 2 task messages + 3 chat messages rapidly
    dispatcher.enqueue(makeEvent('task one'));
    dispatcher.enqueue(makeEvent('task two'));

    // Wait a tick for task dispatch
    await new Promise(r => setTimeout(r, 30));

    dispatcher.enqueue(makeEvent('hello'));
    dispatcher.enqueue(makeEvent('how are you'));
    dispatcher.enqueue(makeEvent('whats up'));

    // Chat messages should be answered within 500ms (not waiting for tasks)
    await new Promise(r => setTimeout(r, 300));

    const chatReplies = sink.sent.filter(m => m.text.startsWith('Chat reply'));
    assert.ok(chatReplies.length >= 3, `Expected 3 chat replies, got ${chatReplies.length}`);

    // Tasks should also complete
    await dispatcher.taskPool.drain();
    await new Promise(r => setTimeout(r, 50));

    const taskResults = sink.sent.filter(m => m.text.startsWith('Done:'));
    assert.ok(taskResults.length >= 2, `Expected 2 task results, got ${taskResults.length}`);
  });

  it('6.3 — task timeout delivers timeout error', async () => {
    const router = new Router([{ event: 'telegram.*', handler: 'claude', sink: 'telegram' }]);
    const sink = createMockSink();

    const renderer = {
      render() {
        return '[TASK] Slow task';
      },
      renderProactive() {
        return 'proactive';
      },
    };

    const dispatcher = new Dispatcher(
      router,
      renderer,
      { telegram: sink },
      () => {},
      createMockMemory(),
      { progressIntervalMs: 999999 }
    );

    // Task that never completes
    dispatcher.executor.executeTaskAsync = () => ({
      promise: new Promise(() => {}), // never resolves
      cancel: () => {},
      child: null,
    });

    // Override timeout on the pool spawn to be very short
    const origSpawn = dispatcher.taskPool.spawn.bind(dispatcher.taskPool);
    dispatcher.taskPool.spawn = (id, fn, meta) => {
      meta.timeout = 100; // 100ms timeout for test
      return origSpawn(id, fn, meta);
    };

    dispatcher.enqueue(makeEvent('slow thing'));

    await new Promise(r => setTimeout(r, 300));

    const timeoutMsg = sink.sent.find(
      m => m.text.includes('timed out') || m.text.includes('Timeout')
    );
    assert.ok(timeoutMsg, 'Should deliver timeout error to chat');
  });

  it('6.4 — shutdown during active tasks drains then stops', async () => {
    const router = new Router([{ event: 'telegram.*', handler: 'claude', sink: 'telegram' }]);
    const sink = createMockSink();

    const renderer = {
      render() {
        return '[TASK] Work';
      },
      renderProactive() {
        return 'proactive';
      },
    };

    const dispatcher = new Dispatcher(
      router,
      renderer,
      { telegram: sink },
      () => {},
      createMockMemory(),
      { progressIntervalMs: 999999 }
    );

    dispatcher.executor.executeTaskAsync = () => ({
      promise: new Promise(resolve => setTimeout(() => resolve('done'), 50)),
      cancel: () => {},
      child: null,
    });

    dispatcher.enqueue(makeEvent('work 1'));
    dispatcher.enqueue(makeEvent('work 2'));

    await new Promise(r => setTimeout(r, 20));

    // Simulate shutdown — drain the pool
    const drainStart = Date.now();
    await dispatcher.taskPool.drain();
    const drainTime = Date.now() - drainStart;

    // All tasks should have completed
    const allTasks = dispatcher.taskPool.getAll();
    const completed = allTasks.filter(t => t.status === 'completed');
    assert.ok(completed.length >= 2, `Expected 2 completed tasks, got ${completed.length}`);
    assert.ok(drainTime < 5000, `Drain should complete quickly, took ${drainTime}ms`);
  });
});
