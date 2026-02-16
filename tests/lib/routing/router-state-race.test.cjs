'use strict';

const routerState = require('../../../.claude/lib/routing/router-state.cjs');
const assert = require('assert');
const test = require('node:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('Router State Race Conditions', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-state-race-'));
  const stateFile = path.join(tmpDir, 'router-state.json');
  process.env.ROUTER_STATE_FILE = stateFile;

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ROUTER_STATE_FILE;
  });

  await t.test('concurrent saveStateWithRetry should maintain consistency', async () => {
    const iterations = 20;
    const promises = [];

    // Reset state first
    routerState.resetToRouterMode();

    for (let i = 0; i < iterations; i++) {
      promises.push(
        new Promise((resolve, reject) => {
          try {
            // We can't use await here because we want them to overlap
            // and trigger the retry logic
            routerState.saveStateWithRetry({ lastTaskUpdateStatus: `iteration-${i}` });
            resolve();
          } catch (err) {
            reject(err);
          }
        })
      );
    }

    const results = await Promise.allSettled(promises);
    const rejected = results.filter(r => r.status === 'rejected');

    console.log(`Success: ${iterations - rejected.length}, Failed: ${rejected.length}`);

    // We expect some to fail if they exceed MAX_RETRIES (5),
    // but the file should NOT be corrupted.
    const finalState = routerState.getState();
    assert.ok(typeof finalState === 'object');
    assert.ok(finalState.version > 0);
  });
});
