'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCitationIds,
  validateCitations,
} = require('../../.claude/hooks/validation/subagent-citation-guard.cjs');

test('extractCitationIds captures mem/rag evidence ids from text', () => {
  const ids = extractCitationIds(
    'Answer uses [mem:deadbeef] and [rag:abcdef12], and repeats [mem:deadbeef].'
  );
  assert.deepEqual([...ids].sort(), ['mem:deadbeef', 'rag:abcdef12']);
});

test('validateCitations passes when cited ids are subset of injected ids', () => {
  const result = validateCitations({
    mode: 'block',
    prompt: 'Facts: [mem:1234abcd] and [rag:abcd1234]',
    output: 'Using [mem:1234abcd] as evidence.',
  });
  assert.equal(result.pass, true);
  assert.equal(result.result, 'allow');
});

test('validateCitations blocks fabricated ids in block mode', () => {
  const result = validateCitations({
    mode: 'block',
    prompt: 'Facts: [mem:1234abcd]',
    output: 'I used [mem:deadbeef].',
  });
  assert.equal(result.pass, false);
  assert.equal(result.result, 'block');
  assert.match(result.message, /fabricated citation ids/i);
});

test('validateCitations warns when required citations are missing in warn mode', () => {
  const result = validateCitations({
    mode: 'warn',
    prompt: 'Facts: [mem:1234abcd]',
    output: 'No evidence ids included in this output.',
  });
  assert.equal(result.pass, true);
  assert.equal(result.result, 'warn');
  assert.match(result.message, /missing citation/i);
});

test('validateCitations is disabled in off mode', () => {
  const result = validateCitations({
    mode: 'off',
    prompt: 'Facts: [mem:1234abcd]',
    output: 'No citations here.',
  });
  assert.equal(result.pass, true);
  assert.equal(result.result, 'allow');
});
