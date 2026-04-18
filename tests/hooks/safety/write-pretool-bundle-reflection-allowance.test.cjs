'use strict';

/**
 * write-pretool-bundle-reflection-allowance.test.cjs
 *
 * TDD: reflection-agent runtime queue drain — Step 0 IRON LAW
 *
 * The hook must allow reflection-agent to write to exactly two paths in
 * .claude/context/runtime/ while keeping all other paths blocked.
 * All non-reflection agents remain blocked from these two paths.
 *
 * Test execution: node --test tests/hooks/safety/write-pretool-bundle-reflection-allowance.test.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude/hooks/safety/write-pretool-bundle.cjs');

const REFLECTION_SPAWN_REQUEST = path.join(
  PROJECT_ROOT,
  '.claude/context/runtime/reflection-spawn-request.json'
);
const REFLECTION_REMINDER = path.join(
  PROJECT_ROOT,
  '.claude/context/runtime/reflection-reminder.txt'
);
const OTHER_RUNTIME_FILE = path.join(PROJECT_ROOT, '.claude/context/runtime/session-gap-log.jsonl');

/**
 * Run the hook process with the given tool input JSON and env overrides.
 * Returns { status, stdout, stderr }.
 */
function runHook(filePath, envOverrides = {}) {
  const hookInput = {
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content: '{}',
    },
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

describe('write-pretool-bundle reflection-agent allowance', () => {
  it('case 1: reflection-agent writing reflection-spawn-request.json → exit 0 (allow)', () => {
    const { status } = runHook(REFLECTION_SPAWN_REQUEST, {
      CLAUDE_AGENT_ID: 'reflection-agent',
    });
    assert.equal(
      status,
      0,
      'reflection-agent must be allowed to write reflection-spawn-request.json (Step 0 drain)'
    );
  });

  it('case 2: reflection-agent writing reflection-reminder.txt → exit 0 (allow)', () => {
    const { status } = runHook(REFLECTION_REMINDER, {
      CLAUDE_AGENT_ID: 'reflection-agent',
    });
    assert.equal(
      status,
      0,
      'reflection-agent must be allowed to write reflection-reminder.txt (Step 0 drain)'
    );
  });

  it('case 3: reflection-agent writing other runtime/ file → exit 2 (blocked)', () => {
    const { status } = runHook(OTHER_RUNTIME_FILE, {
      CLAUDE_AGENT_ID: 'reflection-agent',
    });
    assert.equal(
      status,
      2,
      'reflection-agent must NOT be allowed to write arbitrary runtime/ paths'
    );
  });

  it('case 4: developer writing reflection-spawn-request.json → exit 2 (blocked)', () => {
    const hookInput = {
      tool_name: 'Write',
      tool_input: {
        file_path: REFLECTION_SPAWN_REQUEST,
        content: '{}',
      },
    };

    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify(hookInput),
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        CLAUDE_AGENT_ID: 'developer',
        WRITE_HOOK_FAIL_OPEN: 'false',
      },
      timeout: 15000,
      shell: false,
      windowsHide: true,
    });

    assert.equal(
      result.status,
      2,
      'Non-reflection agents must NOT be allowed to write to reflection runtime paths'
    );
  });

  it('case 5: malformed/empty stdin → fail-open (exit 0, no crash)', () => {
    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: '',
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        WRITE_HOOK_FAIL_OPEN: 'true',
      },
      timeout: 15000,
      shell: false,
      windowsHide: true,
    });

    assert.equal(
      result.status,
      0,
      'Malformed input must not crash the hook process — fail-open when WRITE_HOOK_FAIL_OPEN=true'
    );
  });
});
