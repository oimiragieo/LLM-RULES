#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'validation',
  'agent-template-contract-validator.cjs'
);

function runHook(payload, mode = 'block') {
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: { ...process.env, AGENT_TEMPLATE_CONTRACT: mode },
  });
}

function parseStdoutJson(stdout) {
  const text = String(stdout || '').trim();
  return text ? JSON.parse(text) : null;
}

test('blocks new agent write when contract marker/sections are missing', () => {
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: '.claude/agents/domain/contract-test-new.md',
      content: '---\nname: x\nskills:\n  - task-management-protocol\n---\n# test',
    },
  };
  const res = runHook(payload, 'block');
  const out = parseStdoutJson(res.stdout);
  assert.equal(res.status, 2);
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.message || '', /AGENT-TEMPLATE-CONTRACT/);
});

test('does not enforce legacy managed contract on existing unmarked agent edit', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-hook-'));
  const legacyPath = path.join(tmpDir, '.claude', 'agents', 'domain', 'legacy-agent.md');
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  fs.writeFileSync(
    legacyPath,
    '---\nname: legacy\nskills:\n  - task-management-protocol\n---\n# Legacy Agent',
    'utf8'
  );

  const payload = {
    tool_name: 'Edit',
    tool_input: {
      file_path: legacyPath,
      old_string: '# Legacy Agent',
      new_string: '# Legacy Agent\n\nminor edit',
    },
  };
  const res = runHook(payload, 'block');
  const out = parseStdoutJson(res.stdout);
  assert.equal(res.status, 0);
  assert.equal(out.permissionDecision, 'allow');
});

test('enforces absolute path writes under .claude/agents', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-hook-abs-'));
  const absPath = path.join(tmpDir, '.claude', 'agents', 'domain', 'abs-agent.md');

  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: absPath,
      content: '---\nname: abs\nskills:\n  - task-management-protocol\n---\n# missing marker',
    },
  };

  const res = runHook(payload, 'block');
  const out = parseStdoutJson(res.stdout);
  assert.equal(res.status, 2);
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.message || '', /Missing contract marker/);
});
