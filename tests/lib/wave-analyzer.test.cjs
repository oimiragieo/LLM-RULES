'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeWaves } = require('../../.claude/lib/utils/wave-analyzer.cjs');

describe('wave-analyzer', () => {
  it('groups tasks with no deps into a single wave', () => {
    const tasks = [
      { id: 'a', blockedBy: [] },
      { id: 'b', blockedBy: [] },
      { id: 'c', blockedBy: [] },
    ];
    const result = analyzeWaves(tasks);
    assert.equal(result.waves.length, 1);
    assert.deepEqual(result.waves[0].sort(), ['a', 'b', 'c']);
    assert.deepEqual(result.orphans, []);
  });

  it('handles a linear chain into sequential waves', () => {
    const tasks = [
      { id: 'a', blockedBy: [] },
      { id: 'b', blockedBy: ['a'] },
      { id: 'c', blockedBy: ['b'] },
    ];
    const result = analyzeWaves(tasks);
    assert.equal(result.waves.length, 3);
    assert.deepEqual(result.waves[0], ['a']);
    assert.deepEqual(result.waves[1], ['b']);
    assert.deepEqual(result.waves[2], ['c']);
    assert.deepEqual(result.orphans, []);
  });

  it('handles diamond dependency pattern', () => {
    // a -> b, a -> c, b -> d, c -> d
    const tasks = [
      { id: 'a', blockedBy: [] },
      { id: 'b', blockedBy: ['a'] },
      { id: 'c', blockedBy: ['a'] },
      { id: 'd', blockedBy: ['b', 'c'] },
    ];
    const result = analyzeWaves(tasks);
    assert.equal(result.waves.length, 3);
    assert.deepEqual(result.waves[0], ['a']);
    assert.deepEqual(result.waves[1].sort(), ['b', 'c']);
    assert.deepEqual(result.waves[2], ['d']);
    assert.deepEqual(result.orphans, []);
  });

  it('throws on circular dependencies', () => {
    const tasks = [
      { id: 'a', blockedBy: ['b'] },
      { id: 'b', blockedBy: ['a'] },
    ];
    assert.throws(() => analyzeWaves(tasks), /circular/i);
  });

  it('identifies orphan tasks (blockedBy references unknown id)', () => {
    const tasks = [
      { id: 'a', blockedBy: [] },
      { id: 'b', blockedBy: ['unknown'] },
    ];
    const result = analyzeWaves(tasks);
    assert.deepEqual(result.orphans, ['b']);
    assert.equal(result.waves.length, 1);
    assert.deepEqual(result.waves[0], ['a']);
  });

  it('returns empty waves and no orphans for empty input', () => {
    const result = analyzeWaves([]);
    assert.deepEqual(result.waves, []);
    assert.deepEqual(result.orphans, []);
  });
});
