'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');

const DEFAULT_STORE = {
  tasks: [],
  meta: {},
};

function getStorePath(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'scheduler', 'tasks.json');
}

function loadStore(projectRoot = PROJECT_ROOT) {
  const filePath = getStorePath(projectRoot);
  if (!fs.existsSync(filePath)) return { ...DEFAULT_STORE };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
    };
  } catch (_e) {
    return { ...DEFAULT_STORE };
  }
}

function saveStore(store, projectRoot = PROJECT_ROOT) {
  const filePath = getStorePath(projectRoot);
  const safe = {
    tasks: Array.isArray(store.tasks) ? store.tasks : [],
    meta: store.meta && typeof store.meta === 'object' ? store.meta : {},
  };
  atomicWriteJSONSync(filePath, safe);
  return safe;
}

function listTasks(projectRoot = PROJECT_ROOT) {
  return loadStore(projectRoot).tasks;
}

function addTask(task, projectRoot = PROJECT_ROOT) {
  const store = loadStore(projectRoot);
  const id = task.id || crypto.randomUUID();
  const nextRunAt = task.nextRunAt || task.runAt || null;
  store.tasks.push({
    id,
    name: task.name || 'Unnamed task',
    type: task.type || 'once',
    nextRunAt,
    cronExpr: task.cronExpr || null,
    payload: task.payload || {},
  });
  saveStore(store, projectRoot);
  return id;
}

function removeTask(id, projectRoot = PROJECT_ROOT) {
  const store = loadStore(projectRoot);
  const before = store.tasks.length;
  store.tasks = store.tasks.filter(task => task.id !== id);
  saveStore(store, projectRoot);
  return before !== store.tasks.length;
}

function parseCronIntervalMs(cronExpr) {
  if (!cronExpr || typeof cronExpr !== 'string') return null;
  const match = cronExpr.trim().match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes * 60 * 1000;
}

function computeNextRunAt(task, now = Date.now()) {
  if (task.type === 'once') return null;
  if (task.payload && Number.isFinite(task.payload.intervalMs)) {
    return new Date(now + Number(task.payload.intervalMs)).toISOString();
  }
  if (task.payload && Number.isFinite(task.payload.intervalMinutes)) {
    return new Date(now + Number(task.payload.intervalMinutes) * 60 * 1000).toISOString();
  }
  const intervalMs = parseCronIntervalMs(task.cronExpr);
  if (intervalMs) return new Date(now + intervalMs).toISOString();
  return task.nextRunAt || null;
}

function getDueTasks(projectRoot = PROJECT_ROOT, now = Date.now()) {
  const store = loadStore(projectRoot);
  const due = [];
  for (const task of store.tasks) {
    if (!task.nextRunAt) continue;
    const next = Date.parse(task.nextRunAt);
    if (Number.isFinite(next) && next <= now) {
      due.push(task);
    }
  }
  return due;
}

module.exports = {
  getStorePath,
  loadStore,
  saveStore,
  listTasks,
  addTask,
  removeTask,
  getDueTasks,
  computeNextRunAt,
};
