#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEvidenceId,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.core.cjs');

test('buildEvidenceId generates deterministic mem id with 8-hex digest', () => {
  const a = buildEvidenceId('mem', 'Use guarded retries for race conditions.');
  const b = buildEvidenceId('mem', 'Use guarded retries for race conditions.');

  assert.equal(a, b);
  assert.match(a, /^mem:[a-f0-9]{8}$/);
});

test('buildEvidenceId generates rag id with 8-hex digest', () => {
  const id = buildEvidenceId('rag', 'OAuth migration sentinel RAG_SENTINEL_AUTH_9000');
  assert.match(id, /^rag:[a-f0-9]{8}$/);
});
