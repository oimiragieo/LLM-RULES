'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { atomicWriteSync } = require('../../../.claude/lib/utils/atomic-write.cjs');

test('atomicWriteSync waits when cross-process lock is held', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-lock-test-'));
  const target = path.join(dir, 'state.json');
  fs.writeFileSync(target, '{"initial":true}\n', 'utf8');

  const holdMs = 450;
  const lockerScript = `
    const lockfile = require('proper-lockfile');
    const filePath = process.argv[1];
    const ms = Number(process.argv[2] || '300');
    const release = lockfile.lockSync(filePath, { stale: 5000, retries: { retries: 0 } });
    setTimeout(() => { release(); process.exit(0); }, ms);
  `;

  const locker = spawn(process.execPath, ['-e', lockerScript, target, String(holdMs)], {
    stdio: 'ignore',
    windowsHide: true,
  });

  await new Promise(resolve => setTimeout(resolve, 100));

  const started = Date.now();
  atomicWriteSync(target, '{"updated":true}\n', 'utf8');
  const elapsed = Date.now() - started;

  await new Promise(resolve => {
    locker.on('exit', () => resolve());
  });

  assert.ok(elapsed >= holdMs - 100, `expected lock wait >= ${holdMs - 100}ms, got ${elapsed}ms`);
  assert.equal(fs.readFileSync(target, 'utf8'), '{"updated":true}\n');

  fs.rmSync(dir, { recursive: true, force: true });
});
