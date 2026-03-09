'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const express = require('express');

const { TaskStateMachine } = require('../../../.claude/lib/a2a/task-state-machine.cjs');
const { createJsonRpcHandler } = require('../../../.claude/lib/a2a/jsonrpc-handler.cjs');

/**
 * Build a minimal Express app wired with the JSON-RPC handler.
 * The app never calls app.listen() — supertest handles that.
 */
function buildApp() {
  const app = express();
  const stateMachine = new TaskStateMachine();
  const sseStreams = new Map();

  app.use(express.json());
  app.post('/a2a', createJsonRpcHandler(stateMachine, sseStreams));

  return { app, stateMachine };
}

describe('JSON-RPC handler', () => {
  let app;

  beforeEach(() => {
    ({ app } = buildApp());
  });

  // ── tasks/send ─────────────────────────────────────────────────────────────
  describe('tasks/send', () => {
    it('creates a task and returns it in working state', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: { input: 'hello' } })
        .expect(200);

      assert.equal(res.body.jsonrpc, '2.0');
      assert.equal(res.body.id, 1);
      assert.ok(res.body.result);
      assert.equal(res.body.result.status, 'working');
      assert.ok(typeof res.body.result.id === 'string');
    });
  });

  // ── tasks/get ──────────────────────────────────────────────────────────────
  describe('tasks/get', () => {
    it('returns an existing task by id', async () => {
      // Create a task first
      const createRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
        .expect(200);

      const taskId = createRes.body.result.id;

      const getRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 2, method: 'tasks/get', params: { id: taskId } })
        .expect(200);

      assert.equal(getRes.body.result.id, taskId);
      assert.equal(getRes.body.result.status, 'working');
    });

    it('returns -32001 for an unknown task id', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 3, method: 'tasks/get', params: { id: 'no-such-task' } })
        .expect(404);

      assert.equal(res.body.error.code, -32001);
      assert.ok(res.body.error.message.includes('not found'));
    });
  });

  // ── tasks/cancel ──────────────────────────────────────────────────────────
  describe('tasks/cancel', () => {
    it('cancels an existing task', async () => {
      const createRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 1, method: 'tasks/send', params: {} })
        .expect(200);

      const taskId = createRes.body.result.id;

      const cancelRes = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 2, method: 'tasks/cancel', params: { id: taskId } })
        .expect(200);

      assert.equal(cancelRes.body.result.status, 'canceled');
    });

    it('returns -32001 for an unknown task id', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 4, method: 'tasks/cancel', params: { id: 'no-such-task' } })
        .expect(404);

      assert.equal(res.body.error.code, -32001);
    });
  });

  // ── Method not found ───────────────────────────────────────────────────────
  describe('unknown method', () => {
    it('returns -32601 for an unrecognized method', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: 5, method: 'unknown/method', params: {} })
        .expect(404);

      assert.equal(res.body.error.code, -32601);
    });
  });

  // ── Invalid request ────────────────────────────────────────────────────────
  describe('invalid request', () => {
    it('returns -32600 when jsonrpc field is missing or wrong', async () => {
      const res = await request(app).post('/a2a').send({ id: 1, method: 'tasks/send' }).expect(400);

      assert.equal(res.body.error.code, -32600);
    });

    it('returns -32600 when jsonrpc version is wrong', async () => {
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '1.0', id: 1, method: 'tasks/send' })
        .expect(400);

      assert.equal(res.body.error.code, -32600);
    });

    it('returns -32600 when method is missing', async () => {
      const res = await request(app).post('/a2a').send({ jsonrpc: '2.0', id: 1 }).expect(400);

      assert.equal(res.body.error.code, -32600);
    });

    it('treats missing id as JSON-RPC 2.0 notification and returns 204', async () => {
      // Per JSON-RPC 2.0 spec: omitted id = notification (fire-and-forget).
      // Notifications must be processed but return no response body.
      await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', method: 'tasks/send', params: {} })
        .expect(204);
    });

    it('returns -32600 when id has an invalid type', async () => {
      // Present id with invalid type (object) must still be rejected
      const res = await request(app)
        .post('/a2a')
        .send({ jsonrpc: '2.0', id: { bad: true }, method: 'tasks/send' })
        .expect(400);

      assert.equal(res.body.error.code, -32600);
    });
  });
});
