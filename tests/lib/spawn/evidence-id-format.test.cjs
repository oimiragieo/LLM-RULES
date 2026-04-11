'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  formatMemorySection,
  formatRagMemorySection,
} = require('../../../.claude/lib/spawn/prompt-assembler-memory.cjs');

function normalize(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function expectedEvidenceId(prefix, content) {
  const normalized = normalize(content);
  // M-03: non-security use (cache key / content addressing / UUID namespace); MD5/SHA-1 acceptable
  const digest = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8);
  return `${prefix}:${digest}`;
}

test('memory section evidence IDs use [mem:xxxxxxxx] format', () => {
  const section = formatMemorySection({
    gotchas: [{ text: 'Always validate user input thoroughly.' }],
    patterns: [],
    decisions: [],
    discoveries: [],
    recent_sessions: [],
  });

  assert.match(section, /\[mem:[0-9a-f]{8}\]/i);
});

test('RAG section evidence IDs use [rag:xxxxxxxx] format', () => {
  const section = formatRagMemorySection([
    {
      content: 'Use workflow lock for state mutation operations.',
      source: 'code-index',
      similarity: 0.91,
    },
  ]);

  assert.match(section, /\[rag:[0-9a-f]{8}\]/i);
});

test('memory section emits only traceable mem evidence IDs', () => {
  const gotchaA = 'Always validate user input thoroughly.';
  const gotchaB = 'Use file locks for shared state writes.';
  const malformedInjected = 'mem:zzzzzzzz';

  const section = formatMemorySection({
    gotchas: [{ text: gotchaA, evidenceId: malformedInjected }, { text: gotchaB }],
    patterns: [],
    decisions: [],
    discoveries: [],
    recent_sessions: [],
  });

  const emittedIds = Array.from(section.matchAll(/\[(mem:[0-9a-f]{8})\]/gi)).map(m => m[1]);
  const expected = new Set([
    expectedEvidenceId('mem', gotchaA),
    expectedEvidenceId('mem', gotchaB),
  ]);

  assert.ok(emittedIds.length >= 2);
  for (const id of emittedIds) {
    assert.ok(expected.has(id), `Unexpected mem evidence id emitted: ${id}`);
  }
  assert.ok(
    !section.includes(malformedInjected),
    'Assembler should not emit caller-provided malformed IDs'
  );
});

test('RAG section emits only traceable rag evidence IDs', () => {
  const contentA = 'Use workflow lock for state mutation operations.';
  const contentB = 'Prefer safeParseJSON for runtime state reads.';
  const section = formatRagMemorySection([
    { content: contentA, similarity: 0.91 },
    { content: contentB, similarity: 0.88, evidenceId: 'rag:xxxxxxxx' },
  ]);

  const emittedIds = Array.from(section.matchAll(/\[(rag:[0-9a-f]{8})\]/gi)).map(m => m[1]);
  const expected = new Set([
    expectedEvidenceId('rag', contentA),
    expectedEvidenceId('rag', contentB),
  ]);

  assert.equal(emittedIds.length, 2);
  for (const id of emittedIds) {
    assert.ok(expected.has(id), `Unexpected rag evidence id emitted: ${id}`);
  }
});
