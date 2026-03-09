#!/usr/bin/env node
'use strict';

/**
 * A2A Express Server
 * ==================
 * Creates and manages the A2A-compatible HTTP server.
 *
 * Routes:
 *   GET  /.well-known/agent.json   — Agent Card discovery
 *   POST /a2a                      — JSON-RPC 2.0 (non-SSE methods)
 *   POST /a2a/subscribe            — JSON-RPC tasks/sendSubscribe with SSE
 *   POST /a2a/tasks/:id/interrupt  — Cancel task + close its SSE stream
 *
 * Usage:
 *   const { createA2aServer } = require('.claude/lib/a2a/server.cjs');
 *   const { app, start, stop } = createA2aServer({ port: 3100 });
 *   start();
 */

const express = require('express');
const { TaskStateMachine } = require('./task-state-machine.cjs');
const { SseStream } = require('./sse-stream.cjs');
const {
  createJsonRpcHandler,
  ERR_INVALID_REQUEST,
  ERR_TASK_NOT_FOUND,
} = require('./jsonrpc-handler.cjs');
const { getAgentCardRouter } = require('./agent-card.cjs');
const { enqueueMessage } = require('../db/queue-operations.cjs');
const { emitNewMessage } = require('../workers/dispatcher.cjs');

const JSON_RPC_VERSION = '2.0';

/**
 * Create an A2A HTTP server.
 *
 * @param {object} [options]
 * @param {number} [options.port=3100]
 * @param {object} [options.db] - SQLite db instance (optional; enables queue integration when provided)
 * @param {object} [options.pool] - WorkerPool instance (optional; used alongside db)
 * @returns {{ app: import('express').Application, start: () => void, stop: () => Promise<void> }}
 */
function createA2aServer({ port = 3100, db, pool } = {}) {
  const app = express();

  // Shared state
  const stateMachine = new TaskStateMachine();
  /** @type {Map<string, SseStream>} */
  const sseStreams = new Map();

  // ── Middleware ──────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));

  // ── Agent Card ──────────────────────────────────────────────────────────────
  app.use(getAgentCardRouter());

  // ── JSON-RPC (non-SSE) ──────────────────────────────────────────────────────
  const jsonRpcHandler = createJsonRpcHandler(stateMachine, sseStreams);
  app.post('/a2a', jsonRpcHandler);

  // ── SSE Subscribe ───────────────────────────────────────────────────────────
  app.post('/a2a/subscribe', (req, res) => {
    const body = req.body;

    // Basic JSON-RPC validation
    if (!body || body.jsonrpc !== JSON_RPC_VERSION) {
      return res.status(400).json({
        jsonrpc: JSON_RPC_VERSION,
        id: body?.id ?? null,
        error: { code: ERR_INVALID_REQUEST, message: 'Invalid JSON-RPC version' },
      });
    }
    if (body.method !== 'tasks/sendSubscribe') {
      return res.status(400).json({
        jsonrpc: JSON_RPC_VERSION,
        id: body?.id ?? null,
        error: {
          code: ERR_INVALID_REQUEST,
          message: 'Only tasks/sendSubscribe is supported on this endpoint',
        },
      });
    }
    if (
      body.id === undefined ||
      (body.id !== null && typeof body.id !== 'string' && typeof body.id !== 'number')
    ) {
      return res.status(400).json({
        jsonrpc: JSON_RPC_VERSION,
        id: null,
        error: { code: ERR_INVALID_REQUEST, message: 'Invalid or missing id' },
      });
    }

    // Create task and open SSE stream
    const params = body.params || {};
    const task = stateMachine.createTask(params);

    // If db and pool are provided, enqueue the task params for async worker processing.
    // Do this BEFORE opening the SSE stream so we can fail cleanly if enqueue fails.
    if (db && pool) {
      try {
        enqueueMessage(db, { chatId: 'a2a', userId: 'a2a', text: JSON.stringify(params) });
        // Wake the dispatcher immediately; without this the pool polls every 15 seconds
        emitNewMessage(task.id);
      } catch (_enqErr) {
        process.stderr.write(`[A2A] enqueueMessage error: ${_enqErr.message}\n`);
        return res.status(500).json({
          jsonrpc: JSON_RPC_VERSION,
          id: body.id ?? null,
          error: { code: -32603, message: `Failed to queue task: ${_enqErr.message}` },
        });
      }
    }

    // Set up SSE stream before transitioning so the first event is captured
    const stream = new SseStream(res);
    sseStreams.set(task.id, stream);

    // Clean up on client disconnect
    res.on('close', () => {
      sseStreams.delete(task.id);
    });

    // Transition to working and emit initial status event
    try {
      stateMachine.transition(task.id, 'working');
      stream.write('status', { taskId: task.id, status: 'working' });
    } catch (e) {
      stream.write('error', { taskId: task.id, message: e.message });
      stream.close();
      sseStreams.delete(task.id);
    }

    // Response stays open for async updates; agent will push events later.
  });

  // ── Interrupt (cancel) ──────────────────────────────────────────────────────
  app.post('/a2a/tasks/:id/interrupt', (req, res) => {
    const { id } = req.params;

    try {
      stateMachine.cancelTask(id);
    } catch (e) {
      if (e.message && e.message.includes('not found')) {
        return res.status(404).json({ error: { code: ERR_TASK_NOT_FOUND, message: e.message } });
      }
      return res.status(400).json({ error: { code: ERR_INVALID_REQUEST, message: e.message } });
    }

    // Send canceled event on open SSE stream and close it
    const stream = sseStreams.get(id);
    if (stream && !stream.isClosed) {
      stream.write('status', { taskId: id, status: 'canceled' });
      stream.close();
      sseStreams.delete(id);
    }

    return res.json({ taskId: id, status: 'canceled' });
  });

  // ── Server lifecycle ────────────────────────────────────────────────────────
  let _server = null;

  function start() {
    return new Promise((resolve, reject) => {
      _server = app.listen(port, err => {
        if (err) return reject(err);
        resolve(_server);
      });
    });
  }

  function stop() {
    return new Promise((resolve, reject) => {
      if (!_server) return resolve();
      // Close all open SSE streams
      for (const [taskId, stream] of sseStreams) {
        stream.close();
        sseStreams.delete(taskId);
      }
      _server.close(err => {
        _server = null;
        if (err) return reject(err);
        resolve();
      });
    });
  }

  return { app, start, stop, stateMachine, sseStreams };
}

module.exports = { createA2aServer };
