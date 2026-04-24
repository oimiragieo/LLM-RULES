'use strict';

/**
 * task-store.cjs — Minimal stub task store for v4.0.0 bootstrap
 *
 * Used by reflection-queue-adapter.cjs when task-manager.cjs is absent.
 * Persists tasks to `.claude/context/runtime/v4-tasks.json` using atomic writes.
 *
 * This stub is intentionally minimal. It will be replaced by the full
 * task-manager.cjs in Phase 3 of the v4.0.0 migration.
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

/** @type {string} */
const DEFAULT_STORE_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'v4-tasks.json'
);

/**
 * Generate a unique task ID.
 * Format: `task-<timestamp>-<random4>`
 *
 * @returns {string}
 */
function generateTaskId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `task-${ts}-${rand}`;
}

/**
 * Read all tasks from the store.
 *
 * @returns {Task[]}
 */
function readStore() {
  const storePath = process.env.D2_TASK_STORE_PATH_OVERRIDE || DEFAULT_STORE_PATH;
  try {
    if (!fs.existsSync(storePath)) return [];
    const raw = fs.readFileSync(storePath, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Atomically write tasks to the store.
 *
 * @param {Task[]} tasks
 */
function writeStore(tasks) {
  const storePath = process.env.D2_TASK_STORE_PATH_OVERRIDE || DEFAULT_STORE_PATH;
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = storePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), 'utf8');
  fs.renameSync(tmp, storePath);
}

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} subject
 * @property {string} description
 * @property {'pending'|'in_progress'|'completed'} status
 * @property {Record<string, unknown>} metadata
 * @property {string} createdAt
 * @property {string|null} completedAt
 */

/**
 * Create a new task in the store.
 *
 * @param {{ subject: string, description: string, metadata?: Record<string,unknown> }} opts
 * @returns {Task}
 */
function createTask({ subject, description, metadata = {} }) {
  const tasks = readStore();
  /** @type {Task} */
  const task = {
    id: generateTaskId(),
    subject,
    description,
    status: 'pending',
    metadata,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  tasks.push(task);
  writeStore(tasks);
  return task;
}

/**
 * Mark a task as completed.
 *
 * @param {string} id
 * @returns {boolean} true if the task was found and updated
 */
function completeTask(id) {
  const tasks = readStore();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return false;
  tasks[idx] = { ...tasks[idx], status: 'completed', completedAt: new Date().toISOString() };
  writeStore(tasks);
  return true;
}

/**
 * List tasks, optionally filtered.
 *
 * @param {{ filter?: Partial<Task> }} [opts]
 * @returns {Task[]}
 */
function listTasks({ filter = {} } = {}) {
  const tasks = readStore();
  if (!filter || Object.keys(filter).length === 0) return tasks;
  return tasks.filter(t => {
    return Object.entries(filter).every(([k, v]) => {
      if (k === 'metadata' && v && typeof v === 'object') {
        return Object.entries(v).every(([mk, mv]) => t.metadata?.[mk] === mv);
      }
      return t[k] === v;
    });
  });
}

module.exports = { createTask, completeTask, listTasks, generateTaskId };
