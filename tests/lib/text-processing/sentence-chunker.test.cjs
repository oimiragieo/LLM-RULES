'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chunkBySentences,
  splitSentencesWithOffsets,
} = require('../../../.claude/lib/utils/sentence-chunker.cjs');

test('splitSentencesWithOffsets handles empty input', () => {
  assert.deepEqual(splitSentencesWithOffsets(''), []);
});

test('chunkBySentences returns one chunk when short', () => {
  const text = 'This is a short sentence.';
  const chunks = chunkBySentences(text, { maxCharBuffer: 200 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].content, text);
});

test('chunkBySentences splits into multiple chunks', () => {
  const text = 'First sentence. Second sentence. Third sentence.';
  const chunks = chunkBySentences(text, { maxCharBuffer: 25 });
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.content.length <= 25 || chunk.content.length === chunks[0].content.length);
  }
});

test('chunkBySentences handles long single sentence', () => {
  const text = 'A'.repeat(120);
  const chunks = chunkBySentences(text, { maxCharBuffer: 50 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].content.length, 120);
});

test('chunkBySentences includes interval metadata', () => {
  const text = 'One. Two.';
  const chunks = chunkBySentences(text, { maxCharBuffer: 10 });
  assert.ok(chunks[0].startIndex >= 0);
  assert.ok(chunks[0].endIndex >= chunks[0].startIndex);
});
