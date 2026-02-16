#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const memoryManager = require('../../../.claude/lib/memory/memory-manager.cjs');

const TEST_ROOT_PREFIX = '.test-memory-soak-chaos';
const SOAK_TEST_TIMEOUT_MS = Number(process.env.MEMORY_SOAK_TEST_TIMEOUT_MS || 600000);
const SOAK_WORKER_TIMEOUT_MS = Number(process.env.MEMORY_SOAK_WORKER_TIMEOUT_MS || 300000);
const RESTART_WRITES_PER_WORKER = Number(process.env.MEMORY_SOAK_RESTART_WRITES || 4);
const CONTENTION_WRITES_PER_WORKER = Number(process.env.MEMORY_SOAK_CONTENTION_WRITES || 3);
const CONCURRENT_WORKER_WRITES = Number(process.env.MEMORY_SOAK_CONCURRENT_WRITES || 2);

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
  process.exit(0);
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

async function runWorkerWithTimeout(workerScript, testRoot, workerId, count, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      [workerScript, testRoot, String(workerId), String(count)],
      {
        cwd: path.join(__dirname),
        env: {
          ...process.env,
          MEMORY_FILE_LOCK_TIMEOUT_MS: '120000',
          MEMORY_FILE_LOCK_WAIT_MS: '5',
          MEMORY_AUTO_SYNC: 'off',
          MEMORY_EMBED_ON_WRITE: 'off',
          MEMORY_EMIT_EVENTS: 'off',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = fn => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    proc.stdout.on('data', d => {
      stdout += d.toString();
    });
    proc.stderr.on('data', d => {
      stderr += d.toString();
    });

    proc.on(
      'close',
      finish(code => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(`worker ${workerId} failed (${code}): ${stderr || stdout}`));
      })
    );

    proc.on(
      'error',
      finish(err => {
        reject(err);
      })
    );

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (_err) {
        // Best effort kill.
      }
      finish(reject)(new Error(`worker ${workerId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
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

function logPhase(message) {
  if (process.env.MEMORY_SOAK_PROGRESS === 'off') return;
  process.stdout.write(`[memory-soak-chaos] ${message}\n`);
}

test(
  'soak+chaos: multi-process contention and restart keeps memory JSON valid',
  { timeout: SOAK_TEST_TIMEOUT_MS },
  async () => {
    const testRoot = createTestRoot('contention-restart');
    const workerScript = setup(testRoot);
    try {
      logPhase(
        `config test_timeout=${SOAK_TEST_TIMEOUT_MS} worker_timeout=${SOAK_WORKER_TIMEOUT_MS}`
      );
      // restart-style phases
      logPhase('phase restart A');
      await runWorkerWithTimeout(
        workerScript,
        testRoot,
        'A',
        RESTART_WRITES_PER_WORKER,
        SOAK_WORKER_TIMEOUT_MS
      );
      logPhase('phase restart B');
      await runWorkerWithTimeout(
        workerScript,
        testRoot,
        'B',
        RESTART_WRITES_PER_WORKER,
        SOAK_WORKER_TIMEOUT_MS
      );

      // contention spike
      logPhase('phase contention C1-C4');
      await Promise.all([
        runWorkerWithTimeout(
          workerScript,
          testRoot,
          'C1',
          CONTENTION_WRITES_PER_WORKER,
          SOAK_WORKER_TIMEOUT_MS
        ),
        runWorkerWithTimeout(
          workerScript,
          testRoot,
          'C2',
          CONTENTION_WRITES_PER_WORKER,
          SOAK_WORKER_TIMEOUT_MS
        ),
        runWorkerWithTimeout(
          workerScript,
          testRoot,
          'C3',
          CONTENTION_WRITES_PER_WORKER,
          SOAK_WORKER_TIMEOUT_MS
        ),
        runWorkerWithTimeout(
          workerScript,
          testRoot,
          'C4',
          CONTENTION_WRITES_PER_WORKER,
          SOAK_WORKER_TIMEOUT_MS
        ),
      ]);

      const patternsPath = path.join(testRoot, '.claude', 'context', 'memory', 'patterns.json');
      const gotchasPath = path.join(testRoot, '.claude', 'context', 'memory', 'gotchas.json');
      const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
      const gotchas = JSON.parse(fs.readFileSync(gotchasPath, 'utf8'));

      assert.ok(Array.isArray(patterns));
      assert.ok(Array.isArray(gotchas));
      const expectedEntries = RESTART_WRITES_PER_WORKER * 2 + CONTENTION_WRITES_PER_WORKER * 4;
      assert.ok(
        patterns.length >= expectedEntries,
        `expected >=${expectedEntries} patterns, got ${patterns.length}`
      );
      assert.ok(
        gotchas.length >= expectedEntries,
        `expected >=${expectedEntries} gotchas, got ${gotchas.length}`
      );
      assert.equal(countTempArtifacts(testRoot), 0);
    } finally {
      cleanup(testRoot);
    }
  }
);

test('fault injection: malformed JSON recovers on next write', { timeout: 60000 }, async () => {
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
  'soak+chaos: concurrent workers preserve all writes and leave no artifacts',
  { timeout: SOAK_TEST_TIMEOUT_MS },
  async () => {
    const testRoot = createTestRoot('10-workers');
    const workerScript = setup(testRoot);
    try {
      const workers = [];
      const workerCount = 6;
      const writesPerWorker = CONCURRENT_WORKER_WRITES;

      for (let i = 0; i < workerCount; i++) {
        workers.push(
          runWorkerWithTimeout(
            workerScript,
            testRoot,
            `W${i}`,
            writesPerWorker,
            SOAK_WORKER_TIMEOUT_MS
          )
        );
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
