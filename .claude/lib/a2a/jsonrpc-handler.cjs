#!/usr/bin/env node
'use strict';

/**
 * JSON-RPC 2.0 Handler
 * ====================
 * Dispatches A2A method calls following the JSON-RPC 2.0 spec.
 *
 * Supported methods:
 *   tasks/send           — create + transition to working
 *   tasks/get            — retrieve task by id
 *   tasks/cancel         — cancel a task
 *   tasks/sendSubscribe  — create + subscribe (SSE, handled in server.cjs)
 *
 * Error codes:
 *   -32700  Parse error
 *   -32600  Invalid request
 *   -32601  Method not found
 *   -32001  Task not found / task-level error
 */

const JSON_RPC_VERSION = '2.0';

// Standard JSON-RPC error codes
const ERR_PARSE_ERROR = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_TASK_NOT_FOUND = -32001;

/**
 * Build a JSON-RPC success response.
 * @param {string|number} id
 * @param {*} result
 */
function ok(id, result) {
  return { jsonrpc: JSON_RPC_VERSION, id, result };
}

/**
 * Build a JSON-RPC error response.
 * @param {string|number|null} id
 * @param {number} code
 * @param {string} message
 */
function err(id, code, message) {
  return { jsonrpc: JSON_RPC_VERSION, id, error: { code, message } };
}

/**
 * Validate that a request object is a valid JSON-RPC 2.0 request.
 * Returns an error response object if invalid, or null if valid.
 * @param {*} body
 * @returns {object|null} error response or null
 */
function validateRequest(body) {
  if (!body || typeof body !== 'object') {
    return err(null, ERR_INVALID_REQUEST, 'Invalid request');
  }
  if (body.jsonrpc !== JSON_RPC_VERSION) {
    return err(body.id ?? null, ERR_INVALID_REQUEST, 'Invalid JSON-RPC version');
  }
  if (typeof body.method !== 'string' || !body.method) {
    return err(body.id ?? null, ERR_INVALID_REQUEST, 'Method must be a non-empty string');
  }
  // id must be present and be string, number, or null
  if (
    body.id === undefined ||
    (body.id !== null && typeof body.id !== 'string' && typeof body.id !== 'number')
  ) {
    return err(null, ERR_INVALID_REQUEST, 'Invalid or missing id');
  }
  return null;
}

/**
 * Create the JSON-RPC Express middleware.
 *
 * @param {import('./task-state-machine.cjs').TaskStateMachine} stateMachine
 * @param {Map<string, import('./sse-stream.cjs').SseStream>} sseStreams
 * @returns {import('express').RequestHandler}
 */
function createJsonRpcHandler(stateMachine, _sseStreams) {
  return function jsonRpcHandler(req, res) {
    const body = req.body;

    // Validate request shape
    const validationError = validateRequest(body);
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { method, id, params = {} } = body;

    try {
      switch (method) {
        case 'tasks/send': {
          const task = stateMachine.createTask(params);
          stateMachine.transition(task.id, 'working');
          const updated = stateMachine.getTask(task.id);
          return res.json(ok(id, updated));
        }

        case 'tasks/get': {
          const taskId = params.id;
          if (!taskId) {
            return res.status(400).json(err(id, ERR_INVALID_REQUEST, 'params.id is required'));
          }
          const task = stateMachine.getTask(taskId);
          if (!task) {
            return res.status(404).json(err(id, ERR_TASK_NOT_FOUND, `Task not found: ${taskId}`));
          }
          return res.json(ok(id, task));
        }

        case 'tasks/cancel': {
          const taskId = params.id;
          if (!taskId) {
            return res.status(400).json(err(id, ERR_INVALID_REQUEST, 'params.id is required'));
          }
          try {
            const task = stateMachine.cancelTask(taskId);
            return res.json(ok(id, task));
          } catch (e) {
            if (e.message && e.message.includes('not found')) {
              return res.status(404).json(err(id, ERR_TASK_NOT_FOUND, e.message));
            }
            return res.status(400).json(err(id, ERR_INVALID_REQUEST, e.message));
          }
        }

        case 'tasks/sendSubscribe': {
          // SSE subscription — handled by the dedicated /a2a/subscribe route in server.cjs.
          // If called on the plain POST /a2a route, return a 400 directing the caller.
          return res
            .status(400)
            .json(
              err(
                id,
                ERR_INVALID_REQUEST,
                'tasks/sendSubscribe requires POST /a2a/subscribe with SSE Accept header'
              )
            );
        }

        default: {
          return res.status(404).json(err(id, ERR_METHOD_NOT_FOUND, `Method not found: ${method}`));
        }
      }
    } catch (e) {
      return res.status(500).json(err(id, -32603, `Internal error: ${e.message}`));
    }
  };
}

module.exports = {
  createJsonRpcHandler,
  validateRequest,
  ERR_PARSE_ERROR,
  ERR_INVALID_REQUEST,
  ERR_METHOD_NOT_FOUND,
  ERR_TASK_NOT_FOUND,
};
