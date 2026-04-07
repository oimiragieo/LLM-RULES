'use strict';

/**
 * Wave-Based Parallel Execution Grouper
 *
 * Groups tasks into waves based on dependency graphs for parallel execution.
 * Independent tasks run in the same wave; dependent tasks run in sequential waves.
 *
 * Features:
 *   - Topological sort with cycle detection
 *   - Wave assignment by dependency depth
 *   - File conflict detection within waves
 *   - Configurable max parallel tasks per wave
 *
 * @module wave-grouper
 */

const DEFAULT_MAX_PARALLEL = 4;

/**
 * Build a dependency graph from a task list.
 * Each task: { id: string, dependsOn?: string[] }
 * Returns Map<taskId, Set<dependencyId>> with only known task IDs.
 *
 * @param {Array<{ id: string, dependsOn?: string[] }>} tasks
 * @returns {Map<string, Set<string>>}
 */
function buildDependencyGraph(tasks) {
  const knownIds = new Set(tasks.map(t => t.id));
  const graph = new Map();

  for (const task of tasks) {
    const deps = new Set();
    const rawDeps = Array.isArray(task.dependsOn) ? task.dependsOn : [];
    for (const dep of rawDeps) {
      if (knownIds.has(dep)) {
        deps.add(dep);
      }
    }
    graph.set(task.id, deps);
  }

  return graph;
}

/**
 * Topological sort using Kahn's algorithm.
 * Throws if a cycle is detected.
 *
 * @param {Map<string, Set<string>>} graph
 * @returns {string[]} sorted task IDs
 */
function topologicalSort(graph) {
  // Compute in-degrees
  const inDegree = new Map();
  for (const [node] of graph) {
    inDegree.set(node, 0);
  }
  // graph.get(node) = set of nodes that `node` depends on
  // So an edge goes from dep -> node (dep must come first)
  // in-degree of node = graph.get(node).size
  for (const [node, deps] of graph) {
    inDegree.set(node, deps.size);
  }

  const queue = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }

  // Build reverse adjacency: for each dep, who depends on it?
  const dependents = new Map();
  for (const [node] of graph) {
    dependents.set(node, []);
  }
  for (const [node, deps] of graph) {
    for (const dep of deps) {
      if (dependents.has(dep)) {
        dependents.get(dep).push(node);
      }
    }
  }

  const sorted = [];
  while (queue.length > 0) {
    // Sort queue for deterministic output
    queue.sort();
    const node = queue.shift();
    sorted.push(node);

    for (const dependent of dependents.get(node) || []) {
      const newDeg = inDegree.get(dependent) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) {
        queue.push(dependent);
      }
    }
  }

  if (sorted.length !== graph.size) {
    throw new Error(
      `Cycle detected in dependency graph. Sorted ${sorted.length} of ${graph.size} tasks.`
    );
  }

  return sorted;
}

/**
 * Group tasks into execution waves based on dependencies.
 * Wave N contains only tasks whose dependencies are all in waves < N.
 *
 * @param {Array<{ id: string, dependsOn?: string[] }>} tasks
 * @param {{ maxParallel?: number }} [opts]
 * @returns {string[][]} array of waves, each wave is an array of task IDs
 */
function groupIntoWaves(tasks, opts = {}) {
  if (!tasks || tasks.length === 0) return [];

  const maxParallel =
    typeof opts.maxParallel === 'number' && opts.maxParallel > 0
      ? opts.maxParallel
      : DEFAULT_MAX_PARALLEL;

  const graph = buildDependencyGraph(tasks);

  // Verify no cycles (topologicalSort throws on cycle)
  topologicalSort(graph);

  // Compute wave depth for each task
  // depth(task) = 0 if no dependencies, else max(depth(dep) for dep in deps) + 1
  const depth = new Map();

  function getDepth(taskId) {
    if (depth.has(taskId)) return depth.get(taskId);

    const deps = graph.get(taskId);
    if (!deps || deps.size === 0) {
      depth.set(taskId, 0);
      return 0;
    }

    let maxDepth = 0;
    for (const dep of deps) {
      maxDepth = Math.max(maxDepth, getDepth(dep) + 1);
    }
    depth.set(taskId, maxDepth);
    return maxDepth;
  }

  for (const [taskId] of graph) {
    getDepth(taskId);
  }

  // Group by depth
  const waveMap = new Map();
  for (const [taskId, d] of depth) {
    if (!waveMap.has(d)) waveMap.set(d, []);
    waveMap.get(d).push(taskId);
  }

  // Sort wave keys and build ordered waves
  const waveKeys = [...waveMap.keys()].sort((a, b) => a - b);
  const rawWaves = waveKeys.map(k => {
    const wave = waveMap.get(k);
    wave.sort(); // deterministic order within wave
    return wave;
  });

  // Apply maxParallel: split waves that exceed the limit
  const waves = [];
  for (const wave of rawWaves) {
    if (wave.length <= maxParallel) {
      waves.push(wave);
    } else {
      for (let i = 0; i < wave.length; i += maxParallel) {
        waves.push(wave.slice(i, i + maxParallel));
      }
    }
  }

  return waves;
}

/**
 * Detect file conflicts within a wave — two or more tasks editing the same file.
 *
 * @param {Array<{ id: string, files?: string[] }>} waveTasks
 * @returns {Array<{ file: string, tasks: string[] }>} conflicts
 */
function detectFileConflicts(waveTasks) {
  const fileToTasks = new Map();

  for (const task of waveTasks) {
    const files = Array.isArray(task.files) ? task.files : [];
    for (const rawFile of files) {
      // Normalize Windows paths (SE-01)
      const file = rawFile.replace(/\\/g, '/');
      if (!fileToTasks.has(file)) fileToTasks.set(file, []);
      fileToTasks.get(file).push(task.id);
    }
  }

  const conflicts = [];
  for (const [file, tasks] of fileToTasks) {
    if (tasks.length > 1) {
      conflicts.push({ file, tasks: [...tasks] });
    }
  }

  return conflicts;
}

/**
 * Feature-flagged: analyze waves from TaskList-style tasks (blockedBy field).
 * Uses wave-analyzer.cjs for tasks that come from Claude Code's task system.
 *
 * @param {Array<{id: string, blockedBy: string[]}>} tasks
 * @returns {{ waves: string[][], orphans: string[] }}
 */
function analyzeTaskListWaves(tasks) {
  if (process.env.WAVE_SCHEDULING !== 'true') {
    return { waves: [tasks.map(t => t.id)], orphans: [] };
  }
  try {
    const { analyzeWaves } = require('../utils/wave-analyzer.cjs');
    return analyzeWaves(tasks);
  } catch {
    // fail-open: single wave with all tasks
    return { waves: [tasks.map(t => t.id)], orphans: [] };
  }
}

module.exports = {
  groupIntoWaves,
  analyzeTaskListWaves,
  detectFileConflicts,
  buildDependencyGraph,
  topologicalSort,
  DEFAULT_MAX_PARALLEL,
};
