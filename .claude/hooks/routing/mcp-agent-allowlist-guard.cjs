#!/usr/bin/env node
/**
 * MCP Agent Allowlist Guard (PreToolUse)
 *
 * Enforces per-agent MCP server access policies approved in security memo
 * f2-mcp-allowlist-guard-review-2026-04-17.md (APPROVED WITH CONDITIONS).
 *
 * Resolves agent identity via:
 *   hookInput.agent_id ?? process.env.CLAUDE_AGENT_ID ?? 'router'
 *
 * CLAUDE_AGENT_ID trust model: This is intentionally identical to the precedent
 * established in write-pretool-bundle.cjs lines 68-115, which uses the same env var
 * for sub-agent bypass detection. An attacker who controls CLAUDE_AGENT_ID can already
 * bypass write guards -- this hook does not worsen the existing threat surface.
 * Unknown agents default to PERMISSIVE (no-policy), so spoofing an unknown identity
 * grants no escalation. (Condition 1 from security-architect approval memo.)
 *
 * Env: MCP_AGENT_ALLOWLIST_ENFORCEMENT=warn|block|off (default: warn)
 *
 * Rollout: warn mode active. Promote to block after one full session with zero
 * false positives (see security memo s4 telemetry success criteria).
 *
 * @module mcp-agent-allowlist-guard
 */

'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getEnforcementMode,
  formatResult,
} = require('../../lib/utils/hook-input.cjs');
const { isToolAllowed } = require('../../lib/routing/mcp-allowlist-checker.cjs');

async function main() {
  const enforcement = getEnforcementMode('MCP_AGENT_ALLOWLIST_ENFORCEMENT', 'warn');
  if (enforcement === 'off') process.exit(0);

  const hookInput = await parseHookInputAsync();
  if (!hookInput) process.exit(0);

  const toolName = getToolName(hookInput);
  if (!toolName || !toolName.startsWith('mcp__')) process.exit(0);

  // CLAUDE_AGENT_ID trust: spoofable, same model as write-pretool-bundle.cjs
  // (Condition 1 from security memo -- acceptable because unknown agents default permissive)
  const agentId = String(hookInput.agent_id || process.env.CLAUDE_AGENT_ID || 'router')
    .trim()
    .toLowerCase();

  const parts = toolName.split('__');
  const serverName = parts[1] || '';
  const subTool = parts.slice(2).join('__') || '';

  const verdict = isToolAllowed(agentId, serverName, subTool);
  if (verdict.allowed) process.exit(0);

  // Condition 2: structured JSON event for telemetry grep (required before block-mode promotion)
  const eventRecord = {
    event: 'mcp_allowlist_violation',
    agentId,
    server: serverName,
    tool: subTool,
    reason: verdict.reason,
  };
  const humanMsg = `[MCP-ALLOWLIST] Agent '${agentId}' not allowed: ${toolName} (${verdict.reason})`;

  if (enforcement === 'block') {
    console.log(formatResult('block', humanMsg));
    process.stderr.write(JSON.stringify(eventRecord) + '\n');
    process.exit(2);
  }

  // warn mode: log telemetry, allow through
  process.stderr.write(JSON.stringify(eventRecord) + '\n');
  process.stderr.write(humanMsg + '\n');
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`[mcp-agent-allowlist-guard] ${err.message}\n`);
    process.exit(0);
  });
}
