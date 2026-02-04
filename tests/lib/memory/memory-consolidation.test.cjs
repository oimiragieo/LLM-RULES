const test = require('node:test');
const assert = require('node:assert/strict');

const {
  consolidateNewMemory,
  buildUserPrompt,
} = require('../../../.claude/lib/memory/memory-consolidation.cjs');

test('buildUserPrompt includes new memory and similar list', () => {
  const prompt = buildUserPrompt('New info', ['Old info']);
  assert.ok(prompt.includes('New info'));
  assert.ok(prompt.includes('Old info'));
});

test('consolidateNewMemory parses model JSON response', async () => {
  const mockClient = {
    generateText: async () => ({
      text: '{"action":"merge","reason":"combine","merged_content":"merged"}',
    }),
  };
  const result = await consolidateNewMemory('New', ['Old'], { modelClient: mockClient });
  assert.equal(result.action, 'merge');
  assert.equal(result.merged_content, 'merged');
});

test('consolidateNewMemory returns skip on parse failure', async () => {
  const mockClient = { generateText: async () => ({ text: 'not json' }) };
  const result = await consolidateNewMemory('New', [], { modelClient: mockClient });
  assert.equal(result.action, 'skip');
  assert.equal(result.reason, 'parse_failed');
});
