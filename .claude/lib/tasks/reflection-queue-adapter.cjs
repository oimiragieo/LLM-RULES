'use strict';

/**
 * reflection-queue-adapter.cjs — D2 Task ID Unification Adapter
 *
 * Bridges the reflection queue (reflection-spawn-request.json) with the Task system
 * during the v3.x → v4.0.0 migration window.
 *
 * Public API:
 *   enqueueReflection({description, prompt, source?}) → {id, legacyId}
 *   drainReflectionQueue(ids: string[]) → void
 *   listReflections() → ReflectionEntry[]
 *
 * Decision: D2 — reflection queue entries ARE Task system tasks.
 * Legacy reflection-spawn-request.json remains readable during migration.
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/** Path to legacy JSON queue — override for tests via env var. */
const DEFAULT_LEGACY_QUEUE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'reflection-spawn-request.json'
);

// Resolved at call time (not module load) so tests can set env vars before loading.
function getLegacyQueuePath() {
  return process.env.D2_LEGACY_QUEUE_PATH_OVERRIDE || DEFAULT_LEGACY_QUEUE_PATH;
}

// --------------------------------------------------------------------------
// Task store resolution
// --------------------------------------------------------------------------

/**
 * Load the task store module.
 * Prefers the full task-manager.cjs if present; falls back to stub task-store.cjs.
 *
 * @returns {{ createTask: Function, completeTask: Function, listTasks: Function }}
 */
function getTaskStore() {
  const managerPath = path.join(__dirname, 'task-manager.cjs');
  if (fs.existsSync(managerPath)) {
    return require('./task-manager.cjs');
  }
  return require('./task-store.cjs');
}

// --------------------------------------------------------------------------
// Legacy queue helpers
// --------------------------------------------------------------------------

/**
 * Read the legacy JSON queue entries.
 *
 * @returns {LegacyEntry[]}
 */
function readLegacyQueue() {
  const qp = getLegacyQueuePath();
  try {
    if (!fs.existsSync(qp)) return [];
    const raw = fs.readFileSync(qp, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Write the legacy JSON queue entries atomically.
 *
 * @param {LegacyEntry[]} entries
 */
function writeLegacyQueue(entries) {
  const qp = getLegacyQueuePath();
  const dir = path.dirname(qp);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = qp + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(tmp, qp);
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * @typedef {Object} LegacyEntry
 * @property {string} id
 * @property {string} description
 * @property {string} [prompt]
 * @property {string} [source]
 * @property {string} timestamp
 */

/**
 * @typedef {Object} EnqueueResult
 * @property {string} id - Real task ID (also used as legacyId for v4.0.0 bootstrap)
 * @property {string} legacyId - Same as id during migration window
 */

/**
 * Enqueue a reflection request as a real Task.
 *
 * Creates a task in the task store and mirrors the entry into the legacy
 * reflection-spawn-request.json for backward compatibility during migration.
 *
 * Idempotent: if an active task with the same description already exists,
 * returns the existing task ID without creating a duplicate.
 *
 * @param {{ description: string, prompt: string, source?: string }} opts
 * @returns {EnqueueResult}
 */
function enqueueReflection({ description, prompt, source = 'reflection-queue-adapter' }) {
  if (!description || typeof description !== 'string') {
    throw new TypeError('enqueueReflection: description must be a non-empty string');
  }
  if (!prompt || typeof prompt !== 'string') {
    throw new TypeError('enqueueReflection: prompt must be a non-empty string');
  }

  const store = getTaskStore();

  // --------------------------------------------------------------------------
  // Idempotency check: find existing active task with same description
  // --------------------------------------------------------------------------
  const existing = store.listTasks({
    filter: { metadata: { type: 'reflection' } },
  });
  const dup = existing.find(
    t => t.metadata?.description === description && t.status !== 'completed'
  );
  if (dup) {
    return { id: dup.id, legacyId: dup.id };
  }

  // --------------------------------------------------------------------------
  // Create real task
  // --------------------------------------------------------------------------
  const task = store.createTask({
    subject: `Reflection: ${description}`,
    description: prompt,
    metadata: {
      type: 'reflection',
      description,
      source,
      legacyQueuePath: getLegacyQueuePath(),
    },
  });

  // --------------------------------------------------------------------------
  // Mirror to legacy JSON queue
  // --------------------------------------------------------------------------
  const queue = readLegacyQueue();
  // Remove any stale legacy entry with the same description before adding
  const filtered = queue.filter(e => e.description !== description);
  /** @type {LegacyEntry} */
  const legacyEntry = {
    id: task.id,
    description,
    prompt,
    source,
    timestamp: task.createdAt,
  };
  filtered.push(legacyEntry);
  writeLegacyQueue(filtered);

  return { id: task.id, legacyId: task.id };
}

/**
 * Drain processed reflection IDs: mark tasks completed and remove legacy queue entries.
 *
 * This is the drain path called when `reflection-cleanup.cjs` processes
 * `metadata.processedReflectionIds` from a `TaskUpdate(completed)` event.
 *
 * @param {string[]} ids - Task IDs to drain
 * @returns {void}
 */
function drainReflectionQueue(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;

  const store = getTaskStore();
  const idSet = new Set(ids);

  // Mark tasks completed
  for (const id of idSet) {
    try {
      store.completeTask(id);
    } catch (_) {
      // Best effort — task may not exist in store (legacy-only entry)
    }
  }

  // Remove from legacy JSON queue
  const queue = readLegacyQueue();
  const remaining = queue.filter(e => !idSet.has(e.id));
  writeLegacyQueue(remaining);
}

/**
 * @typedef {Object} ReflectionEntry
 * @property {string} id
 * @property {string} description
 * @property {string} [prompt]
 * @property {string} [source]
 * @property {'pending'|'in_progress'|'completed'|'legacy'} status
 * @property {string} timestamp
 */

/**
 * List all active reflections: merges Task store entries (type=reflection)
 * with legacy JSON queue entries. Results are deduped by ID.
 *
 * @returns {ReflectionEntry[]}
 */
function listReflections() {
  const store = getTaskStore();
  const seen = new Set();

  /** @type {ReflectionEntry[]} */
  const results = [];

  // Task store entries (authoritative)
  const taskEntries = store.listTasks({ filter: { metadata: { type: 'reflection' } } });
  for (const t of taskEntries) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    results.push({
      id: t.id,
      description: t.metadata?.description || t.subject,
      prompt: t.description,
      source: t.metadata?.source,
      status: t.status,
      timestamp: t.createdAt,
    });
  }

  // Legacy JSON queue entries (read-through for migration window)
  const legacyEntries = readLegacyQueue();
  for (const e of legacyEntries) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    results.push({
      id: e.id,
      description: e.description,
      prompt: e.prompt,
      source: e.source,
      status: 'legacy',
      timestamp: e.timestamp,
    });
  }

  return results;
}

module.exports = {
  enqueueReflection,
  drainReflectionQueue,
  listReflections,
  /** Exposed for tests / consumers that need the resolved legacy queue path. */
  getLegacyQueuePath,
};
