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

// ── BC-2 manifest block check (V3_MANIFEST_REQUIRED=on) ──────────────────────

function runHookV3(payload, agentTemplateMode = 'block', v3Required = 'on') {
  return spawnSync(process.execPath, [HOOK_PATH], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: {
      ...process.env,
      AGENT_TEMPLATE_CONTRACT: agentTemplateMode,
      V3_MANIFEST_REQUIRED: v3Required,
    },
  });
}

/** Minimal valid agent content that passes existing contract checks. */
function buildValidAgentContent({ withManifest = false } = {}) {
  const manifestBlock = withManifest
    ? `manifest:\n  manifest_version: '1.0'\n  agent_id: test-agent\n`
    : '';
  return [
    '---',
    'name: test-agent',
    'skills:',
    '  - task-management-protocol',
    manifestBlock.trim(),
    '---',
    '<!-- agent-template-contract:v1 -->',
    '## Token Saver Invocation Rule',
    "Use `Skill({ skill: 'token-saver-context-compression' })`",
    '',
  ]
    .filter(line => line !== null)
    .join('\n');
}

test('BC-2: blocks agent write missing manifest block when V3_MANIFEST_REQUIRED=on', () => {
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: '.claude/agents/domain/v3-no-manifest.md',
      content: buildValidAgentContent({ withManifest: false }),
    },
  };
  const res = runHookV3(payload, 'block', 'on');
  const out = parseStdoutJson(res.stdout);
  assert.equal(res.status, 2, 'Expected exit 2 (block)');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.message || '', /BC-2/);
  assert.match(out.message || '', /manifest block required/);
});

test('BC-2: allows agent write WITH manifest block when V3_MANIFEST_REQUIRED=on', () => {
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: '.claude/agents/domain/v3-with-manifest.md',
      content: buildValidAgentContent({ withManifest: true }),
    },
  };
  const res = runHookV3(payload, 'block', 'on');
  const out = parseStdoutJson(res.stdout);
  assert.equal(res.status, 0, 'Expected exit 0 (allow)');
  assert.equal(out.permissionDecision, 'allow');
});

test('BC-2: allows agent write missing manifest block when V3_MANIFEST_REQUIRED is NOT set', () => {
  const payload = {
    tool_name: 'Write',
    tool_input: {
      file_path: '.claude/agents/domain/v2-no-manifest.md',
      content: buildValidAgentContent({ withManifest: false }),
    },
  };
  // Pass v3Required=undefined to omit the env var entirely
  const res = spawnSync(process.execPath, [HOOK_PATH], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: { ...process.env, AGENT_TEMPLATE_CONTRACT: 'block' },
  });
  const out = parseStdoutJson(res.stdout);
  assert.equal(res.status, 0, 'Expected exit 0 (allow) without V3_MANIFEST_REQUIRED');
  assert.equal(out.permissionDecision, 'allow');
});
