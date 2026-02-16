'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatMemorySection,
  formatRagMemorySection,
} = require('../../../.claude/lib/spawn/prompt-assembler-memory.cjs');

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
