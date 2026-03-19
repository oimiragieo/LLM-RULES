'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  groupIntoWaves,
  detectFileConflicts,
  buildDependencyGraph,
  topologicalSort,
  DEFAULT_MAX_PARALLEL,
} = require('../../.claude/lib/orchestration/wave-grouper.cjs');

// ─── Constants ──────────────────────────────────────────────────────────────

describe('wave-grouper constants', () => {
  it('exports DEFAULT_MAX_PARALLEL', () => {
    assert.equal(typeof DEFAULT_MAX_PARALLEL, 'number');
    assert.ok(DEFAULT_MAX_PARALLEL >= 2);
  });
});

// ─── buildDependencyGraph ───────────────────────────────────────────────────

describe('buildDependencyGraph', () => {
  it('builds graph from tasks with no dependencies', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
    ];
    const graph = buildDependencyGraph(tasks);
    assert.deepEqual(graph.get('a'), new Set());
    assert.deepEqual(graph.get('b'), new Set());
  });

  it('builds graph with dependencies', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['a', 'b'] },
    ];
    const graph = buildDependencyGraph(tasks);
    assert.deepEqual(graph.get('a'), new Set());
    assert.deepEqual(graph.get('b'), new Set(['a']));
    assert.deepEqual(graph.get('c'), new Set(['a', 'b']));
  });

  it('ignores dependencies on unknown tasks', () => {
    const tasks = [{ id: 'a', dependsOn: ['z'] }];
    const graph = buildDependencyGraph(tasks);
    // z is not in the task list, so it should be ignored
    assert.deepEqual(graph.get('a'), new Set());
  });

  it('handles empty task list', () => {
    const graph = buildDependencyGraph([]);
    assert.equal(graph.size, 0);
  });

  it('defaults dependsOn to empty array if missing', () => {
    const tasks = [{ id: 'x' }];
    const graph = buildDependencyGraph(tasks);
    assert.deepEqual(graph.get('x'), new Set());
  });
});

// ─── topologicalSort ────────────────────────────────────────────────────────

describe('topologicalSort', () => {
  it('sorts independent tasks (any valid order)', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
    ];
    const graph = buildDependencyGraph(tasks);
    const sorted = topologicalSort(graph);
    assert.equal(sorted.length, 2);
    assert.ok(sorted.includes('a'));
    assert.ok(sorted.includes('b'));
  });

  it('sorts dependent tasks in correct order', () => {
    const tasks = [
      { id: 'c', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'a', dependsOn: [] },
    ];
    const graph = buildDependencyGraph(tasks);
    const sorted = topologicalSort(graph);
    assert.equal(sorted.length, 3);
    assert.ok(sorted.indexOf('a') < sorted.indexOf('b'));
    assert.ok(sorted.indexOf('b') < sorted.indexOf('c'));
  });

  it('throws on cyclic dependency', () => {
    // Manually build a cycle
    const graph = new Map();
    graph.set('a', new Set(['b']));
    graph.set('b', new Set(['a']));
    assert.throws(() => topologicalSort(graph), /cycle/i);
  });

  it('handles single node', () => {
    const graph = new Map();
    graph.set('x', new Set());
    const sorted = topologicalSort(graph);
    assert.deepEqual(sorted, ['x']);
  });

  it('handles diamond dependency', () => {
    // a -> b, a -> c, b -> d, c -> d
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'd', dependsOn: ['b', 'c'] },
    ];
    const graph = buildDependencyGraph(tasks);
    const sorted = topologicalSort(graph);
    assert.ok(sorted.indexOf('a') < sorted.indexOf('b'));
    assert.ok(sorted.indexOf('a') < sorted.indexOf('c'));
    assert.ok(sorted.indexOf('b') < sorted.indexOf('d'));
    assert.ok(sorted.indexOf('c') < sorted.indexOf('d'));
  });
});

// ─── groupIntoWaves ─────────────────────────────────────────────────────────

describe('groupIntoWaves', () => {
  it('groups independent tasks into one wave', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: [] },
    ];
    const waves = groupIntoWaves(tasks);
    assert.equal(waves.length, 1);
    assert.equal(waves[0].length, 3);
  });

  it('groups sequential tasks into sequential waves', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
    ];
    const waves = groupIntoWaves(tasks);
    assert.equal(waves.length, 3);
    assert.deepEqual(waves[0], ['a']);
    assert.deepEqual(waves[1], ['b']);
    assert.deepEqual(waves[2], ['c']);
  });

  it('groups diamond dependency correctly', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'd', dependsOn: ['b', 'c'] },
    ];
    const waves = groupIntoWaves(tasks);
    assert.equal(waves.length, 3);
    assert.deepEqual(waves[0], ['a']);
    assert.ok(waves[1].includes('b') && waves[1].includes('c'));
    assert.equal(waves[1].length, 2);
    assert.deepEqual(waves[2], ['d']);
  });

  it('respects maxParallel limit', () => {
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: [] },
      { id: 'd', dependsOn: [] },
    ];
    const waves = groupIntoWaves(tasks, { maxParallel: 2 });
    assert.ok(waves.length >= 2);
    for (const wave of waves) {
      assert.ok(wave.length <= 2, `Wave has ${wave.length} tasks, max is 2`);
    }
  });

  it('handles empty tasks', () => {
    const waves = groupIntoWaves([]);
    assert.deepEqual(waves, []);
  });

  it('handles single task', () => {
    const waves = groupIntoWaves([{ id: 'x', dependsOn: [] }]);
    assert.equal(waves.length, 1);
    assert.deepEqual(waves[0], ['x']);
  });

  it('throws on cyclic dependency', () => {
    const tasks = [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ];
    assert.throws(() => groupIntoWaves(tasks), /cycle/i);
  });

  it('complex multi-level graph', () => {
    // Wave 0: a, e (independent)
    // Wave 1: b (dep a), c (dep a), f (dep e)
    // Wave 2: d (dep b, c)
    const tasks = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'd', dependsOn: ['b', 'c'] },
      { id: 'e', dependsOn: [] },
      { id: 'f', dependsOn: ['e'] },
    ];
    const waves = groupIntoWaves(tasks);
    assert.equal(waves.length, 3);
    // Wave 0: a, e
    assert.ok(waves[0].includes('a') && waves[0].includes('e'));
    // Wave 1: b, c, f
    assert.ok(waves[1].includes('b') && waves[1].includes('c') && waves[1].includes('f'));
    // Wave 2: d
    assert.deepEqual(waves[2], ['d']);
  });
});

// ─── detectFileConflicts ────────────────────────────────────────────────────

describe('detectFileConflicts', () => {
  it('returns empty when no conflicts', () => {
    const wave = [
      { id: 'a', files: ['src/auth.js', 'src/login.js'] },
      { id: 'b', files: ['src/config.js'] },
    ];
    const conflicts = detectFileConflicts(wave);
    assert.deepEqual(conflicts, []);
  });

  it('detects single file conflict', () => {
    const wave = [
      { id: 'a', files: ['src/auth.js'] },
      { id: 'b', files: ['src/auth.js'] },
    ];
    const conflicts = detectFileConflicts(wave);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].file, 'src/auth.js');
    assert.ok(conflicts[0].tasks.includes('a'));
    assert.ok(conflicts[0].tasks.includes('b'));
  });

  it('detects multiple file conflicts', () => {
    const wave = [
      { id: 'a', files: ['f1.js', 'f2.js'] },
      { id: 'b', files: ['f2.js', 'f3.js'] },
      { id: 'c', files: ['f3.js'] },
    ];
    const conflicts = detectFileConflicts(wave);
    assert.equal(conflicts.length, 2);
    const conflictFiles = conflicts.map(c => c.file).sort();
    assert.deepEqual(conflictFiles, ['f2.js', 'f3.js']);
  });

  it('handles tasks with no files', () => {
    const wave = [
      { id: 'a', files: [] },
      { id: 'b' }, // no files property
    ];
    const conflicts = detectFileConflicts(wave);
    assert.deepEqual(conflicts, []);
  });

  it('normalizes Windows paths', () => {
    const wave = [
      { id: 'a', files: ['src\\auth.js'] },
      { id: 'b', files: ['src/auth.js'] },
    ];
    const conflicts = detectFileConflicts(wave);
    assert.equal(conflicts.length, 1);
  });

  it('handles single-task wave (no conflicts possible)', () => {
    const wave = [{ id: 'a', files: ['f1.js', 'f2.js'] }];
    const conflicts = detectFileConflicts(wave);
    assert.deepEqual(conflicts, []);
  });

  it('three-way conflict reported correctly', () => {
    const wave = [
      { id: 'a', files: ['shared.js'] },
      { id: 'b', files: ['shared.js'] },
      { id: 'c', files: ['shared.js'] },
    ];
    const conflicts = detectFileConflicts(wave);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].tasks.length, 3);
  });
});
