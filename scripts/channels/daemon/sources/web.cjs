/**
 * web.cjs — Web widget source
 *
 * Receives messages via the daemon's HTTP API (POST /web/message)
 * and streams responses via Server-Sent Events (GET /web/stream/:sessionId).
 *
 * This enables embedding a chat widget on any website that talks to the daemon.
 * No external dependencies — uses the daemon's existing HTTP server.
 */
'use strict';

const crypto = require('crypto');

class WebSource {
  constructor(config, dispatch) {
    this.dispatch = dispatch;
    this.sessions = new Map(); // sessionId → { chatId, responses: [] }
    this.sseClients = new Map(); // sessionId → [res1, res2, ...]
  }

  /**
   * Register HTTP routes on the daemon's server.
   * Called from index.cjs after the HTTP server is created.
   */
  registerRoutes(server, handleRequest) {
    // The daemon's HTTP server passes requests to us via handleRequest callback.
    // We'll be called from the main request handler in index.cjs.
    this._handleRequest = handleRequest;
  }

  /**
   * Handle an HTTP request for the web widget.
   * Returns true if handled, false if not a web route.
   */
  handleHttp(req, res, url) {
    // POST /web/message — receive a message from the widget
    if (url.pathname === '/web/message' && req.method === 'POST') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        try {
          const { text, sessionId: reqSessionId, user } = JSON.parse(body);
          if (!text) throw new Error('text required');

          const sessionId = reqSessionId || crypto.randomUUID();
          if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, { chatId: `web-${sessionId}`, responses: [] });
          }
          const session = this.sessions.get(sessionId);

          // Dispatch as a web message event
          this.dispatch({
            type: 'web.message',
            source: 'web',
            data: {
              chatId: session.chatId,
              messageId: Date.now().toString(),
              user: user || 'web-user',
              userId: sessionId,
              text,
              sessionId,
            },
            timestamp: new Date().toISOString(),
          });

          res.statusCode = 202;
          res.end(JSON.stringify({ accepted: true, sessionId }));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return true;
    }

    // GET /web/stream/:sessionId — SSE stream for responses
    if (url.pathname.startsWith('/web/stream/') && req.method === 'GET') {
      const sessionId = url.pathname.split('/').pop();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Register this SSE client
      if (!this.sseClients.has(sessionId)) this.sseClients.set(sessionId, []);
      this.sseClients.get(sessionId).push(res);

      // Send any buffered responses
      const session = this.sessions.get(sessionId);
      if (session) {
        for (const resp of session.responses) {
          res.write(`data: ${JSON.stringify(resp)}\n\n`);
        }
      }

      req.on('close', () => {
        const clients = this.sseClients.get(sessionId) || [];
        const idx = clients.indexOf(res);
        if (idx >= 0) clients.splice(idx, 1);
      });
      return true;
    }

    return false;
  }

  /**
   * Called by the dispatcher after rendering a response for a web event.
   * Pushes the response to SSE clients and buffers it.
   */
  pushResponse(sessionId, text) {
    const response = { text, timestamp: new Date().toISOString() };

    // Buffer
    const session = this.sessions.get(sessionId);
    if (session) {
      session.responses.push(response);
      if (session.responses.length > 50) session.responses.shift();
    }

    // Push to SSE clients
    const clients = this.sseClients.get(sessionId) || [];
    const data = `data: ${JSON.stringify(response)}\n\n`;
    for (const client of clients) {
      try {
        client.write(data);
      } catch {
        /* ignored */
      }
    }
  }

  start() {
    /* No polling needed — HTTP-driven */
  }
  stop() {
    // Close all SSE connections
    for (const clients of this.sseClients.values()) {
      for (const client of clients) {
        try {
          client.end();
        } catch {
          /* ignored */
        }
      }
    }
    this.sseClients.clear();
  }
}

module.exports = { WebSource };
