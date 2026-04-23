/**
 * MCP Streamable HTTP Transport Client
 *
 * Implements the MCP 2025-03-26 Streamable HTTP transport spec.
 * Replaces the deprecated HTTP+SSE transport (EOL June 2026).
 *
 * Key behaviours:
 *   - POST /mcp for all JSON-RPC requests (initialize + tool calls)
 *   - Session-ID threading via Mcp-Session-Id header (arXiv 2603.24747 trust-pinning)
 *   - Stateless fallback when server does not return Mcp-Session-Id
 *   - BC-1: `transport: "sse"` config rejected at construction time
 *
 * @see https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/
 * @see arXiv 2603.24747 (Formal MCP session semantics)
 *
 * Agent: nodejs-pro | Task: S1 | Session: 2026-04-20
 */
'use strict';

const https = require('https');
const http = require('http');

// ─── BC-1 guard ───────────────────────────────────────────────────────────────

/**
 * Factory: create an MCP transport from a config object.
 * Throws BC-1 error if the config requests the removed SSE transport.
 *
 * @param {object} config
 * @param {string} config.transport - 'streamable-http' (required) | 'sse' (rejected)
 * @param {string} config.endpoint  - MCP server URL
 * @returns {StreamableHttpClient}
 */
function createMcpTransport(config) {
  if (!config || typeof config !== 'object') {
    throw new TypeError('createMcpTransport: config must be an object');
  }

  const transport = config.transport || 'streamable-http';

  if (transport === 'sse') {
    throw new Error(
      'BC-1: SSE transport removed in v3.0.0; run pnpm migrate:2x-to-3 to upgrade your config to streamable-http'
    );
  }

  if (transport !== 'streamable-http') {
    throw new Error(
      `Unknown MCP transport: "${transport}". Only "streamable-http" is supported in v3.0.0.`
    );
  }

  return new StreamableHttpClient(config);
}

// ─── StreamableHttpClient ─────────────────────────────────────────────────────

/**
 * MCP Streamable HTTP client.
 *
 * Options:
 *   endpoint      {string}   - MCP server URL (e.g. "http://localhost:4999/mcp")
 *   timeout       {number}   - Request timeout in ms (default 30_000)
 *   _mockResponder{Function} - Optional test double; receives {url, method, headers, body}
 *                              and returns {status, headers, body}
 *   _warnSink     {Function} - Optional warning sink for tests (default: process.stderr)
 */
class StreamableHttpClient {
  constructor(options = {}) {
    if (!options.endpoint) {
      throw new TypeError('StreamableHttpClient: options.endpoint is required');
    }

    this._endpoint = options.endpoint;
    this._timeout = options.timeout || 30_000;
    this._mockResponder = options._mockResponder || null;
    this._warnSink = options._warnSink || (msg => process.stderr.write(`[mcp-warn] ${msg}\n`));

    this._sessionId = null;
    this._connected = false;
    this._requestIdCounter = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Initialize connection with the MCP server.
   * Sends the MCP `initialize` request and captures the session-ID from the
   * response header if the server provides one.
   *
   * @returns {Promise<{sessionId: string|null, connected: boolean, stateless: boolean}>}
   */
  async connect() {
    const id = this._nextId();
    const response = await this._post({
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'agent-studio', version: '3.0.0' },
      },
    });

    const sessionId = this._extractSessionId(response.headers);

    if (sessionId) {
      this._sessionId = sessionId;
    } else {
      this._warnSink(
        'MCP server did not return Mcp-Session-Id; operating in stateless mode (no session persistence)'
      );
    }

    this._connected = true;

    return {
      sessionId: this._sessionId,
      connected: this._connected,
      stateless: this._sessionId === null,
    };
  }

  /**
   * Call an MCP tool.
   * Threads the session-ID in all outgoing requests (arXiv 2603.24747 trust-pinning).
   *
   * @param {string} toolName
   * @param {object} toolArgs
   * @returns {Promise<object>} JSON-RPC result
   */
  async callTool(toolName, toolArgs) {
    if (!this._connected) {
      throw new Error('StreamableHttpClient: must call connect() before callTool()');
    }

    const id = this._nextId();
    const response = await this._post({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs || {} },
    });

    return response.body;
  }

  /**
   * Get the current session ID (null in stateless mode).
   * @returns {string|null}
   */
  get sessionId() {
    return this._sessionId;
  }

  /**
   * Whether the client has completed the initialize handshake.
   * @returns {boolean}
   */
  get connected() {
    return this._connected;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _nextId() {
    return ++this._requestIdCounter;
  }

  /**
   * Extract Mcp-Session-Id from response headers (case-insensitive).
   * @param {object} headers
   * @returns {string|null}
   */
  _extractSessionId(headers) {
    if (!headers || typeof headers !== 'object') return null;
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'mcp-session-id') {
        return String(value);
      }
    }
    return null;
  }

  /**
   * Send a JSON-RPC request to the MCP endpoint.
   * Injects Mcp-Session-Id header if a session has been established.
   *
   * Uses _mockResponder when provided (for testing); otherwise sends a real HTTP request.
   *
   * @param {object} body  JSON-RPC request object
   * @returns {Promise<{status: number, headers: object, body: object}>}
   */
  async _post(body) {
    const requestHeaders = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };

    // Session-ID threading — arXiv 2603.24747 trust-pinning
    if (this._sessionId) {
      requestHeaders['mcp-session-id'] = this._sessionId;
    }

    const requestDescriptor = {
      url: this._endpoint,
      method: 'POST',
      headers: requestHeaders,
      body,
    };

    if (this._mockResponder) {
      const mockResult = this._mockResponder(requestDescriptor);
      return {
        status: mockResult.status,
        headers: mockResult.headers || {},
        body: mockResult.body,
      };
    }

    return this._httpPost(requestDescriptor);
  }

  /**
   * Real HTTP POST implementation (no external dependencies).
   * @param {object} descriptor
   * @returns {Promise<{status: number, headers: object, body: object}>}
   */
  _httpPost(descriptor) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(descriptor.url);
      const transport = parsed.protocol === 'https:' ? https : http;
      const bodyStr = JSON.stringify(descriptor.body);

      const reqHeaders = {
        ...descriptor.headers,
        'content-length': Buffer.byteLength(bodyStr),
      };

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method: 'POST',
        headers: reqHeaders,
      };

      const req = transport.request(options, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            const parsedBody = JSON.parse(raw);
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: parsedBody,
            });
          } catch (parseErr) {
            reject(new Error(`MCP response parse error: ${parseErr.message}`));
          }
        });
      });

      req.setTimeout(this._timeout, () => {
        req.destroy();
        reject(new Error(`MCP request timed out after ${this._timeout}ms`));
      });

      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  StreamableHttpClient,
  createMcpTransport,
};
