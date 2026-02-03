'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { getDedupDecisionPrompt } = require('../../../.claude/lib/memory/prompts/dedup-decision.cjs');
const {
  deduplicateCandidate,
  normalizeDecision,
  normalizeCategory,
} = require('../../../.claude/lib/memory/memory-deduplicator.cjs');

test('getDedupDecisionPrompt injects candidate and existing memories', () => {
  const { user } = getDedupDecisionPrompt(
    'Candidate content',
    'Candidate abstract',
    'Candidate overview',
    '1. Existing memory'
  );

  assert.ok(user.includes('Candidate abstract'));
  assert.ok(user.includes('Candidate overview'));
  assert.ok(user.includes('Candidate content'));
  assert.ok(user.includes('Existing memory'));
});

test('normalizeDecision accepts valid values', () => {
  assert.equal(normalizeDecision('CREATE'), 'create');
  assert.equal(normalizeDecision('update'), 'update');
  assert.equal(normalizeDecision('merge'), 'merge');
  assert.equal(normalizeDecision('skip'), 'skip');
  assert.equal(normalizeDecision('unknown'), null);
});

test('normalizeCategory accepts known categories', () => {
  assert.equal(normalizeCategory('Profile'), 'profile');
  assert.equal(normalizeCategory('preferences'), 'preferences');
  assert.equal(normalizeCategory('entities'), 'entities');
  assert.equal(normalizeCategory('events'), 'events');
  assert.equal(normalizeCategory('cases'), 'cases');
  assert.equal(normalizeCategory('patterns'), 'patterns');
  assert.equal(normalizeCategory('other'), null);
});

test('deduplicateCandidate passes category to searchMemory', async () => {
  let capturedOptions;
  const memoryManager = {
    searchMemory: async (_query, options) => {
      capturedOptions = options;
      return [];
    },
  };
  const modelClient = { generateText: async () => '' };

  await deduplicateCandidate(
    { abstract: 'Alpha', overview: 'Overview', content: 'Content', category: 'events' },
    { memoryManager, modelClient }
  );

  assert.equal(capturedOptions.category, 'events');
});

test('deduplicateCandidate returns create when no similar memories', async () => {
  const memoryManager = { searchMemory: async () => [] };
  const modelClient = {
    generateText: async () => {
      throw new Error('should not be called');
    },
  };

  const result = await deduplicateCandidate(
    { abstract: 'Alpha', overview: 'Overview', content: 'Content' },
    { memoryManager, modelClient }
  );

  assert.equal(result.decision, 'create');
  assert.equal(result.reason, 'No similar memories found');
});

test('deduplicateCandidate uses model decision when similar memories exist', async () => {
  const memoryManager = {
    searchMemory: async () => [
      { content: 'Existing memory', metadata: { source: 'mtm' }, similarity: 0.9 },
    ],
  };
  const modelClient = {
    generateText: async () =>
      JSON.stringify({
        decision: 'merge',
        reason: 'Related content',
        merged_content: 'Merged memory content',
      }),
  };

  const result = await deduplicateCandidate(
    { abstract: 'Alpha', overview: 'Overview', content: 'Content' },
    { memoryManager, modelClient }
  );

  assert.equal(result.decision, 'merge');
  assert.equal(result.mergedContent, 'Merged memory content');
});
