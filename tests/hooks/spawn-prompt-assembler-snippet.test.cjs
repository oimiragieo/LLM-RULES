'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  appendSemanticMatches,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

test('appendSemanticMatches prefers abstract over content', () => {
  const prompt = 'Base prompt';
  const results = [
    {
      content: 'Full content that should not be preferred',
      metadata: {
        abstract: 'Short abstract summary',
        overview: 'Longer overview',
      },
      similarity: 0.9,
      source: 'lancedb',
    },
  ];

  const output = appendSemanticMatches(prompt, results);
  assert.ok(output.includes('Short abstract summary'));
  assert.ok(!output.includes('Full content that should not be preferred'));
});
