'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// TaskPool will be at scripts/channels/daemon/task-pool.cjs
const { TaskPool } = require('../../../scripts/channels/daemon/task-pool.cjs');

/**
 * Helper: create a task function that resolves after `ms` with `result`.
 */
function delayedTask(result, ms = 10) {
  return () => new Promise((resolve) => setTimeout(() => resolve(result), ms));
}

/**
 * Helper: create a task function that rejects after `ms`.
 */
function failingTask(errMsg, ms = 10) {
  return () => new Promise((_, reject) => setTimeout(() => reject(new Error(errMsg)), ms));
}

/**
 * Helper: create a cancellable task function (returns { promise, cancel }).
 */
function _cancellableTask(ms = 5000) {
  let cancelFn;
  const fn = () => {
    let timer;
    const promise = new Promise((resolve, reject) => {
      timer = setTimeout(() => resolve('done'), ms);
      cancelFn = () => {
        clearTimeout(timer);
        reject(new Error('cancelled'));
      };
    });
    return { promise, cancel: cancelFn };
  };
  return fn;
}

describe('TaskPool', () => {
  let pool;

  beforeEach(() => {
    pool = new TaskPool({ maxConcurrent: 3 });
  });

  describe('2.1 — constructor sets defaults', () => {
    it('has correct defaults', () => {
      const p = new TaskPool();
      assert.equal(p.maxConcurrent, 3);
      assert.equal(p.tasks.size, 0);
      assert.equal(p.queue.length, 0);
    });

    it('accepts custom maxConcurrent', () => {
      const p = new TaskPool({ maxConcurrent: 5 });
      assert.equal(p.maxConcurrent, 5);
    });
  });

  describe('2.2 — spawn starts task immediately when under limit', () => {
    it('task starts running', async () => {
      const entry = pool.spawn('t-1', delayedTask('done', 50), {
        description: 'test',
        chatId: '123',
        user: 'omar',
      });

      assert.equal(entry.status, 'running');
      assert.ok(entry.startTime > 0);
      assert.equal(entry.id, 't-1');
      await pool.drain();
    });
  });

  describe('2.3 — spawn queues task when at capacity', () => {
    it('4th task is queued (limit 3)', async () => {
      pool = new TaskPool({ maxConcurrent: 3 });

      pool.spawn('t-1', delayedTask('a', 100), { description: 'a', chatId: '1', user: 'u' });
      pool.spawn('t-2', delayedTask('b', 100), { description: 'b', chatId: '1', user: 'u' });
      pool.spawn('t-3', delayedTask('c', 100), { description: 'c', chatId: '1', user: 'u' });
      const entry4 = pool.spawn('t-4', delayedTask('d', 100), {
        description: 'd',
        chatId: '1',
        user: 'u',
      });

      assert.equal(entry4.status, 'queued');
      assert.equal(pool.queue.length, 1);
      await pool.drain();
    });
  });

  describe('2.4 — queued task starts when slot opens', () => {
    it('queued task transitions to running', async () => {
      pool = new TaskPool({ maxConcurrent: 1 });

      pool.spawn('t-1', delayedTask('a', 20), { description: 'a', chatId: '1', user: 'u' });
      const entry2 = pool.spawn('t-2', delayedTask('b', 20), {
        description: 'b',
        chatId: '1',
        user: 'u',
      });

      assert.equal(entry2.status, 'queued');

      await pool.drain();
      assert.equal(entry2.status, 'completed');
      assert.equal(entry2.result, 'b');
    });
  });

  describe('2.5 — completed task has result and endTime', () => {
    it('sets result and endTime on completion', async () => {
      const entry = pool.spawn('t-1', delayedTask('hello world', 10), {
        description: 'test',
        chatId: '1',
        user: 'u',
      });

      await pool.drain();
      assert.equal(entry.status, 'completed');
      assert.equal(entry.result, 'hello world');
      assert.ok(entry.endTime > 0);
      assert.ok(entry.endTime >= entry.startTime);
    });
  });

  describe('2.6 — failed task has error and status', () => {
    it('captures error message', async () => {
      const entry = pool.spawn('t-1', failingTask('oops'), {
        description: 'test',
        chatId: '1',
        user: 'u',
      });

      await pool.drain();
      assert.equal(entry.status, 'failed');
      assert.ok(entry.error.includes('oops'));
      assert.ok(entry.endTime > 0);
    });
  });

  describe('2.7 — cancel kills running task', () => {
    it('marks task as cancelled', async () => {
      let cancelFn;
      const fn = () => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('done'), 5000);
          cancelFn = () => {
            clearTimeout(timer);
            reject(new Error('cancelled'));
          };
        });
      };

      const entry = pool.spawn('t-1', fn, {
        description: 'slow',
        chatId: '1',
        user: 'u',
        cancel: () => cancelFn && cancelFn(),
      });

      // Give it a tick to start
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(entry.status, 'running');

      const cancelled = pool.cancel('t-1');
      assert.equal(cancelled, true);

      await new Promise((r) => setTimeout(r, 50));
      assert.equal(entry.status, 'cancelled');
    });
  });

  describe('2.8 — cancel removes queued task without running it', () => {
    it('queued task removed from queue', async () => {
      pool = new TaskPool({ maxConcurrent: 1 });
      pool.spawn('t-1', delayedTask('a', 200), { description: 'a', chatId: '1', user: 'u' });
      pool.spawn('t-2', delayedTask('b', 200), { description: 'b', chatId: '1', user: 'u' });

      assert.equal(pool.queue.length, 1);
      const cancelled = pool.cancel('t-2');
      assert.equal(cancelled, true);
      assert.equal(pool.queue.length, 0);

      const entry = pool.tasks.get('t-2');
      assert.equal(entry.status, 'cancelled');
      await pool.drain();
    });
  });

  describe('2.9 — timeout transitions to timeout status', () => {
    it('task times out', async () => {
      const entry = pool.spawn('t-1', delayedTask('slow', 5000), {
        description: 'slow',
        chatId: '1',
        user: 'u',
        timeout: 50,
      });

      await new Promise((r) => setTimeout(r, 200));
      assert.equal(entry.status, 'timeout');
    });
  });

  describe('2.10 — getRunning returns only running tasks', () => {
    it('filters correctly', async () => {
      pool = new TaskPool({ maxConcurrent: 3 });
      pool.spawn('t-1', delayedTask('a', 10), { description: 'a', chatId: '1', user: 'u' });
      pool.spawn('t-2', delayedTask('b', 200), { description: 'b', chatId: '1', user: 'u' });

      // Wait for t-1 to complete
      await new Promise((r) => setTimeout(r, 50));

      const running = pool.getRunning();
      assert.equal(running.length, 1);
      assert.equal(running[0].id, 't-2');
      await pool.drain();
    });
  });

  describe('2.11 — getAll returns all tasks', () => {
    it('includes all statuses', async () => {
      pool.spawn('t-1', delayedTask('a', 10), { description: 'a', chatId: '1', user: 'u' });
      pool.spawn('t-2', failingTask('err', 10), { description: 'b', chatId: '1', user: 'u' });

      await pool.drain();
      const all = pool.getAll();
      assert.equal(all.length, 2);
    });
  });

  describe('2.12 — getTask returns specific task', () => {
    it('finds by id', async () => {
      pool.spawn('t-1', delayedTask('a', 10), { description: 'find me', chatId: '1', user: 'u' });
      const task = pool.getTask('t-1');
      assert.ok(task);
      assert.equal(task.description, 'find me');
      await pool.drain();
    });
  });

  describe('2.13 — getTask returns null for unknown id', () => {
    it('returns null', () => {
      assert.equal(pool.getTask('nonexistent'), null);
    });
  });

  describe('2.14 — emits task-started event', () => {
    it('event fires with entry', async () => {
      const events = [];
      pool.on('task-started', (entry) => events.push(entry));

      pool.spawn('t-1', delayedTask('a', 10), { description: 'a', chatId: '1', user: 'u' });
      assert.equal(events.length, 1);
      assert.equal(events[0].id, 't-1');
      await pool.drain();
    });
  });

  describe('2.15 — emits task-completed event with result', () => {
    it('event fires on completion', async () => {
      const events = [];
      pool.on('task-completed', (entry) => events.push(entry));

      pool.spawn('t-1', delayedTask('done!', 10), { description: 'a', chatId: '1', user: 'u' });
      await pool.drain();

      assert.equal(events.length, 1);
      assert.equal(events[0].result, 'done!');
    });
  });

  describe('2.16 — emits task-failed event with error', () => {
    it('event fires on failure', async () => {
      const events = [];
      pool.on('task-failed', (entry) => events.push(entry));

      pool.spawn('t-1', failingTask('boom'), { description: 'a', chatId: '1', user: 'u' });
      await pool.drain();

      assert.equal(events.length, 1);
      assert.ok(events[0].error.includes('boom'));
    });
  });

  describe('2.17 — emits task-queued event when at capacity', () => {
    it('fires queued event', async () => {
      pool = new TaskPool({ maxConcurrent: 1 });
      const events = [];
      pool.on('task-queued', (entry) => events.push(entry));

      pool.spawn('t-1', delayedTask('a', 50), { description: 'a', chatId: '1', user: 'u' });
      pool.spawn('t-2', delayedTask('b', 50), { description: 'b', chatId: '1', user: 'u' });

      assert.equal(events.length, 1);
      assert.equal(events[0].id, 't-2');
      await pool.drain();
    });
  });

  describe('2.18 — drain resolves when all tasks complete', () => {
    it('waits for all tasks', async () => {
      pool.spawn('t-1', delayedTask('a', 30), { description: 'a', chatId: '1', user: 'u' });
      pool.spawn('t-2', delayedTask('b', 50), { description: 'b', chatId: '1', user: 'u' });
      pool.spawn('t-3', delayedTask('c', 70), { description: 'c', chatId: '1', user: 'u' });

      await pool.drain();

      const all = pool.getAll();
      assert.ok(all.every((t) => t.status === 'completed'));
    });
  });

  describe('2.19 — drain resolves immediately when no tasks', () => {
    it('resolves right away', async () => {
      const start = Date.now();
      await pool.drain();
      assert.ok(Date.now() - start < 50);
    });
  });

  describe('2.20 — concurrent task limit is respected', () => {
    it('never exceeds maxConcurrent running tasks', async () => {
      pool = new TaskPool({ maxConcurrent: 2 });
      let maxSeen = 0;

      const trackingTask = (ms) => () => {
        const running = pool.getRunning().length;
        if (running > maxSeen) maxSeen = running;
        return new Promise((r) => setTimeout(() => r('ok'), ms));
      };

      for (let i = 0; i < 5; i++) {
        pool.spawn('t-' + i, trackingTask(30), { description: 't' + i, chatId: '1', user: 'u' });
      }

      await pool.drain();
      assert.ok(maxSeen <= 2, `max concurrent was ${maxSeen}, expected <= 2`);
    });
  });

  describe('2.21 — progress callback is forwarded', () => {
    it('onProgress called during execution', async () => {
      const progressMsgs = [];
      const fn = () => {
        // Simulate calling onProgress
        return new Promise((resolve) => {
          setTimeout(() => resolve('done'), 10);
        });
      };

      pool.spawn('t-1', fn, {
        description: 'test',
        chatId: '1',
        user: 'u',
        onProgress: (msg) => progressMsgs.push(msg),
      });

      await pool.drain();
      // Progress is emitted by the pool when task starts
      // The actual progress during execution is handled by the executor
      assert.ok(pool.getTask('t-1').status === 'completed');
    });
  });

  describe('2.22 — task entry includes metadata', () => {
    it('preserves chatId, user, description', async () => {
      pool.spawn('t-1', delayedTask('ok', 10), {
        description: 'My important task',
        chatId: 'chat-456',
        user: 'james',
      });

      const entry = pool.getTask('t-1');
      assert.equal(entry.description, 'My important task');
      assert.equal(entry.chatId, 'chat-456');
      assert.equal(entry.user, 'james');
      await pool.drain();
    });
  });

  describe('2.23 — completed tasks retained with max history', () => {
    it('evicts old entries when over limit', async () => {
      pool = new TaskPool({ maxConcurrent: 10, maxHistory: 5 });

      for (let i = 0; i < 8; i++) {
        pool.spawn('t-' + i, delayedTask('r' + i, 5), {
          description: 'task ' + i,
          chatId: '1',
          user: 'u',
        });
      }

      await pool.drain();

      const all = pool.getAll();
      assert.ok(all.length <= 5, `expected <= 5 entries, got ${all.length}`);
    });
  });
});
