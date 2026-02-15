#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONTRACT_MARKER,
  isAgentFile,
  renderAgentTemplate,
  validateAgentContent,
  shouldEnforceForWrite,
} = require('../../../.claude/lib/agents/agent-template-contract.cjs');

test('isAgentFile recognizes relative and absolute .claude/agents paths', () => {
  assert.equal(isAgentFile('.claude/agents/domain/example.md'), true);
  assert.equal(isAgentFile('C:\\dev\\projects\\agent-studio\\.claude\\agents\\domain\\example.md'), true);
  assert.equal(isAgentFile('/workspace/agent-studio/.claude/agents/domain/example.md'), true);
  assert.equal(isAgentFile('.claude/skills/example/SKILL.md'), false);
});

test('renderAgentTemplate includes contract marker and token saver invocation rule', () => {
  const content = renderAgentTemplate({
    name: 'example-agent',
    description: 'Example agent',
  });
  assert.match(content, new RegExp(CONTRACT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(content, /## Token Saver Invocation Rule/);
  assert.match(content, /Skill\(\{ skill: 'token-saver-context-compression' \}\)/);
});

test('validateAgentContent fails when managed marker is missing', () => {
  const rendered = renderAgentTemplate({
    name: 'example-agent',
    description: 'Example agent',
  }).replace(CONTRACT_MARKER, '');

  const result = validateAgentContent(rendered, { requireMarker: true });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' | '), /Missing contract marker/);
});

test('validateAgentContent enforces search-heavy required skills', () => {
  const source = `---
name: demo
description: demo
skills:
  - task-management-protocol
---
${CONTRACT_MARKER}

## Token Saver Invocation Rule
Use \`Skill({ skill: 'token-saver-context-compression' })\`.

Search with pnpm search:code and code-semantic-search.
`;

  const result = validateAgentContent(source, { requireMarker: true });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' | '), /Search-heavy agent missing required skill: ripgrep/);
  assert.match(
    result.errors.join(' | '),
    /Search-heavy agent missing required skill: code-semantic-search/
  );
});

test('shouldEnforceForWrite enforces new or managed agent files and skips legacy edits', () => {
  assert.equal(
    shouldEnforceForWrite({
      filePath: '.claude/agents/domain/new.md',
      incomingContent: 'x',
      existingContent: null,
    }),
    true
  );

  assert.equal(
    shouldEnforceForWrite({
      filePath: '.claude/agents/domain/legacy.md',
      incomingContent: 'legacy update',
      existingContent: '# legacy content without marker',
    }),
    false
  );

  assert.equal(
    shouldEnforceForWrite({
      filePath: '.claude/agents/domain/managed.md',
      incomingContent: `${CONTRACT_MARKER}\nupdated`,
      existingContent: `${CONTRACT_MARKER}\nexisting`,
    }),
    true
  );
});
