'use strict';

/**
 * Groups tasks into dependency waves using Kahn's algorithm (topological sort).
 *
 * @param {Array<{id: string, blockedBy: string[]}>} tasks
 * @returns {{ waves: string[][], orphans: string[] }}
 * @throws {Error} if circular dependencies are detected
 */
function analyzeWaves(tasks) {
  if (!tasks || tasks.length === 0) {
    return { waves: [], orphans: [] };
  }

  const knownIds = new Set(tasks.map(t => t.id));

  // Separate orphans (tasks with unknown blockedBy refs) from processable tasks
  const orphans = [];
  const processable = [];

  for (const task of tasks) {
    const unknownDeps = task.blockedBy.filter(dep => !knownIds.has(dep));
    if (unknownDeps.length > 0) {
      orphans.push(task.id);
    } else {
      processable.push(task);
    }
  }

  // Build in-degree map and adjacency list for Kahn's algorithm
  const inDegree = new Map();
  const dependents = new Map(); // id -> list of tasks that depend on id

  for (const task of processable) {
    inDegree.set(task.id, task.blockedBy.length);
    if (!dependents.has(task.id)) {
      dependents.set(task.id, []);
    }
    for (const dep of task.blockedBy) {
      if (!dependents.has(dep)) {
        dependents.set(dep, []);
      }
      dependents.get(dep).push(task.id);
    }
  }

  const waves = [];
  let queue = processable.filter(t => inDegree.get(t.id) === 0).map(t => t.id);
  let processed = 0;

  while (queue.length > 0) {
    waves.push([...queue]);
    processed += queue.length;

    const nextQueue = [];
    for (const id of queue) {
      for (const dependent of dependents.get(id) || []) {
        const newDegree = inDegree.get(dependent) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          nextQueue.push(dependent);
        }
      }
    }
    queue = nextQueue;
  }

  if (processed < processable.length) {
    throw new Error('Circular dependency detected among tasks');
  }

  return { waves, orphans };
}

module.exports = { analyzeWaves };
