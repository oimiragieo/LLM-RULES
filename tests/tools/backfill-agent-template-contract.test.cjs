#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CONTRACT_MARKER } = require('../../.claude/lib/agents/agent-template-contract.cjs');
const {
  rewriteFileContent,
} = require('../../.claude/tools/cli/backfill-agent-template-contract.cjs');

test('rewriteFileContent injects marker, token saver rule, and required skills', () => {
  const source = `---
name: sample-agent
description: sample
skills:
  - verification-before-completion
---

# Sample Agent

## Memory Protocol
Before starting...
`;

  const result = rewriteFileContent(source);
  assert.equal(result.skipped, false);
  assert.equal(result.changed, true);
  assert.match(result.content, /task-management-protocol/);
  assert.match(result.content, /## Token Saver Invocation Rule/);
  assert.match(result.content, new RegExp(CONTRACT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('rewriteFileContent adds search-heavy required skills when content is search-heavy', () => {
  const source = `---
name: search-agent
description: search
skills:
  - task-management-protocol
---

# Search Agent

Use pnpm search:code before coding.
`;

  const result = rewriteFileContent(source);
  assert.equal(result.skipped, false);
  assert.equal(result.changed, true);
  assert.match(result.content, /ripgrep/);
  assert.match(result.content, /code-semantic-search/);
  assert.match(result.content, /token-saver-context-compression/);
});

test('rewriteFileContent skips files with missing frontmatter', () => {
  const source = '# legacy markdown without frontmatter';
  const result = rewriteFileContent(source);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'missing frontmatter');
});
