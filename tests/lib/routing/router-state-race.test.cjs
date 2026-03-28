'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Worker } = require('node:worker_threads');

const MODULE_PATH = path.resolve(__dirname, '../../../.claude/lib/routing/router-state.cjs');

function loadRouterState() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

function setupTempState(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-state-race-'));
  const stateFile = path.join(tmpDir, 'router-state.json');
  const previousStateFile = process.env.ROUTER_STATE_FILE;
  const previousSessionId = process.env.CLAUDE_SESSION_ID;

  process.env.ROUTER_STATE_FILE = stateFile;
  process.env.CLAUDE_SESSION_ID = 'race-session';

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete require.cache[require.resolve(MODULE_PATH)];
    if (previousStateFile === undefined) {
      delete process.env.ROUTER_STATE_FILE;
    } else {
      process.env.ROUTER_STATE_FILE = previousStateFile;
    }
    if (previousSessionId === undefined) {
      delete process.env.CLAUDE_SESSION_ID;
    } else {
      process.env.CLAUDE_SESSION_ID = previousSessionId;
    }
  });

  return stateFile;
}

function runConcurrentWriter(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
        const { parentPort, workerData } = require('node:worker_threads');
        process.env.ROUTER_STATE_FILE = workerData.stateFile;
        process.env.CLAUDE_SESSION_ID = workerData.sessionId;
        const gate = new Int32Array(workerData.barrier);
        Atomics.wait(gate, 0, 0);
        delete require.cache[require.resolve(workerData.modulePath)];
        const routerState = require(workerData.modulePath);
        const saved = routerState.saveStateWithRetry(workerData.update);
        parentPort.postMessage({ version: saved.version, keys: Object.keys(workerData.update) });
      `,
      { eval: true, workerData }
    );

    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

test('concurrent saveStateWithRetry calls preserve disjoint fields', async t => {
  const stateFile = setupTempState(t);
  const routerState = loadRouterState();
  routerState.resetToRouterMode();

  const barrier = new SharedArrayBuffer(4);
  const gate = new Int32Array(barrier);
  const updates = Array.from({ length: 8 }, (_, index) => ({
    [`field${index}`]: `value-${index}`,
  }));

  const workers = updates.map(update =>
    runConcurrentWriter({
      modulePath: MODULE_PATH,
      stateFile,
      sessionId: 'race-session',
      update,
      barrier,
    })
  );

  Atomics.store(gate, 0, 1);
  Atomics.notify(gate, 0, updates.length);
  await Promise.all(workers);

  routerState.invalidateStateCache();
  const finalState = routerState.getState();
  for (const [index] of updates.entries()) {
    assert.equal(finalState[`field${index}`], `value-${index}`);
  }
  assert.ok(finalState.version >= updates.length + 1);
});
