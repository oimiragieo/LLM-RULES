'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeIntent,
  stripCodeFences,
  normalizeContextType,
  normalizePriority,
} = require('../../../.claude/lib/memory/intent-analyzer.cjs');
const {
  getIntentAnalysisPrompt,
} = require('../../../.claude/lib/memory/prompts/intent-analysis.cjs');

test('intent-analysis prompt includes context values', () => {
  const prompt = getIntentAnalysisPrompt('summary', 'recent', 'current', 'memory', 'target');
  assert.ok(prompt.user.includes('summary'));
  assert.ok(prompt.user.includes('recent'));
  assert.ok(prompt.user.includes('current'));
  assert.ok(prompt.user.includes('Restricted Context Type'));
  assert.ok(prompt.user.includes('memory'));
  assert.ok(prompt.user.includes('target'));
  assert.ok(prompt.user.includes('Follow the query style'));
});

test('stripCodeFences removes json fences', () => {
  const raw = '```json\n{"ok":true}\n```';
  assert.equal(stripCodeFences(raw), '{"ok":true}');
});

test('normalizeContextType handles valid values', () => {
  assert.equal(normalizeContextType('Skill'), 'skill');
  assert.equal(normalizeContextType('resource'), 'resource');
  assert.equal(normalizeContextType('memory'), 'memory');
  assert.equal(normalizeContextType('other'), null);
});

test('normalizeCategory handles valid values', () => {
  const { normalizeCategory } = require('../../../.claude/lib/memory/intent-analyzer.cjs');
  assert.equal(normalizeCategory('Preferences'), 'preferences');
  assert.equal(normalizeCategory('events'), 'events');
  assert.equal(normalizeCategory('unknown'), null);
});

test('normalizePriority clamps values', () => {
  assert.equal(normalizePriority(1), 1);
  assert.equal(normalizePriority(9), 5);
  assert.equal(normalizePriority('2'), 2);
  assert.equal(normalizePriority('bad'), 3);
});

test('analyzeIntent parses queries from model output', async () => {
  const modelClient = {
    generateText: async () =>
      '```json\n{"reasoning":"ok","queries":[{"query":"Find X","context_type":"memory","category":"preferences","intent":"why","priority":2}]}\n```',
  };

  const result = await analyzeIntent(
    {
      compressionSummary: 'summary',
      recentMessages: 'recent',
      currentMessage: 'current',
    },
    { modelClient }
  );

  assert.equal(result.reasoning, 'ok');
  assert.equal(result.queries.length, 1);
  assert.equal(result.queries[0].query, 'Find X');
  assert.equal(result.queries[0].context_type, 'memory');
  assert.equal(result.queries[0].category, 'preferences');
  assert.equal(result.queries[0].priority, 2);
});
