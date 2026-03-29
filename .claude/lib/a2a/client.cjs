#!/usr/bin/env node
'use strict';

/**
 * A2A Client Library
 * ==================
 * HTTP client for A2A (Agent-to-Agent) protocol communication.
 *
 * Uses Node.js built-in http/https modules (no external dependencies).
 *
 * Methods:
 *   discover()         — GET /.well-known/agent.json
 *   sendTask()         — POST /a2a with tasks/send
 *   getTask()          — POST /a2a with tasks/get
 *   cancelTask()       — POST /a2a with tasks/cancel
 *   sendSubscribe()    — POST /a2a/subscribe for SSE streaming
 *
 * Usage:
 *   const { A2AClient } = require('./client.cjs');
 *   const client = new A2AClient({ baseUrl: 'http://localhost:3100' });
 *   const card = await client.discover();
 *   const task = await client.sendTask({ input: 'hello' });
 */

const http = require('http');
const https = require('https');

const JSON_RPC_VERSION = '2.0';

// JSON-RPC error codes (matching server)
const ERR_PARSE_ERROR = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_TASK_NOT_FOUND = -32001;

/**
 * A2A Client for HTTP-based agent-to-agent communication.
 */
class A2AClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl - Base URL of the A2A server (e.g., 'http://localhost:3100')
   * @param {number} [options.timeout=30000] - Request timeout in milliseconds
   * @param {Record<string, string>} [options.headers] - Additional headers to send
   */
  constructor(options) {
    if (!options || !options.baseUrl) {
      throw new Error('baseUrl is required');
    }

    this._baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl.slice(0, -1) : options.baseUrl;
    this._timeout = options.timeout || 30000;
    this._headers = options.headers || {};
    this._requestId = 0;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Discover the remote agent's Agent Card.
   * GET /.well-known/agent.json
   * @returns {Promise<object>} Agent Card object
   */
  async discover() {
    const url = `${this._baseUrl}/.well-known/agent.json`;
    const response = await this._httpGet(url);
    return response.body;
  }

  /**
   * Send a task to the remote agent.
   * POST /a2a with tasks/send method.
   * @param {object} params - Task parameters (input, context, etc.)
   * @returns {Promise<object>} Task object with id and status 'working'
   */
  async sendTask(params = {}) {
    const request = this._makeJsonRpcRequest('tasks/send', params);
    const response = await this._httpPost(`${this._baseUrl}/a2a`, request);
    this._assertSuccess(response);
    return response.body.result;
  }

  /**
   * Get the current state of a task.
   * POST /a2a with tasks/get method.
   * @param {string} taskId - Task ID to query
   * @returns {Promise<object|null>} Task object or null if not found
   */
  async getTask(taskId) {
    const request = this._makeJsonRpcRequest('tasks/get', { id: taskId });
    const response = await this._httpPost(`${this._baseUrl}/a2a`, request);

    // Return null for task not found (don't throw)
    if (response.body.error && response.body.error.code === ERR_TASK_NOT_FOUND) {
      return null;
    }

    this._assertSuccess(response);
    return response.body.result;
  }

  /**
   * Cancel a remote task.
   * POST /a2a with tasks/cancel method.
   * @param {string} taskId - Task ID to cancel
   * @returns {Promise<object>} Updated task object with status 'canceled'
   */
  async cancelTask(taskId) {
    const request = this._makeJsonRpcRequest('tasks/cancel', { id: taskId });
    const response = await this._httpPost(`${this._baseUrl}/a2a`, request);

    // Throw for task not found
    if (response.body.error && response.body.error.code === ERR_TASK_NOT_FOUND) {
      const err = new Error(response.body.error.message);
      err.code = ERR_TASK_NOT_FOUND;
      throw err;
    }

    this._assertSuccess(response);
    return response.body.result;
  }

  /**
   * Subscribe to task updates via Server-Sent Events.
   * POST /a2a/subscribe with tasks/sendSubscribe method.
   *
   * Returns an EventEmitter-like object with:
   *   - on('status', callback) — status updates
   *   - on('error', callback) — error events
   *   - on('end', callback) — stream closed
   *   - close() — close the stream
   *
   * @param {object} params - Task parameters
   * @returns {Promise<{taskId: string, stream: SSEStreamEmitter}>}
   */
  async sendSubscribe(params = {}) {
    const url = `${this._baseUrl}/a2a/subscribe`;
    const request = this._makeJsonRpcRequest('tasks/sendSubscribe', params);

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const body = JSON.stringify(request);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Content-Length': Buffer.byteLength(body),
          ...this._headers,
        },
        timeout: this._timeout,
      };

      const req = lib.request(options, res => {
        if (res.statusCode !== 200) {
          // Read error response
          let errorBody = '';
          res.on('data', chunk => (errorBody += chunk));
          res.on('end', () => {
            let errorMsg = `HTTP ${res.statusCode}`;
            try {
              const parsed = JSON.parse(errorBody);
              if (parsed.error) {
                errorMsg = parsed.error.message;
              }
            } catch (_) {
              // ignore
            }
            reject(new Error(errorMsg));
          });
          return;
        }

        // Create SSE emitter
        const emitter = new SSEStreamEmitter(res);

        // Buffer for incomplete lines
        let buffer = '';
        let currentEvent = '';
        let currentData = '';

        res.on('data', chunk => {
          buffer += chunk.toString();

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6).trim();
            } else if (line === '' && currentEvent && currentData) {
              // Empty line = event complete
              try {
                const parsedData = JSON.parse(currentData);
                emitter._emit(currentEvent, parsedData);
              } catch (_) {
                emitter._emit(currentEvent, currentData);
              }
              currentEvent = '';
              currentData = '';
            }
          }
        });

        res.on('end', () => {
          emitter._emit('end');
        });

        res.on('error', err => {
          emitter._emit('error', err);
        });

        // Wait for the first status event to get taskId
        // The server sends initial status event immediately
        let taskId = null;
        const onFirstStatus = data => {
          if (data.taskId) {
            taskId = data.taskId;
            emitter.off('status', onFirstStatus);
            resolve({ taskId, stream: emitter });
          }
        };
        emitter.on('status', onFirstStatus);

        // Timeout if no initial event
        setTimeout(() => {
          if (!taskId) {
            emitter.close();
            reject(new Error('Timeout waiting for initial SSE event'));
          }
        }, 5000);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Create a JSON-RPC 2.0 request object.
   * @param {string} method - Method name
   * @param {object} params - Method parameters
   * @returns {object} JSON-RPC request
   */
  _makeJsonRpcRequest(method, params) {
    return {
      jsonrpc: JSON_RPC_VERSION,
      id: ++this._requestId,
      method,
      params,
    };
  }

  /**
   * Assert that a JSON-RPC response is successful.
   * @param {{body: object}} response
   * @throws {Error} If response contains an error
   */
  _assertSuccess(response) {
    if (response.body.error) {
      const err = new Error(response.body.error.message || 'Unknown JSON-RPC error');
      err.code = response.body.error.code;
      throw err;
    }
    if (!response.body.result) {
      throw new Error('JSON-RPC response missing result');
    }
  }

  /**
   * Perform an HTTP GET request.
   * @param {string} url
   * @returns {Promise<{statusCode: number, headers: object, body: object}>}
   */
  async _httpGet(url) {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...this._headers,
        },
        timeout: this._timeout,
      };

      const req = lib.request(options, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          let parsedBody;
          try {
            parsedBody = JSON.parse(body);
          } catch (_) {
            parsedBody = body;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody,
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Perform an HTTP POST request with JSON body.
   * @param {string} url
   * @param {object} body - Request body (will be JSON-serialized)
   * @returns {Promise<{statusCode: number, headers: object, body: object}>}
   */
  async _httpPost(url, body) {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const bodyStr = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...this._headers,
        },
        timeout: this._timeout,
      };

      const req = lib.request(options, res => {
        let responseBody = '';
        res.on('data', chunk => (responseBody += chunk));
        res.on('end', () => {
          let parsedBody;
          try {
            parsedBody = JSON.parse(responseBody);
          } catch (_) {
            parsedBody = responseBody;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody,
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(bodyStr);
      req.end();
    });
  }
}

/**
 * SSE Stream Emitter for handling Server-Sent Events.
 * Provides EventEmitter-like interface for SSE events.
 */
class SSEStreamEmitter {
  /**
   * @param {http.IncomingMessage} response - HTTP response object
   */
  constructor(response) {
    this._response = response;
    this._listeners = new Map();
    this._closed = false;
  }

  /**
   * Register an event listener.
   * @param {string} event - Event name ('status', 'error', 'end')
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
  }

  /**
   * Remove an event listener.
   * @param {string} event - Event name
   * @param {Function} callback - Callback to remove
   */
  off(event, callback) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Close the SSE stream.
   */
  close() {
    if (this._closed) return;
    this._closed = true;
    this._response.destroy();
  }

  /**
   * Whether the stream is closed.
   * @returns {boolean}
   */
  get isClosed() {
    return this._closed;
  }

  /**
   * Emit an event to registered listeners (internal).
   * @param {string} event
   * @param {*} data
   */
  _emit(event, data) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(data);
        } catch (_) {
          // ignore callback errors
        }
      }
    }
  }
}

module.exports = {
  A2AClient,
  SSEStreamEmitter,
  ERR_PARSE_ERROR,
  ERR_INVALID_REQUEST,
  ERR_METHOD_NOT_FOUND,
  ERR_TASK_NOT_FOUND,
};
