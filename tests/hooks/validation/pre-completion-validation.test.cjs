#!/usr/bin/env node
/**
 * Tests for pre-completion-validation.cjs early-return guards.
 *
 * Assertions:
 *   1. Router + in_progress -> exits 0 (never blocked)
 *   2. Router + completed (no CLAUDE_AGENT_ID) -> exits 0 (router bypass)
 *   3. Developer agent + completed + missing summary -> exits 2 (blocked)
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const assert = require('assert');

const HOOK = path.resolve(__dirname, '../../../.claude/hooks/validation/pre-completion-validation.cjs');

function runHook(toolInput, extraEnv) {
  const input = JSON.stringify({ tool_name: "TaskUpdate", tool_input: toolInput });
  const childEnv = Object.assign({}, process.env, extraEnv);
  if (extraEnv && extraEnv.CLAUDE_AGENT_ID === "") { delete childEnv.CLAUDE_AGENT_ID; }
  return spawnSync(process.execPath, [HOOK], {
    input, encoding: "utf-8", env: childEnv, timeout: 10000, shell: false, windowsHide: true,
  });
}

// Test 1: in_progress always exits 0
{
  const r = runHook({ taskId: "1", status: "in_progress" }, { CLAUDE_AGENT_ID: "" });
  assert.strictEqual(r.status, 0, "T1 FAIL: got " + r.status + " stderr: " + r.stderr);
  console.log("PASS Test 1: in_progress exits 0 unconditionally");
}

// Test 2: Router + completed exits 0 (no CLAUDE_AGENT_ID)
{
  const r = runHook(
    { taskId: "99", status: "completed", metadata: { summary: "router completing its own housekeeping task for session drain gate" } },
    { CLAUDE_AGENT_ID: "", TASK_STATUS_ENFORCEMENT: "off", SUMMARY_REQUIRED_ENFORCEMENT: "off", PRE_COMPLETION_SUMMARY_ENFORCEMENT: "off" }
  );
  assert.strictEqual(r.status, 0, "T2 FAIL: got " + r.status + " stdout: " + r.stdout);
  console.log("PASS Test 2: router context (no CLAUDE_AGENT_ID) exits 0");
}

// Test 3: Developer agent + completed + short summary -> exits 2
{
  const r = runHook(
    { taskId: "5", status: "completed", metadata: { summary: "done" } },
    { CLAUDE_AGENT_ID: "agent-abc123", TASK_STATUS_ENFORCEMENT: "off" }
  );
  assert.strictEqual(r.status, 2, "T3 FAIL: got " + r.status + " stdout: " + r.stdout);
  console.log("PASS Test 3: developer agent + completed + short summary exits 2");
}

console.log('All 3 tests passed.');