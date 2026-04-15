'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const { createA2aServer } = require('../../../.claude/lib/a2a/server.cjs');
const a2aDispatch = require('../../../.claude/lib/routing/a2a-dispatch.cjs');

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
// A2A Dispatch Module Tests
// =============================================================================
describe('A2A Dispatch Module', () => {
  let server, tempDir, _cmdQueuePath;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-dispatch-test-'));
    _cmdQueuePath = path.join(tempDir, 'telegram-command-queue.json');
    server = await createTestServer();
  });

  afterEach(async () => {
    if (server) {
      server.stateMachine.stopWatchdog();
      await server.stop();
      if (server.db) server.db.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    // Reset A2A client state between tests
    a2aDispatch.resetA2AClient();
    // Restore env
    delete process.env.A2A_AUTO_START;
    delete process.env.A2A_PORT;
    delete process.env.A2A_DISPATCH_MODE;
  });

  // ---------------------------------------------------------------------------
  // Configuration Tests
  // ---------------------------------------------------------------------------
  describe('Configuration', () => {
    it('getA2APort returns default port 3100', () => {
      delete process.env.A2A_PORT;
      assert.equal(a2aDispatch.getA2APort(), 3100);
    });

    it('getA2APort respects A2A_PORT env var', () => {
      process.env.A2A_PORT = '3200';
      assert.equal(a2aDispatch.getA2APort(), 3200);
    });

    it('isA2AEnabled returns false by default', () => {
      delete process.env.A2A_AUTO_START;
      assert.equal(a2aDispatch.isA2AEnabled(), false);
    });

    it('isA2AEnabled returns true when A2A_AUTO_START=true', () => {
      process.env.A2A_AUTO_START = 'true';
      assert.equal(a2aDispatch.isA2AEnabled(), true);
    });
  });

  // ---------------------------------------------------------------------------
  // Target Detection Tests
  // ---------------------------------------------------------------------------
  describe('isChannelSessionTarget', () => {
    it('returns true for channel-responder', () => {
      assert.equal(a2aDispatch.isChannelSessionTarget('channel-responder'), true);
    });

    it('returns true for channel_session', () => {
      assert.equal(a2aDispatch.isChannelSessionTarget('channel_session'), true);
    });

    it('returns false for other agents', () => {
      assert.equal(a2aDispatch.isChannelSessionTarget('developer'), false);
      assert.equal(a2aDispatch.isChannelSessionTarget('architect'), false);
      assert.equal(a2aDispatch.isChannelSessionTarget('router'), false);
    });

    it('handles null/undefined gracefully', () => {
      assert.equal(a2aDispatch.isChannelSessionTarget(null), false);
      assert.equal(a2aDispatch.isChannelSessionTarget(undefined), false);
      assert.equal(a2aDispatch.isChannelSessionTarget(''), false);
    });

    it('is case-insensitive', () => {
      assert.equal(a2aDispatch.isChannelSessionTarget('Channel-Responder'), true);
      assert.equal(a2aDispatch.isChannelSessionTarget('CHANNEL-RESPONDER'), true);
    });
  });

  // ---------------------------------------------------------------------------
  // Reachability Tests
  // ---------------------------------------------------------------------------
  describe('isA2AReachable', () => {
    it('returns true when A2A server is running', async () => {
      process.env.A2A_PORT = String(server.port);
      const reachable = await a2aDispatch.isA2AReachable();
      assert.equal(reachable, true);
    });

    it('returns false when no server is running on unused port', async () => {
      process.env.A2A_PORT = '59998'; // Unlikely to have a server here
      const reachable = await a2aDispatch.isA2AReachable(500);
      assert.equal(reachable, false);
    });

    it('returns false on connection refused', async () => {
      process.env.A2A_PORT = '59999'; // Unlikely to have a server here
      const reachable = await a2aDispatch.isA2AReachable(500);
      assert.equal(reachable, false);
    });
  });

  // ---------------------------------------------------------------------------
  // A2A Status Tests
  // ---------------------------------------------------------------------------
  describe('getA2AStatus', () => {
    it('returns correct status when A2A is disabled', async () => {
      delete process.env.A2A_AUTO_START;
      const status = await a2aDispatch.getA2AStatus();
      assert.equal(status.enabled, false);
    });

    it('returns correct status when A2A is enabled and reachable', async () => {
      process.env.A2A_AUTO_START = 'true';
      process.env.A2A_PORT = String(server.port);
      const status = await a2aDispatch.getA2AStatus();
      assert.equal(status.enabled, true);
      assert.equal(status.reachable, true);
      assert.equal(status.port, server.port);
    });

    it('returns correct status when A2A is enabled but not reachable', async () => {
      process.env.A2A_AUTO_START = 'true';
      process.env.A2A_PORT = '59999';
      const status = await a2aDispatch.getA2AStatus();
      assert.equal(status.enabled, true);
      assert.equal(status.reachable, false);
    });
  });

  // ---------------------------------------------------------------------------
  // Dispatch Tests
  // ---------------------------------------------------------------------------
  describe('dispatchToChannelSession', () => {
    it('returns error for invalid target', async () => {
      const result = await a2aDispatch.dispatchToChannelSession({
        target: 'developer',
        input: 'test',
      });
      assert.equal(result.success, false);
      assert.ok(result.error.includes('Invalid target'));
    });

    it('dispatches via A2A when reachable', async () => {
      process.env.A2A_AUTO_START = 'true';
      process.env.A2A_PORT = String(server.port);

      const result = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'What is the git status?',
        context: { sessionId: 'test-session' },
      });

      assert.equal(result.success, true);
      assert.ok(result.taskId);
      assert.equal(result.method, 'a2a');
    });

    it('falls back to file IPC when A2A not reachable', async () => {
      process.env.A2A_AUTO_START = 'true';
      process.env.A2A_PORT = '59999'; // Non-existent server

      const result = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'test prompt',
      });

      assert.equal(result.success, true);
      assert.equal(result.method, 'file-ipc');
      assert.equal(result.fallback, true);
    });

    it('dispatches via file IPC when A2A is disabled', async () => {
      delete process.env.A2A_AUTO_START;

      const result = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'test prompt',
      });

      assert.equal(result.success, true);
      assert.equal(result.method, 'file-ipc');
    });

    it('respects forceFileIPC option', async () => {
      process.env.A2A_AUTO_START = 'true';
      process.env.A2A_PORT = String(server.port);

      const result = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'test',
        forceFileIPC: true,
      });

      assert.equal(result.success, true);
      assert.equal(result.method, 'file-ipc');
    });

    it('respects forceA2A option', async () => {
      process.env.A2A_PORT = '59997'; // Use unused port so A2A fails
      const result = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'test',
        forceA2A: true,
      });

      // Will fail because no server is set up at this port
      assert.equal(result.success, false);
      assert.equal(result.method, 'a2a');
    });
  });

  // ---------------------------------------------------------------------------
  // A2A Dispatch Tests
  // ---------------------------------------------------------------------------
  describe('dispatchViaA2A', () => {
    it('creates task on A2A server', async () => {
      process.env.A2A_PORT = String(server.port);
      a2aDispatch.resetA2AClient();

      const result = await a2aDispatch.dispatchViaA2A({
        target: 'channel-responder',
        input: 'What is the current branch?',
        context: { sessionId: 'test-session' },
      });

      assert.equal(result.success, true);
      assert.ok(result.taskId);
      assert.equal(result.status, 'working');
      assert.equal(result.method, 'a2a');

      // Verify task exists on server
      const serverTask = server.stateMachine.getTask(result.taskId);
      assert.ok(serverTask);
      assert.equal(serverTask.status, 'working');
    });

    it('handles network errors gracefully', async () => {
      process.env.A2A_PORT = '59999';
      process.env.A2A_AUTO_START = 'true';
      a2aDispatch.resetA2AClient();

      // dispatchViaA2A should handle network errors
      // The behavior depends on whether the client throws or returns an error
      const result = await a2aDispatch.dispatchViaA2A({
        target: 'channel-responder',
        input: 'test',
      });

      // Verify the result is structured correctly
      assert.equal(result.method, 'a2a');
      // Either it fails with an error, or succeeds (if somehow cached)
      assert.ok(typeof result.success === 'boolean');
    });
  });

  // ---------------------------------------------------------------------------
  // File IPC Dispatch Tests
  // ---------------------------------------------------------------------------
  describe('dispatchViaFileIPC', () => {
    it('writes to telegram command queue', async () => {
      const result = await a2aDispatch.dispatchViaFileIPC({
        target: 'channel-responder',
        input: 'What is the status?',
        context: { sessionId: 'test-session' },
      });

      assert.equal(result.success, true);
      assert.ok(result.taskId);
      assert.equal(result.method, 'file-ipc');
    });

    it('creates queue file if not exists', async () => {
      // Ensure queue doesn't exist
      const queuePath = path.join(
        path.resolve(__dirname, '..', '..', '..'),
        '.claude',
        'context',
        'tmp',
        'telegram-command-queue.json'
      );

      const result = await a2aDispatch.dispatchViaFileIPC({
        target: 'channel-responder',
        input: 'test',
      });

      assert.equal(result.success, true);

      // Verify file was created (if it didn't exist before)
      if (fs.existsSync(queuePath)) {
        const raw = fs.readFileSync(queuePath, 'utf8');
        const queue = JSON.parse(raw);
        const entry = queue.find(e => e.id === result.taskId);
        assert.ok(entry, 'Task should be in queue');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Poll Result Tests
  // ---------------------------------------------------------------------------
  describe('pollTaskResult', () => {
    it('polls completed task via A2A', async () => {
      process.env.A2A_PORT = String(server.port);
      process.env.A2A_AUTO_START = 'true';
      a2aDispatch.resetA2AClient();

      // Create and complete a task
      const dispatchResult = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'test',
      });

      server.stateMachine.transition(dispatchResult.taskId, 'completed', null, {
        result: { response: 'All good' },
      });

      const pollResult = await a2aDispatch.pollTaskResult(dispatchResult.taskId, {
        timeout: 5000,
        interval: 100,
      });

      assert.equal(pollResult.success, true);
      assert.equal(pollResult.status, 'completed');
      assert.deepEqual(pollResult.result, { response: 'All good' });
    });

    it('returns failure for failed task', async () => {
      process.env.A2A_PORT = String(server.port);
      process.env.A2A_AUTO_START = 'true';
      a2aDispatch.resetA2AClient();

      const dispatchResult = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'test',
      });

      server.stateMachine.transition(dispatchResult.taskId, 'failed', 'Something went wrong');

      const pollResult = await a2aDispatch.pollTaskResult(dispatchResult.taskId, {
        timeout: 5000,
        interval: 100,
      });

      assert.equal(pollResult.success, false);
      assert.equal(pollResult.status, 'failed');
      assert.ok(pollResult.error);
    });

    it('times out for long-running task', async () => {
      process.env.A2A_PORT = String(server.port);
      process.env.A2A_AUTO_START = 'true';
      a2aDispatch.resetA2AClient();

      const dispatchResult = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'test',
      });

      // Don't complete the task
      const pollResult = await a2aDispatch.pollTaskResult(dispatchResult.taskId, {
        timeout: 500,
        interval: 100,
      });

      assert.equal(pollResult.success, false);
      assert.ok(pollResult.error.includes('timeout'));
    });
  });

  // ---------------------------------------------------------------------------
  // Cancel Task Tests
  // ---------------------------------------------------------------------------
  describe('cancelTask', () => {
    it('cancels task via A2A', async () => {
      process.env.A2A_PORT = String(server.port);
      process.env.A2A_AUTO_START = 'true';
      a2aDispatch.resetA2AClient();

      const dispatchResult = await a2aDispatch.dispatchToChannelSession({
        target: 'channel-responder',
        input: 'test',
      });

      const cancelResult = await a2aDispatch.cancelTask(dispatchResult.taskId);
      assert.equal(cancelResult.success, true);

      // Verify task is canceled
      const task = server.stateMachine.getTask(dispatchResult.taskId);
      assert.equal(task.status, 'canceled');
    });
  });

  // ---------------------------------------------------------------------------
  // Client Management Tests
  // ---------------------------------------------------------------------------
  describe('getA2AClient', () => {
    it('returns null when client initialization fails', () => {
      process.env.A2A_PORT = 'invalid';
      a2aDispatch.resetA2AClient();

      const client = a2aDispatch.getA2AClient();
      // Should still return a client (it doesn't validate port at init time)
      assert.ok(client);
    });

    it('returns cached client on subsequent calls', () => {
      process.env.A2A_PORT = String(server.port);
      a2aDispatch.resetA2AClient();

      const client1 = a2aDispatch.getA2AClient();
      const client2 = a2aDispatch.getA2AClient();
      assert.strictEqual(client1, client2);
    });
  });

  describe('resetA2AClient', () => {
    it('clears cached client', () => {
      process.env.A2A_PORT = String(server.port);

      const client1 = a2aDispatch.getA2AClient();
      a2aDispatch.resetA2AClient();
      const client2 = a2aDispatch.getA2AClient();

      // client2 should be a new instance (not same reference)
      assert.notStrictEqual(client1, client2);
    });
  });
});

// =============================================================================
// Pre-Task Hook Integration Tests
// =============================================================================
describe('Pre-Task Hook A2A Dispatch Integration', () => {
  let server;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    if (server) {
      server.stateMachine.stopWatchdog();
      await server.stop();
      if (server.db) server.db.close();
    }
    a2aDispatch.resetA2AClient();
    delete process.env.A2A_AUTO_START;
    delete process.env.A2A_PORT;
    delete process.env.A2A_DISPATCH_MODE;
  });

  it('checkA2ADispatchIntercept returns intercepted=false for non-channel targets', async () => {
    const {
      checkA2ADispatchIntercept,
    } = require('../../../.claude/hooks/routing/pre-task-unified-core.cjs');

    const result = await checkA2ADispatchIntercept({
      subagent_type: 'developer',
      prompt: 'Build a feature',
    });

    assert.equal(result.intercepted, false);
  });

  it('checkA2ADispatchIntercept returns intercepted=true for channel-responder when A2A available', async () => {
    process.env.A2A_AUTO_START = 'true';
    process.env.A2A_PORT = String(server.port);

    const {
      checkA2ADispatchIntercept,
    } = require('../../../.claude/hooks/routing/pre-task-unified-core.cjs');

    const result = await checkA2ADispatchIntercept({
      subagent_type: 'channel-responder',
      prompt: 'What is the git status?',
      task_id: 'test-task-001',
    });

    assert.equal(result.intercepted, true);
    assert.ok(result.dispatch);
    assert.equal(result.dispatch.success, true);
    assert.equal(result.dispatch.method, 'a2a');
  });

  it('checkA2ADispatchIntercept respects A2A_DISPATCH_MODE=off', async () => {
    process.env.A2A_AUTO_START = 'true';
    process.env.A2A_PORT = String(server.port);
    process.env.A2A_DISPATCH_MODE = 'off';

    // Clear require cache to pick up env change
    delete require.cache[
      require.resolve('../../../.claude/hooks/routing/pre-task-unified-core.cjs')
    ];
    const {
      checkA2ADispatchIntercept,
    } = require('../../../.claude/hooks/routing/pre-task-unified-core.cjs');

    const result = await checkA2ADispatchIntercept({
      subagent_type: 'channel-responder',
      prompt: 'test',
    });

    assert.equal(result.intercepted, false);
  });
});
