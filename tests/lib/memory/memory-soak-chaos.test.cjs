#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const memoryManager = require('../../../.claude/lib/memory/memory-manager.cjs');

const TEST_ROOT_PREFIX = '.test-memory-soak-chaos';

function createTestRoot(label) {
  const safeLabel = String(label || 'default').replace(/[^a-zA-Z0-9_-]/g, '-');
  return path.join(
    __dirname,
    `${TEST_ROOT_PREFIX}-${safeLabel}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  );
}

function setup(testRoot) {
  cleanup(testRoot);
  fs.mkdirSync(path.join(testRoot, '.claude', 'context', 'memory'), { recursive: true });
  const workerScript = path.join(testRoot, 'memory-worker.cjs');
  fs.writeFileSync(
    workerScript,
    `
const manager = require('../../../../.claude/lib/memory/memory-manager.cjs');
const root = process.argv[2];
const worker = process.argv[3];
const count = Number(process.argv[4] || '50');
(async () => {
  for (let i = 0; i < count; i++) {
    await manager.recordPatternAsync({ text: \`worker-\${worker}-pattern-\${i}\` }, root);
    await manager.recordGotchaAsync({ text: \`worker-\${worker}-gotcha-\${i}\` }, root);
  }
  process.stdout.write('ok');
})().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
`,
    'utf8'
  );
  return workerScript;
}

function cleanup(testRoot) {
  if (!testRoot) return;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      fs.rmSync(testRoot, { recursive: true, force: true });
      return;
    } catch (err) {
      if (!err || (err.code !== 'EBUSY' && err.code !== 'EPERM')) {
        throw err;
      }
      const sab = new SharedArrayBuffer(4);
      const ia = new Int32Array(sab);
      Atomics.wait(ia, 0, 0, 50);
    }
  }
  // Final fallback for Windows handle lag: move aside so next setup can proceed.
  if (fs.existsSync(testRoot)) {
    const quarantine = `${testRoot}.pending-delete-${Date.now()}`;
    try {
      fs.renameSync(testRoot, quarantine);
      try {
        fs.rmSync(quarantine, { recursive: true, force: true });
      } catch {
        // Best effort cleanup only.
      }
    } catch {
      // Last resort: leave path in place; setup() will retry cleanup.
    }
  }
}

function runWorker(workerScript, testRoot, workerId, count) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [workerScript, testRoot, String(workerId), String(count)],
      {
        cwd: path.join(__dirname),
        env: {
          ...process.env,
          MEMORY_FILE_LOCK_TIMEOUT_MS: '30000',
          MEMORY_FILE_LOCK_WAIT_MS: '10',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => {
      stdout += d.toString();
    });
    proc.stderr.on('data', d => {
      stderr += d.toString();
    });
    proc.on('close', code => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`worker ${workerId} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function runWorkerWithTimeout(workerScript, testRoot, workerId, count, timeoutMs = 45000) {
  let timer = null;
  try {
    return await Promise.race([
      runWorker(workerScript, testRoot, workerId, count),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`worker ${workerId} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasPrefixEntry(entries, prefix) {
  return entries.some(entry => String(entry && entry.text ? entry.text : '').startsWith(prefix));
}

function countTempArtifacts(rootDir) {
  const stack = [path.join(rootDir, '.claude', 'context', 'memory')];
  let count = 0;
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fp);
      } else if (
        entry.name.endsWith('.tmp') ||
        entry.name.includes('.tmp.') ||
        entry.name.startsWith('.tmp-') ||
        entry.name.endsWith('.lock')
      ) {
        count += 1;
      }
    }
  }
  return count;
}

test('soak+chaos: multi-process contention and restart keeps memory JSON valid', async () => {
  const testRoot = createTestRoot('contention-restart');
  const workerScript = setup(testRoot);
  try {
    // restart-style phases
    await runWorker(workerScript, testRoot, 'A', 40);
    await runWorker(workerScript, testRoot, 'B', 40);

    // contention spike
    await Promise.all([
      runWorker(workerScript, testRoot, 'C1', 35),
      runWorker(workerScript, testRoot, 'C2', 35),
      runWorker(workerScript, testRoot, 'C3', 35),
      runWorker(workerScript, testRoot, 'C4', 35),
    ]);

    const patternsPath = path.join(testRoot, '.claude', 'context', 'memory', 'patterns.json');
    const gotchasPath = path.join(testRoot, '.claude', 'context', 'memory', 'gotchas.json');
    const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
    const gotchas = JSON.parse(fs.readFileSync(gotchasPath, 'utf8'));

    assert.ok(Array.isArray(patterns));
    assert.ok(Array.isArray(gotchas));
    assert.ok(patterns.length >= 180, `expected >=180 patterns, got ${patterns.length}`);
    assert.ok(gotchas.length >= 180, `expected >=180 gotchas, got ${gotchas.length}`);
    assert.equal(countTempArtifacts(testRoot), 0);
  } finally {
    cleanup(testRoot);
  }
});

test('fault injection: malformed JSON recovers on next write', async () => {
  const testRoot = createTestRoot('fault-injection');
  setup(testRoot);
  try {
    const memDir = path.join(testRoot, '.claude', 'context', 'memory');
    fs.writeFileSync(path.join(memDir, 'patterns.json'), '{"broken":', 'utf8');
    fs.writeFileSync(path.join(memDir, 'gotchas.json'), '[', 'utf8');

    await memoryManager.recordPatternAsync({ text: 'recover-pattern' }, testRoot);
    await memoryManager.recordGotchaAsync({ text: 'recover-gotcha' }, testRoot);

    const patterns = JSON.parse(fs.readFileSync(path.join(memDir, 'patterns.json'), 'utf8'));
    const gotchas = JSON.parse(fs.readFileSync(path.join(memDir, 'gotchas.json'), 'utf8'));

    assert.ok(patterns.some(p => String(p.text).includes('recover-pattern')));
    assert.ok(gotchas.some(g => String(g.text).includes('recover-gotcha')));
  } finally {
    cleanup(testRoot);
  }
});

test(
  'soak+chaos: 10 concurrent workers preserve all writes and leave no artifacts',
  { timeout: 120000 },
  async () => {
    const testRoot = createTestRoot('10-workers');
    const workerScript = setup(testRoot);
    try {
      const workers = [];
      const workerCount = 10;
      const writesPerWorker = 12;

      for (let i = 0; i < workerCount; i++) {
        workers.push(runWorkerWithTimeout(workerScript, testRoot, `W${i}`, writesPerWorker, 60000));
      }

      await Promise.all(workers);

      const patternsPath = path.join(testRoot, '.claude', 'context', 'memory', 'patterns.json');
      const gotchasPath = path.join(testRoot, '.claude', 'context', 'memory', 'gotchas.json');
      const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
      const gotchas = JSON.parse(fs.readFileSync(gotchasPath, 'utf8'));

      assert.ok(Array.isArray(patterns));
      assert.ok(Array.isArray(gotchas));
      assert.ok(patterns.length >= workerCount * writesPerWorker);
      assert.ok(gotchas.length >= workerCount * writesPerWorker);

      for (let i = 0; i < workerCount; i++) {
        assert.equal(hasPrefixEntry(patterns, `worker-W${i}-pattern-`), true);
        assert.equal(hasPrefixEntry(gotchas, `worker-W${i}-gotcha-`), true);
      }

      assert.equal(countTempArtifacts(testRoot), 0);
    } finally {
      cleanup(testRoot);
    }
  }
);
