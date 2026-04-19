'use strict';

/**
 * write-pretool-bundle-agent-id-bypass.test.cjs
 *
 * TDD regression guard for hookInput.agent_id subagent bypass in write-pretool-bundle.cjs.
 *
 * Root cause fix: write-pretool-bundle.cjs was missing the `hookInput.agent_id` check
 * that every other subagent-aware hook uses. Subagent writes to .claude/lib/**,
 * .claude/hooks/**, and .claude/settings.json were blocked by FILE-PLACEMENT-GUARD
 * because neither CLAUDE_AGENT_ID nor hookInput.task_id is set in practice for
 * spawned subagent hook calls. Claude Code natively injects `agent_id` into PreToolUse
 * hookInput — this is the canonical signal.
 *
 * Reference: .claude/context/reports/backend/write-guard-subagent-block-rca-2026-04-19.md
 *
 * Test execution:
 *   node --test tests/hooks/safety/write-pretool-bundle-agent-id-bypass.test.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude/hooks/safety/write-pretool-bundle.cjs');

/**
 * Run the hook with a given file_path, optional hookInput fields (merged into the top-level
 * JSON object passed via stdin), and optional env overrides.
 *
 * @param {string} filePath
 * @param {object} extraHookInput  - extra top-level fields injected into hookInput (e.g. { agent_id: 'developer' })
 * @param {object} envOverrides    - env vars merged on top of process.env
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
function runHook(filePath, extraHookInput = {}, envOverrides = {}) {
  const hookInput = {
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content: '// test',
    },
    ...extraHookInput,
  };

  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(hookInput),
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      WRITE_HOOK_FAIL_OPEN: 'false',
      ...envOverrides,
    },
    timeout: 15000,
    shell: false,
    windowsHide: true,
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('write-pretool-bundle agent_id bypass', () => {
  // Case 1: hookInput.agent_id is the canonical Claude Code signal for subagent context.
  // A subagent (e.g. 'developer') writing to a framework lib path must be allowed.
  it('case 1: hookInput.agent_id="developer" + .claude/lib path → exit 0 (allow)', () => {
    const testPath = path.join(PROJECT_ROOT, '.claude/lib/evolution/test.cjs');
    const { status, stdout } = runHook(testPath, { agent_id: 'developer' });
    assert.equal(
      status,
      0,
      `Expected exit 0 (allow) for hookInput.agent_id="developer" writing to .claude/lib/**. ` +
        `stdout: ${stdout}`
    );
  });

  // Case 2: CLAUDE_AGENT_ID env var is the legacy/internal subagent signal.
  // Regression guard — must continue to work alongside the new agent_id check.
  it('case 2: CLAUDE_AGENT_ID=developer env + .claude/lib path → exit 0 (allow, existing behavior)', () => {
    const testPath = path.join(PROJECT_ROOT, '.claude/lib/evolution/test.cjs');
    const { status, stdout } = runHook(testPath, {}, { CLAUDE_AGENT_ID: 'developer' });
    assert.equal(
      status,
      0,
      `Expected exit 0 (allow) for CLAUDE_AGENT_ID=developer env writing to .claude/lib/**. ` +
        `stdout: ${stdout}`
    );
  });

  // Case 3: No subagent signals at all. Writing to a framework lib path must be blocked
  // to keep FILE-PLACEMENT-GUARD active for router/main-thread calls.
  it('case 3: no subagent signals + .claude/lib path → exit 2 (FILE-PLACEMENT-GUARD preserved)', () => {
    const testPath = path.join(PROJECT_ROOT, '.claude/lib/foo.cjs');
    // Explicitly clear CLAUDE_AGENT_ID to ensure no residual env from test runner
    const { status } = runHook(
      testPath,
      {},
      { CLAUDE_AGENT_ID: '', WRITE_HOOK_FAIL_OPEN: 'false' }
    );
    assert.equal(
      status,
      2,
      `Expected exit 2 (block) when no subagent signals present and writing to .claude/lib/**. ` +
        `FILE-PLACEMENT-GUARD must still fire for main-thread/router calls.`
    );
  });

  // Case 4: hookInput.agent_id='router' must NOT bypass. The router is the main thread
  // orchestrator and must go through creator skills — it does not get the subagent bypass.
  it('case 4: hookInput.agent_id="router" + .claude/lib path → exit 2 (router never bypasses)', () => {
    const testPath = path.join(PROJECT_ROOT, '.claude/lib/foo.cjs');
    const { status, stdout } = runHook(
      testPath,
      { agent_id: 'router' },
      { CLAUDE_AGENT_ID: '', WRITE_HOOK_FAIL_OPEN: 'false' }
    );
    assert.equal(
      status,
      2,
      `Expected exit 2 (block) for hookInput.agent_id="router". ` +
        `Router must never get the subagent bypass — it must use creator skills. ` +
        `stdout: ${stdout}`
    );
  });
});
