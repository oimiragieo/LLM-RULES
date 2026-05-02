'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'safety',
  'write-pretool-bundle.cjs'
);

function runBundle(filePath, options = {}) {
  const { envAgentId = 'developer', omitEnvAgentId = false, agentId = 'developer' } = options;
  const env = { ...process.env };
  if (omitEnvAgentId) {
    delete env.CLAUDE_AGENT_ID;
  } else {
    env.CLAUDE_AGENT_ID = envAgentId;
  }
  return spawnSync(process.execPath, [BUNDLE_PATH], {
    cwd: PROJECT_ROOT,
    input: JSON.stringify({
      tool_name: 'Write',
      agent_id: agentId,
      tool_input: {
        file_path: filePath,
        content: '[]',
      },
    }),
    encoding: 'utf8',
    timeout: 10000,
    env,
  });
}

for (const protectedPath of [
  '.claude/context/runtime/stale-tasks.json',
  '.claude/context/runtime/integration-queue.jsonl',
]) {
  test(`subagents cannot write protected runtime queue ${protectedPath}`, () => {
    const result = runBundle(protectedPath);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.match(result.stdout, /RUNTIME-QUEUE-GUARD/);
  });
}

test('protected runtime queue uses hook agent_id when CLAUDE_AGENT_ID is unset', () => {
  const result = runBundle('.claude/context/runtime/integration-queue.jsonl', {
    omitEnvAgentId: true,
    agentId: 'developer',
  });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /RUNTIME-QUEUE-GUARD/);
});

test('percent-encoded traversal cannot reach integration-queue.jsonl for non-owner', () => {
  const encoded = '.claude/context/runtime/%2e%2e/runtime/integration-queue.jsonl';
  const result = runBundle(encoded);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /RUNTIME-QUEUE-GUARD/);
});

test('dot-dot segments under runtime normalize to the canonical queue path and are still guarded', () => {
  const traversal = '.claude/context/runtime/../runtime/integration-queue.jsonl';
  const result = runBundle(traversal);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /RUNTIME-QUEUE-GUARD/);
});

test('NUL percent-encoding cannot bypass integration queue guard for non-owner', () => {
  const poisoned = '.claude/context/runtime/integration-queue.jsonl%00';
  const result = runBundle(poisoned);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /RUNTIME-QUEUE-GUARD|traversal|invalid runtime path/i);
});

test('trailing slash via percent-encoding cannot bypass integration queue guard for non-owner', () => {
  const slashTail = '.claude/context/runtime/integration-queue.jsonl%2f';
  const result = runBundle(slashTail);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /RUNTIME-QUEUE-GUARD/);
});

test('UNC-style absolute path still hits runtime queue guard for non-owner', () => {
  const uncStyle = `//wsl$/mnt/c/dev/projects/agent-studio/.claude/context/runtime/integration-queue.jsonl`;
  const result = runBundle(uncStyle);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stdout, /RUNTIME-QUEUE-GUARD/);
});

const {
  validateIntegrationQueueEntry,
  INTEGRATION_QUEUE_ENTRY_SCHEMA_PATH,
} = require('../../.claude/lib/workflow/integration-queue-contract.cjs');
const fs = require('node:fs');

test('integration queue contract rejects ambiguous dual-shape entries', () => {
  assert.ok(fs.existsSync(INTEGRATION_QUEUE_ENTRY_SCHEMA_PATH));
  const bad = {
    timestamp: new Date().toISOString(),
    source: 'test',
    processed: false,
    artifactId: 'skill:x',
    creatorType: 'skill',
    changeType: 'created',
    gaps: ['a'],
    priority: 'P1',
    artifactPath: 'should-not-coexist',
    artifactType: 'skill',
    missingIntegration: 'x',
    detail: 'y',
  };
  const result = validateIntegrationQueueEntry(bad);
  assert.equal(result.valid, false);
});
