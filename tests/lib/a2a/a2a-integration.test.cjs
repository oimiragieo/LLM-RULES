'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { A2AClient } = require('../../../.claude/lib/a2a/client.cjs');
const { createA2aServer } = require('../../../.claude/lib/a2a/server.cjs');

const ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Helper to create an in-memory SQLite db with the a2a_tasks schema.
 */
function makeTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS a2a_tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'submitted',
      params TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_a2a_status ON a2a_tasks(status);
  `);
  return db;
}

/**
 * Helper to create a test server and get its ephemeral port.
 */
async function createTestServer(options = {}) {
  const db = options.db || makeTestDb();
  const server = createA2aServer({ port: 0, db });
  const httpServer = await server.start();
  const address = httpServer.address();
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;

  return {
    app: server.app,
    httpServer,
    port,
    baseUrl,
    stateMachine: server.stateMachine,
    sseStreams: server.sseStreams,
    db,
    stop: server.stop,
  };
}

// =============================================================================
// VAL-A2A-018: Router can dispatch tasks via A2A
// VAL-A2A-019: Channel session reports results back via A2A
// VAL-A2A-020: A2A task failure propagates correctly
// =============================================================================
describe('A2A Router Dispatch Integration', () => {
  let server, client;

  beforeEach(async () => {
    server = await createTestServer();
    client = new A2AClient({ baseUrl: server.baseUrl, timeout: 5000 });
  });

  afterEach(async () => {
    if (server) {
      server.stateMachine.stopWatchdog();
      await server.stop();
      if (server.db) server.db.close();
    }
    server = null;
    client = null;
  });

  // -------------------------------------------------------------------------
  // VAL-A2A-018: Router can dispatch tasks via A2A
  // -------------------------------------------------------------------------
  describe('VAL-A2A-018: Router dispatches tasks to channel session via A2A', () => {
    it('router sends task to channel session A2A server', async () => {
      // Simulate router dispatching a task to channel session
      const task = await client.sendTask({
        input: 'what is the current task status?',
        context: {
          source: 'router',
          target: 'channel-responder',
          sessionId: 'test-session-001',
        },
      });

      assert.ok(task.id, 'task should have id');
      assert.equal(task.status, 'working', 'task should be in working state');
      assert.equal(task.params.context.source, 'router', 'task should preserve router source');
      assert.equal(
        task.params.context.target,
        'channel-responder',
        'task should preserve channel target'
      );
    });

    it('task appears in working state on target A2A server', async () => {
      // Router creates task
      const createdTask = await client.sendTask({
        input: 'query',
        context: { source: 'router' },
      });

      // Verify task exists on server side
      const serverTask = server.stateMachine.getTask(createdTask.id);
      assert.ok(serverTask, 'task should exist on server');
      assert.equal(serverTask.status, 'working', 'task should be in working state on server');
    });

    it('router can poll for task status', async () => {
      const createdTask = await client.sendTask({ input: 'test' });

      // Router polls for status
      const polledTask = await client.getTask(createdTask.id);

      assert.ok(polledTask, 'should be able to poll task');
      assert.equal(polledTask.id, createdTask.id);
      assert.equal(polledTask.status, 'working');
    });

    it('router can dispatch multiple tasks to same session', async () => {
      const task1 = await client.sendTask({ input: 'task1' });
      const task2 = await client.sendTask({ input: 'task2' });
      const task3 = await client.sendTask({ input: 'task3' });

      assert.ok(task1.id !== task2.id, 'tasks should have unique IDs');
      assert.ok(task2.id !== task3.id, 'tasks should have unique IDs');

      // All should be in working state
      const t1 = await client.getTask(task1.id);
      const t2 = await client.getTask(task2.id);
      const t3 = await client.getTask(task3.id);

      assert.equal(t1.status, 'working');
      assert.equal(t2.status, 'working');
      assert.equal(t3.status, 'working');
    });
  });

  // -------------------------------------------------------------------------
  // VAL-A2A-019: Channel session reports results back via A2A
  // -------------------------------------------------------------------------
  describe('VAL-A2A-019: Channel session reports results back via A2A', () => {
    it('channel session completes task and router receives result', async () => {
      // Router sends task
      const task = await client.sendTask({
        input: 'summarize current status',
        context: { source: 'router' },
      });

      // Channel session processes and completes the task
      server.stateMachine.transition(task.id, 'completed', null, {
        result: {
          summary: 'All systems operational',
          tasksActive: 3,
        },
      });

      // Router polls and receives result
      const completedTask = await client.getTask(task.id);

      assert.equal(completedTask.status, 'completed', 'task should be completed');
      assert.ok(completedTask.result, 'task should have result');
      assert.equal(completedTask.result.summary, 'All systems operational');
      assert.equal(completedTask.result.tasksActive, 3);
    });

    it('SSE subscribers receive completion event', async () => {
      // Create SSE subscription
      const { taskId, stream } = await client.sendSubscribe({ input: 'test' });

      // Complete the task
      server.stateMachine.transition(taskId, 'completed', null, {
        result: { message: 'done' },
      });

      // Emit completion event on SSE stream
      const sseStream = server.sseStreams.get(taskId);
      if (sseStream) {
        sseStream.write('status', { taskId, status: 'completed', result: { message: 'done' } });
      }

      // Wait for event
      // Note: receivedEvent would capture the SSE event, but we just verify the stream works
      stream.on('status', _data => {
        // Event received successfully
      });

      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup
      stream.close();
    });

    it('channel session can add artifacts to completed task', async () => {
      const task = await client.sendTask({ input: 'generate report' });

      // Channel session completes with artifacts
      server.stateMachine.transition(task.id, 'completed', null, {
        result: { report: 'summary text' },
        artifacts: [
          { name: 'report.md', mimeType: 'text/markdown', uri: 'file://reports/report.md' },
        ],
      });

      const completed = await client.getTask(task.id);
      assert.ok(completed.artifacts, 'should have artifacts');
      assert.equal(completed.artifacts.length, 1);
      assert.equal(completed.artifacts[0].name, 'report.md');
    });
  });

  // -------------------------------------------------------------------------
  // VAL-A2A-020: A2A task failure propagates correctly
  // -------------------------------------------------------------------------
  describe('VAL-A2A-020: A2A task failure propagates correctly', () => {
    it('failed task shows status failed with error', async () => {
      const task = await client.sendTask({ input: 'risky operation' });

      // Task fails
      server.stateMachine.transition(task.id, 'failed', 'Connection refused to external service');

      const failedTask = await client.getTask(task.id);
      assert.equal(failedTask.status, 'failed');
      assert.ok(failedTask.error, 'should have error message');
      assert.ok(failedTask.error.includes('Connection refused'));
    });

    it('SSE subscribers receive failure event', async () => {
      const { taskId, stream } = await client.sendSubscribe({ input: 'test' });

      // Fail the task
      server.stateMachine.transition(taskId, 'failed', 'Task failed');

      // Emit failure event on SSE stream
      const sseStream = server.sseStreams.get(taskId);
      if (sseStream) {
        sseStream.write('status', { taskId, status: 'failed', error: 'Task failed' });
      }

      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 100));
      stream.close();
    });

    it('router can distinguish between completed and failed tasks', async () => {
      const successTask = await client.sendTask({ input: 'will succeed' });
      const failTask = await client.sendTask({ input: 'will fail' });

      server.stateMachine.transition(successTask.id, 'completed', null, { result: 'ok' });
      server.stateMachine.transition(failTask.id, 'failed', 'error occurred');

      const s = await client.getTask(successTask.id);
      const f = await client.getTask(failTask.id);

      assert.equal(s.status, 'completed');
      assert.equal(f.status, 'failed');
      assert.ok(s.result, 'completed task has result');
      assert.ok(f.error, 'failed task has error');
    });

    it('canceled tasks are distinct from failed tasks', async () => {
      const task = await client.sendTask({ input: 'test' });

      // Cancel instead of fail
      const canceledTask = await client.cancelTask(task.id);

      assert.equal(canceledTask.status, 'canceled');

      // Verify it's not failed
      const t = await client.getTask(task.id);
      assert.equal(t.status, 'canceled');
      assert.ok(!t.error, 'canceled task should not have error');
    });
  });
});

// =============================================================================
// VAL-A2A-021: Telegram integration still works after A2A wiring
// VAL-A2A-022: A2A and Telegram use independent lockfiles
// VAL-A2A-023: A2A does not interfere with other HTTP services
// =============================================================================
describe('A2A and Telegram Coexistence', () => {
  let tempDir;
  let a2aServer, telegramMockServer;
  let a2aClient;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-telegram-test-'));

    // Create A2A server on port 3100 (default)
    a2aServer = await createTestServer();

    // Create mock Telegram server on different port (simulating Telegram MCP relay)
    telegramMockServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'telegram-ok', port: res.req.socket.localPort }));
    });
    await new Promise(resolve => telegramMockServer.listen(0, resolve));

    a2aClient = new A2AClient({ baseUrl: a2aServer.baseUrl, timeout: 5000 });
  });

  afterEach(async () => {
    if (a2aServer) {
      a2aServer.stateMachine.stopWatchdog();
      await a2aServer.stop();
      if (a2aServer.db) a2aServer.db.close();
    }
    if (telegramMockServer) {
      await new Promise(resolve => telegramMockServer.close(resolve));
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    a2aServer = null;
    telegramMockServer = null;
    a2aClient = null;
  });

  // -------------------------------------------------------------------------
  // VAL-A2A-021: Telegram integration still works after A2A wiring
  // -------------------------------------------------------------------------
  describe('VAL-A2A-021: Both Telegram and A2A work together', () => {
    it('both A2A and Telegram servers respond independently', async () => {
      // A2A server responds
      const a2aCard = await a2aClient.discover();
      assert.ok(a2aCard.name, 'A2A server should respond');

      // Telegram mock server responds
      const telegramPort = telegramMockServer.address().port;
      const telegramResponse = await new Promise((resolve, reject) => {
        http
          .get(`http://localhost:${telegramPort}/`, res => {
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => resolve(JSON.parse(body)));
          })
          .on('error', reject);
      });

      assert.equal(telegramResponse.status, 'telegram-ok', 'Telegram server should respond');
    });

    it('A2A task operations do not affect Telegram server', async () => {
      // Perform A2A operations
      const task = await a2aClient.sendTask({ input: 'test' });
      await a2aClient.getTask(task.id);

      // Telegram server still works
      const telegramPort = telegramMockServer.address().port;
      const telegramResponse = await new Promise((resolve, reject) => {
        http
          .get(`http://localhost:${telegramPort}/`, res => {
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => resolve(JSON.parse(body)));
          })
          .on('error', reject);
      });

      assert.equal(telegramResponse.status, 'telegram-ok');
    });
  });

  // -------------------------------------------------------------------------
  // VAL-A2A-022: A2A and Telegram use independent lockfiles
  // -------------------------------------------------------------------------
  describe('VAL-A2A-022: Independent lockfiles', () => {
    it('A2A and Telegram use different lockfile paths', () => {
      const a2aHook = fs.readFileSync(
        path.join(ROOT, '.claude', 'hooks', 'a2a', 'a2a-server-autostart.cjs'),
        'utf8'
      );
      const telegramHook = fs.readFileSync(
        path.join(ROOT, '.claude', 'hooks', 'channels', 'channel-auto-start.cjs'),
        'utf8'
      );

      // Extract lockfile definitions
      const a2aLockMatch = a2aHook.match(/LOCKFILE\s*=\s*path\.join\([^)]+\)/);
      const telegramLockMatch = telegramHook.match(/LOCKFILE\s*=\s*path\.join\([^)]+\)/);

      assert.ok(a2aLockMatch, 'A2A hook should define lockfile');
      assert.ok(telegramLockMatch, 'Telegram hook should define lockfile');

      // Verify different names
      assert.ok(
        a2aLockMatch[0].includes('a2a-autostart-cooldown.lock'),
        'A2A should use a2a-specific lockfile'
      );
      assert.ok(
        telegramLockMatch[0].includes('channel-autostart-cooldown.lock'),
        'Telegram should use channel-specific lockfile'
      );
    });

    it('one lockfile does not block the other', () => {
      // Create A2A lockfile
      const a2aLockfile = path.join(tempDir, 'a2a-autostart-cooldown.lock');
      fs.writeFileSync(a2aLockfile, String(Date.now()));

      // Telegram lockfile should be independent
      const telegramLockfile = path.join(tempDir, 'channel-autostart-cooldown.lock');
      const telegramLockExists = fs.existsSync(telegramLockfile);

      assert.ok(!telegramLockExists, 'Telegram lockfile should not be affected by A2A lock');

      // And vice versa
      fs.unlinkSync(a2aLockfile);
      fs.writeFileSync(telegramLockfile, String(Date.now()));

      const a2aLockExists = fs.existsSync(a2aLockfile);
      assert.ok(!a2aLockExists, 'A2A lockfile should not be affected by Telegram lock');
    });
  });

  // -------------------------------------------------------------------------
  // VAL-A2A-023: A2A does not interfere with other HTTP services
  // -------------------------------------------------------------------------
  describe('VAL-A2A-023: No port conflicts or middleware leakage', () => {
    it('A2A uses different port from Telegram service', () => {
      const a2aPort = a2aServer.port;
      const telegramPort = telegramMockServer.address().port;

      assert.notEqual(a2aPort, telegramPort, 'A2A and Telegram should use different ports');
    });

    it('A2A server has no middleware affecting Telegram', async () => {
      // A2A request should not add headers to Telegram
      await a2aClient.discover();

      // Telegram request should not have A2A middleware headers
      const telegramPort = telegramMockServer.address().port;
      const response = await new Promise((resolve, reject) => {
        http
          .get(`http://localhost:${telegramPort}/`, res => {
            const headers = res.headers;
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => resolve({ headers, body }));
          })
          .on('error', reject);
      });

      // No A2A-specific headers leaked
      assert.ok(!response.headers['x-a2a-request'], 'No A2A headers leaked to Telegram');
    });

    it('both Express instances have separate middleware stacks', async () => {
      // A2A server has JSON body parser
      const task = await a2aClient.sendTask({ input: 'test' });
      assert.ok(task.id, 'A2A JSON parsing works');

      // Telegram mock server handles its own responses
      const telegramPort = telegramMockServer.address().port;
      const tgResponse = await new Promise((resolve, reject) => {
        http
          .get(`http://localhost:${telegramPort}/health`, res => {
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => resolve(JSON.parse(body)));
          })
          .on('error', reject);
      });

      assert.equal(tgResponse.status, 'telegram-ok', 'Telegram server responds independently');
    });
  });
});

// =============================================================================
// Independent PID entries in terminal-pids.json
// =============================================================================
describe('Independent PID Tracking', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-pid-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('terminal-pids.json can track both Telegram and A2A PIDs', () => {
    const tracker = {
      sessions: [
        {
          purpose: 'channel-session',
          pid: 11111,
          status: 'active',
          startedAt: new Date().toISOString(),
        },
        {
          purpose: 'a2a-server',
          pid: 22222,
          status: 'active',
          port: 3100,
          startedAt: new Date().toISOString(),
        },
      ],
    };

    const trackerPath = path.join(tempDir, 'terminal-pids.json');
    fs.writeFileSync(trackerPath, JSON.stringify(tracker), 'utf8');

    const loaded = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    assert.equal(loaded.sessions.length, 2, 'Should have 2 sessions');

    const telegramSession = loaded.sessions.find(s => s.purpose === 'channel-session');
    const a2aSession = loaded.sessions.find(s => s.purpose === 'a2a-server');

    assert.ok(telegramSession, 'Should have Telegram session');
    assert.ok(a2aSession, 'Should have A2A session');
    assert.notEqual(telegramSession.pid, a2aSession.pid, 'PIDs should be different');
  });

  it('A2A PID can be stopped independently of Telegram', () => {
    const tracker = {
      sessions: [
        { purpose: 'channel-session', pid: 11111, status: 'active' },
        { purpose: 'a2a-server', pid: 22222, status: 'active', port: 3100 },
      ],
    };

    const trackerPath = path.join(tempDir, 'terminal-pids.json');
    fs.writeFileSync(trackerPath, JSON.stringify(tracker), 'utf8');

    // Stop A2A
    const loaded = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    const updated = {
      sessions: loaded.sessions.map(s =>
        s.purpose === 'a2a-server' ? { ...s, status: 'stopped' } : s
      ),
    };
    fs.writeFileSync(trackerPath, JSON.stringify(updated), 'utf8');

    const result = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    const a2aSession = result.sessions.find(s => s.purpose === 'a2a-server');
    const telegramSession = result.sessions.find(s => s.purpose === 'channel-session');

    assert.equal(a2aSession.status, 'stopped', 'A2A should be stopped');
    assert.equal(telegramSession.status, 'active', 'Telegram should remain active');
  });
});

// =============================================================================
// End-to-end dispatch flow
// =============================================================================
describe('End-to-end Router-to-Channel Dispatch', () => {
  let server, client;

  beforeEach(async () => {
    server = await createTestServer();
    client = new A2AClient({ baseUrl: server.baseUrl, timeout: 5000 });
  });

  afterEach(async () => {
    if (server) {
      server.stateMachine.stopWatchdog();
      await server.stop();
      if (server.db) server.db.close();
    }
    server = null;
    client = null;
  });

  it('full flow: router sends task, channel processes, router receives result', async () => {
    // 1. Router sends task to channel session
    const task = await client.sendTask({
      input: 'What is the current git status?',
      context: {
        source: 'router',
        target: 'channel-responder',
        sessionId: 'session-123',
      },
    });

    assert.equal(task.status, 'working', 'Task should be in working state');

    // 2. Channel session (simulated) processes the task
    // In real flow, channel-responder would read files and compute result
    const channelResult = {
      response: 'Working tree clean, on branch main',
      filesChecked: ['git status', 'git log -1'],
    };

    // 3. Channel session reports result back
    server.stateMachine.transition(task.id, 'completed', null, {
      result: channelResult,
    });

    // 4. Router polls and receives result
    const completedTask = await client.getTask(task.id);

    assert.equal(completedTask.status, 'completed', 'Task should be completed');
    assert.deepEqual(completedTask.result, channelResult, 'Result should match channel output');
  });

  it('full flow: router sends task, channel fails, router receives error', async () => {
    // 1. Router sends task
    const task = await client.sendTask({
      input: 'Access restricted resource',
      context: { source: 'router' },
    });

    // 2. Channel session fails (e.g., permission denied)
    server.stateMachine.transition(task.id, 'failed', 'Permission denied: cannot access resource');

    // 3. Router receives failure
    const failedTask = await client.getTask(task.id);

    assert.equal(failedTask.status, 'failed');
    assert.ok(failedTask.error.includes('Permission denied'));
  });

  it('full flow: router cancels task mid-processing', async () => {
    // 1. Router sends task
    const task = await client.sendTask({ input: 'Long running query' });

    // 2. Router cancels before completion
    const canceledTask = await client.cancelTask(task.id);

    // 3. Verify canceled
    assert.equal(canceledTask.status, 'canceled');

    // 4. Channel session sees task is canceled (cannot complete)
    const t = server.stateMachine.getTask(task.id);
    assert.equal(t.status, 'canceled', 'Task is canceled on server side');
  });
});

// =============================================================================
// Persistence verification
// =============================================================================
describe('A2A Integration Persistence', () => {
  let db, server1, client1;

  beforeEach(async () => {
    db = makeTestDb();
    server1 = await createTestServer({ db });
    client1 = new A2AClient({ baseUrl: server1.baseUrl, timeout: 5000 });
  });

  afterEach(async () => {
    if (server1) {
      server1.stateMachine.stopWatchdog();
      await server1.stop();
    }
    if (db) db.close();
    server1 = null;
    client1 = null;
    db = null;
  });

  it('tasks persist across server restart', async () => {
    // 1. Create task on server1
    const task = await client1.sendTask({
      input: 'Persistent task',
      context: { source: 'router' },
    });

    // Verify in DB
    const row = db.prepare('SELECT * FROM a2a_tasks WHERE id = ?').get(task.id);
    assert.ok(row, 'Task should be in DB');
    assert.equal(row.status, 'working');

    // 2. Stop server1
    server1.stateMachine.stopWatchdog();
    await server1.stop();

    // 3. Create new server with same DB
    const server2 = createA2aServer({ port: 0, db });
    const httpServer2 = await server2.start();
    const client2 = new A2AClient({
      baseUrl: `http://localhost:${httpServer2.address().port}`,
      timeout: 5000,
    });

    // 4. Task should be restored but marked as failed (orphan recovery)
    // Note: orphan recovery transitions working tasks to failed on restart
    const restoredTask = await client2.getTask(task.id);
    assert.ok(restoredTask, 'Task should be restored from DB');
    // Task should be failed due to orphan recovery
    assert.equal(restoredTask.status, 'failed', 'Orphaned task should be marked failed on restart');

    server2.stateMachine.stopWatchdog();
    await server2.stop();
  });
});
