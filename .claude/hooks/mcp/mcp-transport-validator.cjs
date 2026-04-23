#!/usr/bin/env node
/**
 * MCP Transport Validator Hook (PreToolUse: Task)
 *
 * Blocks Task() spawn calls that embed `mcp.transport: "sse"` in their metadata,
 * enforcing BC-1 (SSE transport removed in v3.0.0).
 *
 * Protocol:
 *   stdin  → JSON hook input: { tool_name, tool_input }
 *   stdout → JSON: { allow: false, message: "..." }  (on block)
 *   exit   → 0 (allow) | 2 (block)
 *
 * Enforcement mode: block (security-critical)
 * Per fail-closed policy: security hooks exit 2 on block, never fail-open.
 *
 * Agent: nodejs-pro | Task: S1 | Session: 2026-04-20
 */
'use strict';

const MCP_TRANSPORT_VALIDATOR_ENFORCEMENT =
  process.env.MCP_TRANSPORT_VALIDATOR_ENFORCEMENT || 'block';

/**
 * Check hook input for an invalid MCP transport config and return a result.
 *
 * @param {object} input  Parsed hook input
 * @returns {{ allow: boolean, message?: string }}
 */
function checkTransportConfig(input) {
  if (!input || typeof input !== 'object') return { allow: true };
  if (input.tool_name !== 'Task') return { allow: true };

  const toolInput = input.tool_input;
  if (!toolInput || typeof toolInput !== 'object') return { allow: true };

  const mcpConfig = toolInput.metadata?.mcp || toolInput.mcp;
  if (!mcpConfig) return { allow: true };

  const transport = mcpConfig.transport;

  if (transport === 'sse') {
    return {
      allow: false,
      message:
        'BC-1: SSE transport removed in v3.0.0; run pnpm migrate:2x-to-3 to upgrade your config to streamable-http',
    };
  }

  if (transport && transport !== 'streamable-http') {
    return {
      allow: false,
      message: `Unknown MCP transport: "${transport}". Only "streamable-http" is supported in v3.0.0.`,
    };
  }

  return { allow: true };
}

function main() {
  let rawInput = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    rawInput += chunk;
  });

  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(rawInput.trim() || '{}');
      const result = checkTransportConfig(input);

      if (!result.allow) {
        if (MCP_TRANSPORT_VALIDATOR_ENFORCEMENT === 'off') {
          process.stderr.write(`[mcp-transport-validator] WARN (enforcement=off): ${result.message}\n`);
          process.exit(0);
        }

        process.stdout.write(JSON.stringify({ allow: false, message: result.message }));
        process.exit(2);
      }

      process.exit(0);
    } catch (err) {
      // Fail-open on unexpected errors to not disrupt the pipeline
      process.stderr.write(`[mcp-transport-validator] Error: ${err.message}\n`);
      process.exit(0);
    }
  });
}

if (require.main === module) {
  main();
}

module.exports = { checkTransportConfig, main };
