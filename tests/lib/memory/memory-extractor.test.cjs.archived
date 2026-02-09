#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  buildRecentMessages,
  extractMemoriesFromSession,
} = require('../../../.claude/lib/memory/memory-extractor.cjs');
const {
  getMemoryExtractionPrompt,
} = require('../../../.claude/lib/memory/prompts/memory-extraction.cjs');

test('getMemoryExtractionPrompt injects context and user', () => {
  const prompt = getMemoryExtractionPrompt('recent text', 'alice', 'feedback', 'summary');
  assert.ok(prompt.system.includes('extract long-term memories'));
  assert.ok(prompt.user.includes('User: alice'));
  assert.ok(prompt.user.includes('recent text'));
  assert.ok(prompt.user.includes('Session History Summary'));
  assert.ok(prompt.user.includes('User Feedback'));
});

test('buildRecentMessages formats session data', () => {
  const output = buildRecentMessages({
    summary: 'Did work',
    decisions_made: ['Ship it'],
    patterns_found: ['Cache data'],
    gotchas_encountered: ['Null ref'],
    tasks_completed: ['Run tests'],
  });
  assert.ok(output.includes('Did work'));
  assert.ok(output.includes('Decisions'));
  assert.ok(output.includes('Ship it'));
});

test('extractMemoriesFromSession parses JSON and strips fences', async () => {
  const modelClient = {
    generateText: async () =>
      '```json\n{"memories":[{"category":"profile","abstract":"User","overview":"O","content":"C"}]}\n```',
  };
  const result = await extractMemoriesFromSession({ summary: 'Session summary' }, { modelClient });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].category, 'profile');
});

test('extractMemoriesFromSession returns empty on bad JSON', async () => {
  const modelClient = {
    generateText: async () => 'not json',
  };
  const result = await extractMemoriesFromSession({ summary: 'Session summary' }, { modelClient });
  assert.strictEqual(result.length, 0);
});
