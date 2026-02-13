'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// This test will FAIL because memory-utils.cjs does not exist yet
test('C-001: memory-utils module exports buildSemanticContext', () => {
  const memoryUtils = require('../../../../.claude/lib/memory/core/memory-utils.cjs');

  assert.ok(typeof memoryUtils.buildSemanticContext === 'function',
    'buildSemanticContext must be exported');
  assert.ok(typeof memoryUtils.normalizeMemoryEntry === 'function',
    'normalizeMemoryEntry must be exported');
  assert.ok(typeof memoryUtils.calculateQualityScore === 'function',
    'calculateQualityScore must be exported');
});

test('C-001: buildSemanticContext formats entries correctly', () => {
  const { buildSemanticContext } = require('../../../../.claude/lib/memory/core/memory-utils.cjs');

  const entries = [
    { content: 'Pattern: Use memoization for performance', category: 'pattern', timestamp: '2026-01-01' },
    { content: 'Issue: Memory leak in loop', category: 'issue', timestamp: '2026-01-02' },
  ];

  const context = buildSemanticContext(entries, { maxEntries: 10 });

  assert.ok(context.includes('Pattern: Use memoization'), 'Should include first entry content');
  assert.ok(context.includes('[pattern]'), 'Should include category tag');
  assert.ok(context.includes('[issue]'), 'Should include second category');
});

test('C-001: buildSemanticContext returns empty string for empty input', () => {
  const { buildSemanticContext } = require('../../../../.claude/lib/memory/core/memory-utils.cjs');

  assert.strictEqual(buildSemanticContext([], {}), '');
  assert.strictEqual(buildSemanticContext(null, {}), '');
  assert.strictEqual(buildSemanticContext(undefined, {}), '');
});

test('C-001: buildSemanticContext truncates at maxChars', () => {
  const { buildSemanticContext } = require('../../../../.claude/lib/memory/core/memory-utils.cjs');

  const entries = Array.from({ length: 50 }, (_, i) => ({
    content: `Entry ${i} with some substantial content padding for length`.repeat(5),
    category: 'test',
    timestamp: '2026-01-01',
  }));

  const context = buildSemanticContext(entries, { maxEntries: 50, maxChars: 500 });

  assert.ok(context.length <= 520, `Context should be ~500 chars, got ${context.length}`);
  assert.ok(context.includes('[truncated...]'), 'Should include truncation marker');
});

test('C-001: normalizeMemoryEntry validates and normalizes', () => {
  const { normalizeMemoryEntry } = require('../../../../.claude/lib/memory/core/memory-utils.cjs');

  const entry = { content: '  Test entry  ' };
  const normalized = normalizeMemoryEntry(entry);

  assert.strictEqual(normalized.content, 'Test entry');
  assert.ok(normalized.timestamp, 'Should have timestamp');
  assert.strictEqual(normalized.category, 'general');
  assert.ok(normalized.metadata, 'Should have metadata object');
});

test('C-001: normalizeMemoryEntry throws on empty content', () => {
  const { normalizeMemoryEntry } = require('../../../../.claude/lib/memory/core/memory-utils.cjs');

  assert.throws(() => normalizeMemoryEntry({ content: '' }), /content cannot be empty/);
  assert.throws(() => normalizeMemoryEntry({ content: '   ' }), /content cannot be empty/);
  assert.throws(() => normalizeMemoryEntry(null), /Entry must be an object/);
});

test('C-001: calculateQualityScore returns 0-1 range', () => {
  const { calculateQualityScore } = require('../../../../.claude/lib/memory/core/memory-utils.cjs');

  const score0 = calculateQualityScore({ accessCount: 0, ageInDays: 100, content: '' });
  const score1 = calculateQualityScore({ accessCount: 20, ageInDays: 0, content: 'a'.repeat(2000) });

  assert.ok(score0 >= 0 && score0 <= 1, `Score should be 0-1, got ${score0}`);
  assert.ok(score1 >= 0 && score1 <= 1, `Score should be 0-1, got ${score1}`);
  assert.ok(score1 > score0, 'High access, recent, long entry should score higher');
});

test('C-001: Modules can be required in any order without error', () => {
  // Clear cache
  const cmPath = require.resolve('../../../../.claude/lib/memory/contextual-memory.cjs');
  const mqPath = require.resolve('../../../../.claude/lib/memory/core/memory-query.cjs');
  const muPath = require.resolve('../../../../.claude/lib/memory/core/memory-utils.cjs');

  delete require.cache[cmPath];
  delete require.cache[mqPath];
  delete require.cache[muPath];

  // Load in one order
  assert.doesNotThrow(() => {
    require('../../../../.claude/lib/memory/core/memory-utils.cjs');
    require('../../../../.claude/lib/memory/contextual-memory.cjs');
    require('../../../../.claude/lib/memory/core/memory-query.cjs');
  }, 'Should load utils -> contextual -> query without error');

  // Clear and load in reverse order
  delete require.cache[cmPath];
  delete require.cache[mqPath];
  delete require.cache[muPath];

  assert.doesNotThrow(() => {
    require('../../../../.claude/lib/memory/core/memory-query.cjs');
    require('../../../../.claude/lib/memory/contextual-memory.cjs');
    require('../../../../.claude/lib/memory/core/memory-utils.cjs');
  }, 'Should load query -> contextual -> utils without error');
});
