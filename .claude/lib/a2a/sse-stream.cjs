#!/usr/bin/env node
'use strict';

/**
 * SSE Stream Helper
 * =================
 * Wraps an Express response object to produce Server-Sent Events.
 *
 * Usage:
 *   const stream = new SseStream(res);
 *   stream.write('status', { status: 'working' });
 *   stream.close();
 */

/**
 * Set required SSE headers on an Express response.
 * Call this before writing any SSE data.
 * @param {import('express').Response} res
 */
function setupSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Disable buffering in nginx/proxies
  res.setHeader('X-Accel-Buffering', 'no');
  // Flush headers immediately
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

class SseStream {
  /**
   * @param {import('express').Response} res - Express response object
   */
  constructor(res) {
    this._res = res;
    this._closed = false;
    setupSseHeaders(res);
  }

  /**
   * Write an SSE event to the response.
   * @param {string} event - Event name (e.g. 'status', 'error')
   * @param {object|string} data - Data payload (serialized to JSON if object)
   */
  write(event, data) {
    if (this._closed) return;
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this._res.write(`event: ${event}\ndata: ${payload}\n\n`);
    // Flush if the underlying socket supports it
    if (typeof this._res.flush === 'function') {
      this._res.flush();
    }
  }

  /**
   * Close the SSE stream by ending the response.
   */
  close() {
    if (this._closed) return;
    this._closed = true;
    this._res.end();
  }

  /**
   * Whether the stream has been closed.
   * @returns {boolean}
   */
  get isClosed() {
    return this._closed;
  }
}

module.exports = { SseStream, setupSseHeaders };
