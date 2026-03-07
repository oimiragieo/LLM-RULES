#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const agentCreator = require('../../.claude/skills/agent-creator/scripts/main.cjs');
const { CONTRACT_MARKER } = require('../../.claude/lib/agents/agent-template-contract.cjs');

test('agent-creator generate writes contract-compliant agent file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-creator-generate-'));
  const outputPath = path.join(tmpDir, '.claude', 'agents', 'domain', 'qa-guardian.md');

  const result = agentCreator.main({
    action: 'generate',
    name: 'qa-guardian',
    description: 'Quality gate agent',
    output: outputPath,
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'generate');
  assert.equal(result.outputPath, outputPath);

  const content = fs.readFileSync(outputPath, 'utf8');
  assert.match(content, /## Token Saver Invocation Rule/);
  assert.match(content, new RegExp(CONTRACT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(content, /task-management-protocol/);
  assert.match(content, /code-semantic-search/);
  assert.match(content, /token-saver-context-compression/);
});

test('agent-creator validate returns ok=true for generated managed file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-creator-validate-'));
  const outputPath = path.join(tmpDir, '.claude', 'agents', 'domain', 'contract-check.md');

  agentCreator.main({
    action: 'generate',
    name: 'contract-check',
    description: 'Contract check agent',
    output: outputPath,
  });

  const validation = agentCreator.main({
    action: 'validate',
    file: outputPath,
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.action, 'validate');
  assert.equal(validation.file, outputPath);
  assert.deepEqual(validation.errors, []);
});

test('agent-creator validate returns ok=false for unmanaged content', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-creator-invalid-'));
  const outputPath = path.join(tmpDir, '.claude', 'agents', 'domain', 'invalid-agent.md');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    '---\nname: invalid\nskills:\n  - task-management-protocol\n---\n# Invalid',
    'utf8'
  );

  const validation = agentCreator.main({
    action: 'validate',
    file: outputPath,
  });

  assert.equal(validation.ok, false);
  assert.match((validation.errors || []).join(' | '), /Missing contract marker/);
});

test('agent-creator supports --generate/--validate style boolean actions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-creator-bool-action-'));
  const outputPath = path.join(tmpDir, '.claude', 'agents', 'domain', 'bool-action.md');

  const generated = agentCreator.main({
    generate: true,
    name: 'bool-action',
    description: 'Boolean action mode',
    output: outputPath,
  });
  assert.equal(generated.ok, true);

  const validated = agentCreator.main({
    validate: true,
    file: outputPath,
  });
  assert.equal(validated.ok, true);
});

test('agent-creator generate returns orchestrator integration checklist for orchestrator category', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-creator-orchestrator-'));
  const outputPath = path.join(tmpDir, '.claude', 'agents', 'orchestrators', 'repo-onboarder.md');

  const result = agentCreator.main({
    action: 'generate',
    name: 'repo-onboarder',
    category: 'orchestrators',
    description: 'Repository integration orchestrator',
    output: outputPath,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.orchestratorIntegration.requiredFiles, [
    '.claude/CLAUDE.md',
    '.claude/workflows/core/router-decision.md',
    '.claude/workflows/core/ecosystem-creation-workflow.md',
  ]);
});
