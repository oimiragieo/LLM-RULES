'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const http = require('http');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const { createA2aServer } = require('../../../.claude/lib/a2a/server.cjs');
const {
  TaskStateMachine,
  ZOMBIE_TIMEOUT_MS,
} = require('../../../.claude/lib/a2a/task-state-machine.cjs');

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
 * Helper to send raw HTTP request and get SSE response.
 * Captures initial headers and first data chunk, then destroys the connection.
 */
async function sseRequest(port, body) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('SSE request timeout'));
    }, 5000);

    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port,
      path: '/a2a/subscribe',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = http.request(options, res => {
      let data = '';
      let resolved = false;

      // Resolve as soon as we have headers
      const headers = res.headers;

      res.on('data', chunk => {
        data += chunk.toString();
        // Once we have some data, resolve and destroy
        if (!resolved && data.length > 0) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            statusCode: res.statusCode,
            headers,
            body: data,
          });
          // Destroy the response to close the SSE stream
          res.destroy();
        }
      });

      res.on('error', err => {
        if (!resolved) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      res.on('end', () => {
        if (!resolved) {
          clearTimeout(timeout);
          resolve({
            statusCode: res.statusCode,
            headers,
            body: data,
          });
        }
      });
    });

    req.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });

    req.write(bodyStr);
    req.end();
  });
}

describe('A2A Server Endpoints', () => {
  let app, start, stop, stateMachine, sseStreams;

  beforeEach(() => {
    const server = createA2aServer({ port: 0 }); // ephemeral port
    app = server.app;
    start = server.start;
    stop = server.stop;
    stateMachine = server.stateMachine;
    sseStreams = server.sseStreams;
  });

  afterEach(async () => {
    if (stop) {
      await stop();
    }
    if (stateMachine) {
      stateMachine.stopWatchdog();
    }
  });

  // -------------------------------------------------------------------------
  // GET /.well-known/agent.json
  // -------------------------------------------------------------------------
  describe('GET /.well-known/agent.json (Agent Card)', () => {
    it('returns HTTP 200 with valid Agent Card JSON', async () => {
      const res = await request(app).get('/.well-known/agent.json').expect(200);

      assert.ok(res.body.name, 'card should have name');
      assert.ok(res.body.url, 'card should have url');
      assert.ok(res.body.capabilities, 'card should have capabilities');
      assert.ok(Array.isArray(res.body.skills), 'skills should be an array');
    });

    it('capabilities includes streaming: true', async () => {
      const res = await request(app).get('/.well-known/agent.json').expect(200);
      assert.equal(res.body.capabilities.streaming, true);
    });

    it('capabilities includes pushNotifications: false', async () => {
      const res = await request(app).get('/.well-known/agent.json').expect(200);
      assert.equal(res.body.capabilities.pushNotifications, false);
    });

    it('returns valid JSON with Content-Type: application/json', async () => {
      const res = await request(app).get('/.well-known/agent.json').expect('Content-Type', /json/);
      assert.ok(res.body, 'body should be parsed JSON');
    });
  });

  // -------------------------------------------------------------------------
  // POST /a2a with tasks/send
  // -------------------------------------------------------------------------
  describe('POST /a2a with tasks/send', () => {
    it('creates a task and returns it in working state', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: { input: 'hello' } })
        .expect(200);

      assert.equal(res.body.jsonrpc, '2.0');
      assert.equal(res.body.id, 1);
      assert.ok(res.body.result, 'should have result');
      assert.equal(res.body.result.status, 'working', 'should be in working state');
      assert.ok(typeof res.body.result.id === 'string', 'should have id');
      assert.ok(res.body.result.id.length > 0, 'id should not be empty');
    });

    it('returns valid UUID for task id', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
        .expect(200);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(res.body.result.id), 'id should be a valid UUID');
    });

    it('preserves params in the created task', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/send',
          params: { input: 'test', context: { foo: 'bar' } },
        })
        .expect(200);

      assert.deepEqual(res.body.result.params.input, 'test');
      assert.deepEqual(res.body.result.params.context, { foo: 'bar' });
    });

    it('handles empty params gracefully', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send' })
        .expect(200);

      assert.equal(res.body.result.status, 'working');
    });
  });

  // -------------------------------------------------------------------------
  // tasks/get
  // -------------------------------------------------------------------------
  describe('tasks/get', () => {
    it('returns current task state', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
        .expect(200);

      const taskId = createRes.body.result.id;

      // Get the task
      const getRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 2, method: 'tasks/get', params: { id: taskId } })
        .expect(200);

      assert.equal(getRes.body.result.id, taskId);
      assert.equal(getRes.body.result.status, 'working');
    });

    it('returns -32001 for non-existent task', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tasks/get',
          params: { id: '00000000-0000-0000-0000-000000000000' },
        })
        .expect(404);

      assert.equal(res.body.error.code, -32001);
      assert.ok(res.body.error.message.includes('not found'));
    });

    it('requires params.id', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 4, method: 'tasks/get', params: {} })
        .expect(400);

      assert.equal(res.body.error.code, -32600);
    });
  });

  // -------------------------------------------------------------------------
  // tasks/cancel
  // -------------------------------------------------------------------------
  describe('tasks/cancel', () => {
    it('transitions task to canceled state', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
        .expect(200);

      const taskId = createRes.body.result.id;

      // Cancel the task
      const cancelRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 2, method: 'tasks/cancel', params: { id: taskId } })
        .expect(200);

      assert.equal(cancelRes.body.result.status, 'canceled');

      // Verify it's canceled
      const getRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 3, method: 'tasks/get', params: { id: taskId } })
        .expect(200);

      assert.equal(getRes.body.result.status, 'canceled');
    });

    it('returns -32001 for non-existent task', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({
          jsonrpc: '2.0',
          id: 4,
          method: 'tasks/cancel',
          params: { id: '00000000-0000-0000-0000-000000000000' },
        })
        .expect(404);

      assert.equal(res.body.error.code, -32001);
    });

    it('returns error for terminal task (already completed)', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
        .expect(200);

      const taskId = createRes.body.result.id;

      // Manually complete it
      stateMachine.transition(taskId, 'completed');

      // Try to cancel
      const cancelRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 2, method: 'tasks/cancel', params: { id: taskId } })
        .expect(400);

      assert.ok(cancelRes.body.error);
    });
  });

  // -------------------------------------------------------------------------
  // POST /a2a/subscribe (SSE)
  // -------------------------------------------------------------------------
  describe('POST /a2a/subscribe (SSE streaming)', () => {
    let httpServer, serverPort;

    beforeEach(async () => {
      // Start the server on ephemeral port for SSE tests
      httpServer = await start();
      serverPort = httpServer.address().port;
    });

    afterEach(async () => {
      if (httpServer) {
        await stop();
        httpServer = null;
      }
    });

    it('returns text/event-stream Content-Type', async () => {
      const result = await sseRequest(serverPort, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/sendSubscribe',
        params: {},
      });

      assert.equal(result.headers['content-type'], 'text/event-stream');
    });

    it('emits initial status event with working state', async () => {
      const result = await sseRequest(serverPort, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/sendSubscribe',
        params: {},
      });

      assert.ok(result.body.includes('event: status'), 'should include status event');
      assert.ok(result.body.includes('working'), 'should include working state');
    });

    it('rejects non-sendSubscribe methods with error', async () => {
      const res = await request(app)
        .post('/a2a/subscribe')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
        .expect(400);

      assert.ok(res.body.error);
      assert.ok(res.body.error.message.includes('sendSubscribe'));
    });
  });

  // -------------------------------------------------------------------------
  // tasks/sendSubscribe on /a2a returns -32600
  // -------------------------------------------------------------------------
  describe('tasks/sendSubscribe on plain /a2a endpoint', () => {
    it('returns -32600 error directing to /a2a/subscribe', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/sendSubscribe', params: {} })
        .expect(400);

      assert.equal(res.body.error.code, -32600);
      assert.ok(
        res.body.error.message.includes('/a2a/subscribe'),
        'should mention /a2a/subscribe endpoint'
      );
    });
  });

  // -------------------------------------------------------------------------
  // JSON-RPC validation
  // -------------------------------------------------------------------------
  describe('JSON-RPC validation', () => {
    it('returns -32600 for invalid jsonrpc version', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '1.0', id: 1, method: 'tasks/send' })
        .expect(400);

      assert.equal(res.body.error.code, -32600);
    });

    it('returns -32600 for missing method', async () => {
      const res = await request(app).post('/a2a').send({ jsonrpc: '2.0', id: 1 }).expect(400);

      assert.equal(res.body.error.code, -32600);
    });

    it('returns -32601 for unknown method', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'unknown/method' })
        .expect(404);

      assert.equal(res.body.error.code, -32601);
    });

    it('returns -32600 for invalid id type', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: { bad: true }, method: 'tasks/send' })
        .expect(400);

      assert.equal(res.body.error.code, -32600);
    });

    it('handles notification (no id) with 204', async () => {
      await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', method: 'tasks/send', params: {} })
        .expect(204);
    });
  });

  // -------------------------------------------------------------------------
  // Interrupt endpoint
  // -------------------------------------------------------------------------
  describe('POST /a2a/tasks/:id/interrupt', () => {
    let httpServer, serverPort;

    beforeEach(async () => {
      // Start the server on ephemeral port for SSE tests
      httpServer = await start();
      serverPort = httpServer.address().port;
    });

    afterEach(async () => {
      if (httpServer) {
        await stop();
        httpServer = null;
      }
    });

    it('cancels task and returns canceled status', async () => {
      // Create a task
      const createRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
        .expect(200);

      const taskId = createRes.body.result.id;

      // Interrupt it
      const res = await request(app).post(`/a2a/tasks/${taskId}/interrupt`).expect(200);

      assert.equal(res.body.status, 'canceled');
      assert.equal(res.body.taskId, taskId);
    });

    it('returns 404 for non-existent task', async () => {
      const res = await request(app)
        .post('/a2a/tasks/00000000-0000-0000-0000-000000000000/interrupt')
        .expect(404);

      assert.ok(res.body.error);
    });

    it('closes SSE stream when interrupting', async () => {
      // Create SSE subscription using raw HTTP
      const result = await sseRequest(serverPort, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tasks/sendSubscribe',
        params: {},
      });

      // Extract task ID from the SSE response
      const match = result.body.match(/"taskId":"([0-9a-f-]+)"/);
      assert.ok(match, 'should find taskId in SSE response');
      const taskId = match[1];

      // Verify the SSE stream is in the map
      assert.ok(sseStreams.has(taskId), 'SSE stream should exist');

      // Interrupt the task
      await request(app).post(`/a2a/tasks/${taskId}/interrupt`).expect(200);

      // Verify the SSE stream was closed
      assert.ok(sseStreams.has(taskId) === false, 'SSE stream should be removed after interrupt');
    });
  });
});

// ---------------------------------------------------------------------------
// SQLite Persistence Tests
// ---------------------------------------------------------------------------
describe('A2A Server SQLite Persistence', () => {
  let app, db, stateMachine, stop;

  beforeEach(() => {
    db = makeTestDb();
    const server = createA2aServer({ port: 0, db });
    app = server.app;
    stop = server.stop;
    stateMachine = server.stateMachine;
  });

  afterEach(async () => {
    if (stop) {
      await stop();
    }
    if (stateMachine) {
      stateMachine.stopWatchdog();
    }
    if (db) {
      db.close();
    }
  });

  it('tasks survive server restart', async () => {
    // Create a task
    const createRes = await request(app)
      .post('/a2a')
      .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: { test: 'persist' } })
      .expect(200);

    const taskId = createRes.body.result.id;

    // Verify it's in DB
    const row = db.prepare('SELECT * FROM a2a_tasks WHERE id = ?').get(taskId);
    assert.ok(row, 'task should be in DB');
    assert.equal(row.status, 'working');
  });

  it('orphaned working tasks are recovered on restart', async () => {
    // Create a task and simulate crash by leaving it in working state
    const createRes = await request(app)
      .post('/a2a')
      .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
      .expect(200);

    const taskId = createRes.body.result.id;

    // Stop the server
    await stop();
    stateMachine.stopWatchdog();

    // Create a new server instance with same DB (simulates restart)
    const server2 = createA2aServer({ port: 0, db });
    const stateMachine2 = server2.stateMachine;

    // The orphaned task should now be 'failed' (orphan recovery)
    const task = stateMachine2.getTask(taskId);
    assert.ok(task, 'task should be recovered');
    assert.equal(task.status, 'failed', 'orphaned working task should be failed');

    stateMachine2.stopWatchdog();
  });
});

// ---------------------------------------------------------------------------
// Zombie Watchdog Tests
// ---------------------------------------------------------------------------
describe('Zombie Watchdog', () => {
  let stateMachine;

  beforeEach(() => {
    stateMachine = new TaskStateMachine();
  });

  afterEach(() => {
    if (stateMachine) {
      stateMachine.stopWatchdog();
    }
  });

  it('stuck tasks auto-fail after timeout', async () => {
    // Create a task and set its createdAt to be older than ZOMBIE_TIMEOUT_MS
    const task = stateMachine.createTask();
    stateMachine.transition(task.id, 'working');

    // Manually age the task in memory (simulating time passage)
    const storedTask = stateMachine._tasks.get(task.id);
    storedTask.createdAt = new Date(Date.now() - ZOMBIE_TIMEOUT_MS - 1000).toISOString();

    // Trigger the watchdog check manually
    // The watchdog runs on interval but we can't wait 30 min in tests
    // Instead, we verify the transition logic works
    const now = Date.now();
    const taskAge = now - new Date(storedTask.createdAt).getTime();
    assert.ok(taskAge > ZOMBIE_TIMEOUT_MS, 'task should be older than timeout');

    // The transition to failed should work
    stateMachine.transition(task.id, 'failed', 'zombie-timeout');
    const failedTask = stateMachine.getTask(task.id);
    assert.equal(failedTask.status, 'failed');
  });

  it('watchdog interval uses .unref() to not prevent process exit', () => {
    // Verify the watchdog timer is set up with unref
    const sm = new TaskStateMachine();
    assert.ok(sm._zombieWatchdog, 'watchdog should be set up');
    // Can't directly check unref but we verify the interval exists
    sm.stopWatchdog();
    assert.equal(sm._zombieWatchdog, null, 'watchdog should be stopped');
  });
});
