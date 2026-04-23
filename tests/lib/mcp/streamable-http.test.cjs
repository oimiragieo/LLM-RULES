/**
 * S1 — MCP Streamable HTTP Transport Layer Tests
 *
 * VAL assertions per agent-studio-v3.0.0-ecosystem-native-plan-2026-04-22.md S1:
 *   VAL-1: Client establishes stateful session via Streamable HTTP, receives session-ID header
 *   VAL-2: Subsequent tool calls thread the session-ID (trust-pinning, arXiv 2603.24747 gap-fix)
 *   VAL-3: SSE transport config → throws BC-1 error with migration hint
 *   VAL-4: Session-ID absent from response → graceful stateless fallback + warning logged
 *   VAL-5: mcp-transport-validator hook blocks spawn if transport config invalid
 *
 * Test runner: node --test (Node.js built-in)
 */
'use strict';

const test = require('node:test');
const assert = require('assert');
const path = require('path');

const CLIENT_PATH = path.resolve(__dirname, '../../../.claude/lib/mcp/streamable-http-client.cjs');

// ─── VAL-1: Stateful session establishment ────────────────────────────────────

test('VAL-1: StreamableHttpClient.connect() resolves with sessionId header', async () => {
  const { StreamableHttpClient } = require(CLIENT_PATH);

  // Mock a minimal server that returns Mcp-Session-Id header
  const mockResponder = _req => ({
    status: 200,
    headers: { 'mcp-session-id': 'sess-abc123' },
    body: { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26', capabilities: {} } },
  });

  const client = new StreamableHttpClient({
    endpoint: 'http://localhost:4999/mcp',
    _mockResponder: mockResponder,
  });
  const session = await client.connect();

  assert.ok(session.sessionId, 'sessionId should be set after connect()');
  assert.strictEqual(
    session.sessionId,
    'sess-abc123',
    'sessionId should match Mcp-Session-Id header'
  );
  assert.ok(session.connected, 'connected should be true');
});

// ─── VAL-2: Session-ID threading ─────────────────────────────────────────────

test('VAL-2: Tool calls include Mcp-Session-Id in request headers (trust-pinning)', async () => {
  const { StreamableHttpClient } = require(CLIENT_PATH);

  const requests = [];
  const mockResponder = req => {
    requests.push(req);
    const isInit = req.body?.method === 'initialize';
    return {
      status: 200,
      headers: isInit ? { 'mcp-session-id': 'sess-thread-xyz' } : {},
      body: {
        jsonrpc: '2.0',
        id: req.body?.id ?? 1,
        result: isInit
          ? { protocolVersion: '2025-03-26', capabilities: {} }
          : { content: [{ type: 'text', text: 'ok' }] },
      },
    };
  };

  const client = new StreamableHttpClient({
    endpoint: 'http://localhost:4999/mcp',
    _mockResponder: mockResponder,
  });
  await client.connect();

  // Tool call after connect
  await client.callTool('test_tool', { arg: 'value' });

  // Verify tool-call request carries session-ID header
  const toolCallReq = requests.find(r => r.body?.method === 'tools/call');
  assert.ok(toolCallReq, 'tools/call request must have been made');
  const sentSessionId = toolCallReq.headers?.['mcp-session-id'];
  assert.strictEqual(
    sentSessionId,
    'sess-thread-xyz',
    'tool call must thread session-ID in headers'
  );
});

// ─── VAL-3: BC-1 — SSE transport config rejected ─────────────────────────────

test('VAL-3: SSE transport config throws BC-1 error with migration hint', () => {
  const { StreamableHttpClient: _StreamableHttpClient, createMcpTransport } = require(CLIENT_PATH);

  assert.throws(
    () => createMcpTransport({ transport: 'sse', endpoint: 'http://localhost:4999' }),
    err => {
      assert.ok(err instanceof Error, 'must throw Error');
      assert.ok(
        err.message.includes('BC-1'),
        `error must include BC-1 marker, got: ${err.message}`
      );
      assert.ok(
        err.message.includes('SSE transport removed in v3.0.0'),
        `error must state SSE removal, got: ${err.message}`
      );
      assert.ok(
        err.message.includes('pnpm migrate:2x-to-3'),
        `error must reference migration command, got: ${err.message}`
      );
      return true;
    }
  );
});

// ─── VAL-4: Missing session-ID → stateless fallback ──────────────────────────

test('VAL-4: Missing session-ID in response → stateless mode + warning logged', async () => {
  const { StreamableHttpClient } = require(CLIENT_PATH);

  const warnings = [];
  const mockResponder = _req => ({
    status: 200,
    headers: {}, // no Mcp-Session-Id header
    body: { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26', capabilities: {} } },
  });

  const client = new StreamableHttpClient({
    endpoint: 'http://localhost:4999/mcp',
    _mockResponder: mockResponder,
    _warnSink: msg => warnings.push(msg),
  });

  const session = await client.connect();

  assert.strictEqual(session.sessionId, null, 'sessionId should be null in stateless mode');
  assert.strictEqual(session.stateless, true, 'stateless should be true');
  assert.ok(
    warnings.some(w => w.includes('stateless') || w.includes('no session')),
    `must warn about stateless mode, got warnings: ${JSON.stringify(warnings)}`
  );
});

// ─── VAL-5: Hook blocks invalid transport config ──────────────────────────────

test('VAL-5: mcp-transport-validator hook blocks spawn with invalid transport config', async () => {
  const { spawnSync } = require('child_process');
  const HOOK_PATH = path.resolve(
    __dirname,
    '../../../.claude/hooks/mcp/mcp-transport-validator.cjs'
  );

  // Simulate a Task spawn with mcp.transport: "sse" in the tool_input
  const hookInput = JSON.stringify({
    tool_name: 'Task',
    tool_input: {
      subagent_type: 'nodejs-pro',
      prompt: 'test',
      metadata: { mcp: { transport: 'sse' } },
    },
  });

  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: hookInput,
    encoding: 'utf8',
    shell: false,
  });

  // Hook must exit 2 (block) for invalid transport config
  assert.strictEqual(
    result.status,
    2,
    `hook must exit 2 (block), got ${result.status}. stderr: ${result.stderr}`
  );

  // Stdout must include a parseable block message
  const stdout = result.stdout.trim();
  if (stdout) {
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      // Non-JSON stdout is acceptable for this hook as long as exit code is 2
    }
    if (parsed) {
      assert.strictEqual(parsed.allow, false, 'hook output.allow must be false');
    }
  }
});
