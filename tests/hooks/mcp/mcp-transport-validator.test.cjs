/**
 * MCP Transport Validator Hook — Unit Tests
 *
 * Tests the hook's checkTransportConfig() directly (no subprocess spawn needed
 * for unit assertions). The subprocess / exit-code contract is tested via
 * VAL-5 in tests/lib/mcp/streamable-http.test.cjs.
 *
 * Agent: nodejs-pro | Task: S1 | Session: 2026-04-20
 */
'use strict';

const test = require('node:test');
const assert = require('assert');
const path = require('path');

const { checkTransportConfig } = require(
  path.resolve(__dirname, '../../../.claude/hooks/mcp/mcp-transport-validator.cjs')
);

test('allows Task with no mcp config', () => {
  const result = checkTransportConfig({
    tool_name: 'Task',
    tool_input: { subagent_type: 'developer', prompt: 'hello' },
  });
  assert.strictEqual(result.allow, true);
});

test('allows Task with streamable-http transport', () => {
  const result = checkTransportConfig({
    tool_name: 'Task',
    tool_input: { metadata: { mcp: { transport: 'streamable-http' } } },
  });
  assert.strictEqual(result.allow, true);
});

test('blocks Task with sse transport (BC-1)', () => {
  const result = checkTransportConfig({
    tool_name: 'Task',
    tool_input: { metadata: { mcp: { transport: 'sse' } } },
  });
  assert.strictEqual(result.allow, false);
  assert.ok(result.message.includes('BC-1'), `message must include BC-1, got: ${result.message}`);
  assert.ok(result.message.includes('pnpm migrate:2x-to-3'), `message must include migration cmd`);
});

test('blocks Task with unknown transport', () => {
  const result = checkTransportConfig({
    tool_name: 'Task',
    tool_input: { metadata: { mcp: { transport: 'websocket' } } },
  });
  assert.strictEqual(result.allow, false);
  assert.ok(result.message.includes('websocket'), `message must name the bad transport`);
});

test('allows non-Task tools without checking mcp config', () => {
  const result = checkTransportConfig({
    tool_name: 'Bash',
    tool_input: { command: 'echo hi', metadata: { mcp: { transport: 'sse' } } },
  });
  // non-Task tools are not gated by this hook
  assert.strictEqual(result.allow, true);
});

test('handles null/undefined input gracefully', () => {
  assert.doesNotThrow(() => checkTransportConfig(null));
  assert.doesNotThrow(() => checkTransportConfig(undefined));
  assert.doesNotThrow(() => checkTransportConfig({}));
  const r = checkTransportConfig(null);
  assert.strictEqual(r.allow, true);
});
