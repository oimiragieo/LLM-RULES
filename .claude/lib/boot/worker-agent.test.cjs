const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const WORKER_PATH = path.join(__dirname, 'worker-agent.cjs');

async function createTempRoot() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-studio-worker-'));
  return dir;
}

function spawnWorker(envOverrides) {
  const child = spawn(process.execPath, [WORKER_PATH], {
    env: { ...process.env, ...envOverrides },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  const exit = new Promise(resolve => {
    child.on('exit', code => resolve(code));
  });

  return { child, exit };
}

async function waitForFile(filePath, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fs.access(filePath);
      return true;
    } catch (_err) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  return false;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

test('worker writes heartbeat on WORKER_ONCE', async () => {
  const projectRoot = await createTempRoot();
  const heartbeatPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'worker-heartbeat.json'
  );

  const { exit } = spawnWorker({
    WORKER_ENABLED: '1',
    WORKER_ONCE: '1',
    WORKER_PROJECT_ROOT: projectRoot,
    WORKER_TASKS: ' ',
    WORKER_METRICS: 'off',
    WORKER_EVENTS: 'off',
  });

  const code = await exit;
  assert.strictEqual(code, 0);

  const exists = await waitForFile(heartbeatPath, 2000);
  assert.ok(exists, 'heartbeat file should exist');

  const heartbeat = await readJson(heartbeatPath);
  assert.strictEqual(heartbeat.status, 'ok');
});

test('worker backs off after failure', async () => {
  const projectRoot = await createTempRoot();
  const metricsPath = path.join(projectRoot, '.claude', 'context', 'metrics', 'worker.jsonl');

  const { child, exit } = spawnWorker({
    WORKER_ENABLED: '1',
    WORKER_PROJECT_ROOT: projectRoot,
    WORKER_TASKS: 'maintenance',
    WORKER_INTERVAL_MS: '10',
    WORKER_BACKOFF_BASE_MS: '50',
    WORKER_BACKOFF_MAX_MS: '50',
    WORKER_EVENTS: 'off',
  });

  const start = Date.now();
  let lines = [];
  while (Date.now() - start < 2000) {
    try {
      const raw = await fs.readFile(metricsPath, 'utf8');
      lines = raw.trim().split('\n').filter(Boolean);
      if (lines.length >= 2) break;
    } catch (_err) {
      // ignore until file exists
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  child.kill('SIGTERM');
  await exit;

  assert.ok(lines.length >= 2, 'expected at least two tick entries');
  const first = JSON.parse(lines[0]);
  const second = JSON.parse(lines[1]);
  const delta = new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime();
  assert.ok(delta >= 40, `expected backoff delay, got ${delta}ms`);
});

test('worker exits on SIGTERM without hanging', async () => {
  const projectRoot = await createTempRoot();
  const heartbeatPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'runtime',
    'worker-heartbeat.json'
  );

  const { child, exit } = spawnWorker({
    WORKER_ENABLED: '1',
    WORKER_PROJECT_ROOT: projectRoot,
    WORKER_TASKS: ' ',
    WORKER_INTERVAL_MS: '1000',
    WORKER_EVENTS: 'off',
    WORKER_METRICS: 'off',
  });

  const exists = await waitForFile(heartbeatPath, 2000);
  assert.ok(exists, 'heartbeat file should exist before shutdown');

  child.kill('SIGTERM');
  const code = await Promise.race([
    exit,
    new Promise(resolve => setTimeout(() => resolve('timeout'), 2000)),
  ]);

  assert.notStrictEqual(code, 'timeout', 'worker should exit on SIGTERM');
});
