#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');

const workerThreads = require('node:worker_threads');
const originalWorker = workerThreads.Worker;

function loadRunner() {
  const modulePath = require.resolve('../../../.claude/lib/utils/hook-runner.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

test('hook runner cleans busy/pool when worker exits without message', async t => {
  class ExitOnlyWorker extends EventEmitter {
    constructor() {
      super();
      this.threadId = 101;
    }
    postMessage() {
      setImmediate(() => {
        this.threadId = -1;
        this.emit('exit', 1);
      });
    }
    terminate() {
      this.threadId = -1;
      return Promise.resolve(1);
    }
  }

  workerThreads.Worker = ExitOnlyWorker;
  const HookRunner = loadRunner();
  HookRunner.__resetPoolForTests();
  t.after(() => {
    HookRunner.__resetPoolForTests();
    workerThreads.Worker = originalWorker;
  });

  const runner = new HookRunner({ mode: 'worker', maxWorkers: 1, workerRunTimeoutMs: 25 });
  const code = await runner.runWorker('/tmp/fake-hook.cjs', []);
  assert.equal(code, 1);

  const pool = HookRunner.__getPoolState();
  assert.equal(pool.busy.size, 0);
  assert.equal(pool.workers.length, 0);
});

test('hook runner times out unresponsive worker and releases pool state', async t => {
  class HungWorker extends EventEmitter {
    constructor() {
      super();
      this.threadId = 202;
      this.terminated = false;
    }
    postMessage() {
      // Intentionally do nothing: no message, no exit
    }
    terminate() {
      this.terminated = true;
      this.threadId = -1;
      return Promise.resolve(1);
    }
  }

  workerThreads.Worker = HungWorker;
  const HookRunner = loadRunner();
  HookRunner.__resetPoolForTests();
  t.after(() => {
    HookRunner.__resetPoolForTests();
    workerThreads.Worker = originalWorker;
  });

  const runner = new HookRunner({ mode: 'worker', maxWorkers: 1, workerRunTimeoutMs: 20 });
  const code = await runner.runWorker('/tmp/fake-hook.cjs', []);
  assert.equal(code, 1);

  const pool = HookRunner.__getPoolState();
  assert.equal(pool.busy.size, 0);
  assert.equal(pool.workers.length, 0);
});
