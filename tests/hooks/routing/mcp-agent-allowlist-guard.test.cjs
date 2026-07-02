// <!-- Agent: developer | Task: f2-mcp-allowlist-impl-2026-04-17 | Session: 2026-04-17 -->
// Tests for mcp-agent-allowlist-guard.cjs PreToolUse hook
'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

const HOOK_SCRIPT = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'mcp-agent-allowlist-guard.cjs'
);

/**
 * Run the hook with the given hook input JSON and optional env overrides.
 * Returns { code, stdout, stderr }.
 */
function runHook(hookInput, env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [HOOK_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.stdin.write(JSON.stringify(hookInput));
    child.stdin.end();
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

describe('mcp-agent-allowlist-guard hook', { concurrency: 1 }, () => {
  // Case 1: enforcement=off → exit 0 regardless of denied tool
  test('enforcement=off exits 0 regardless of tool', async () => {
    const input = {
      tool_name: 'mcp__filesystem__write_file',
      tool_input: {},
    };
    const {
      code,
      stdout,
      stderr: _stderr,
    } = await runHook(input, {
      MCP_AGENT_ALLOWLIST_ENFORCEMENT: 'off',
      CLAUDE_AGENT_ID: 'router',
    });
    assert.equal(code, 0, 'must exit 0 when enforcement is off');
    assert.equal(stdout.trim(), '', 'must produce no stdout when off');
  });

  // Case 2: enforcement=warn + denied tool → exit 0 + JSON event on stderr
  test('enforcement=warn emits JSON event on stderr for denied tool', async () => {
    // router is denied ALL mcp servers (mcp_deny: ['*'])
    const input = {
      tool_name: 'mcp__filesystem__write_file',
      tool_input: {},
    };
    const {
      code,
      stdout: _stdout,
      stderr,
    } = await runHook(input, {
      MCP_AGENT_ALLOWLIST_ENFORCEMENT: 'warn',
      CLAUDE_AGENT_ID: 'router',
    });
    assert.equal(code, 0, 'warn mode must exit 0');
    // Condition 2: structured JSON event must be on stderr
    const lines = stderr.split('\n').filter(l => l.trim());
    const jsonLine = lines.find(l => {
      try {
        return JSON.parse(l).event === 'mcp_allowlist_violation';
      } catch {
        return false;
      }
    });
    assert.ok(jsonLine, 'must emit structured JSON event on stderr');
    const event = JSON.parse(jsonLine);
    assert.equal(event.agentId, 'router');
    assert.equal(event.server, 'filesystem');
    assert.equal(event.tool, 'write_file');
    assert.ok(event.reason, 'must include reason field');
  });

  // Case 3: enforcement=block + denied tool → exit 2 + block JSON on stdout + JSON event on stderr
  test('enforcement=block exits 2 with block JSON stdout + JSON event stderr for denied tool', async () => {
    const input = {
      tool_name: 'mcp__filesystem__write_file',
      tool_input: {},
    };
    const { code, stdout, stderr } = await runHook(input, {
      MCP_AGENT_ALLOWLIST_ENFORCEMENT: 'block',
      CLAUDE_AGENT_ID: 'router',
    });
    assert.equal(code, 2, 'block mode must exit 2 for denied tool');
    // stdout must contain block decision JSON
    const stdoutParsed = JSON.parse(stdout.trim());
    assert.equal(
      stdoutParsed.permissionDecision,
      'deny',
      'stdout must have permissionDecision=deny'
    );
    // stderr must have structured JSON event
    const stderrLines = stderr.split('\n').filter(l => l.trim());
    const jsonLine = stderrLines.find(l => {
      try {
        return JSON.parse(l).event === 'mcp_allowlist_violation';
      } catch {
        return false;
      }
    });
    assert.ok(jsonLine, 'must emit structured JSON event on stderr in block mode');
  });

  // Case 4: allowed tool → exit 0 silently
  test('allowed tool exits 0 silently', async () => {
    // developer is allowed filesystem.*
    const input = {
      tool_name: 'mcp__filesystem__read_file',
      tool_input: {},
    };
    const { code, stdout, stderr } = await runHook(input, {
      MCP_AGENT_ALLOWLIST_ENFORCEMENT: 'block',
      CLAUDE_AGENT_ID: 'developer',
    });
    assert.equal(code, 0, 'allowed tool must exit 0');
    assert.equal(stdout.trim(), '', 'allowed tool must produce no stdout');
    assert.equal(stderr.trim(), '', 'allowed tool must produce no stderr');
  });

  // Case 5: malformed hook input in block mode → exit 2 (fail-closed)
  test('malformed hook input exits 2 in block mode', async () => {
    return new Promise(resolve => {
      const child = spawn(process.execPath, [HOOK_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MCP_AGENT_ALLOWLIST_ENFORCEMENT: 'block' },
      });
      let stdout = '';
      child.stdout.on('data', d => (stdout += d));
      child.stdin.write('not valid json at all{{{');
      child.stdin.end();
      child.on('close', exitCode => {
        assert.equal(exitCode, 2, 'malformed input must fail closed in block mode');
        const parsed = JSON.parse(stdout.trim());
        assert.equal(parsed.permissionDecision, 'deny');
        resolve();
      });
    });
  });
});
