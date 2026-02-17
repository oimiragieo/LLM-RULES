#!/usr/bin/env node
/**
 * Memory Manager - Session-Based Memory System
 * =============================================
 */

'use strict';

const path = require('path');
const eventBus = require('../events/event-bus.cjs');
const { EventTypes } = require('../events/event-types.cjs');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { createStorageHelpers } = require('./memory-manager-core-storage.cjs');
const { createRecordingOps } = require('./memory-manager-core-recording.cjs');
const { createReportingOps } = require('./memory-manager-core-reporting.cjs');
const { createCoreOps } = require('./memory-manager-core-ops.cjs');

function emitMemorySavedEvent({ key, value, source }) {
  if (String(process.env.MEMORY_EMIT_EVENTS || 'on').toLowerCase() === 'off') {
    return;
  }
  try {
    const maybePromise = eventBus.emit(EventTypes.MEMORY_SAVED, {
      type: EventTypes.MEMORY_SAVED,
      key,
      value,
      source,
    });
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => {});
    }
  } catch (_e) {
    // Best-effort observability; do not block memory writes.
  }
}

function emitMemoryQueriedEvent({ query, results, latency }) {
  if (String(process.env.MEMORY_EMIT_EVENTS || 'on').toLowerCase() === 'off') {
    return;
  }
  try {
    const maybePromise = eventBus.emit(EventTypes.MEMORY_QUERIED, {
      type: EventTypes.MEMORY_QUERIED,
      query,
      results,
      latency,
    });
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => {});
    }
  } catch (_e) {
    // Best-effort observability; do not block reads.
  }
}

function validateProjectRoot(projectRoot) {
  if (projectRoot !== PROJECT_ROOT) {
    const validation = validatePathWithinProject(projectRoot, PROJECT_ROOT);
    if (!validation.safe) {
      throw new Error(`Invalid projectRoot: ${validation.reason}`);
    }
  }
}

const CONFIG = {
  MAX_CONTEXT_CHARS: {
    gotchas: parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_GOTCHAS || '2000', 10),
    patterns: parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_PATTERNS || '2000', 10),
    decisions: parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_DECISIONS || '2000', 10),
    discoveries: parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_DISCOVERIES || '3000', 10),
    sessions: parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_SESSIONS || '5000', 10),
    legacy: parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_LEGACY || '3000', 10),
  },
  MAX_ITEMS: {
    gotchas: parseInt(process.env.MEMORY_MAX_ITEMS_GOTCHAS || '20', 10),
    patterns: parseInt(process.env.MEMORY_MAX_ITEMS_PATTERNS || '20', 10),
    decisions: parseInt(process.env.MEMORY_MAX_ITEMS_DECISIONS || '10', 10),
    discoveries: parseInt(process.env.MEMORY_MAX_ITEMS_DISCOVERIES || '30', 10),
    sessions: parseInt(process.env.MEMORY_MAX_ITEMS_SESSIONS || '5', 10),
  },
  MAX_SESSIONS: parseInt(process.env.MEMORY_MAX_SESSIONS || '50', 10),
  LEARNINGS_ARCHIVE_THRESHOLD_KB: parseInt(
    process.env.MEMORY_LEARNINGS_ARCHIVE_THRESHOLD_KB || '40',
    10
  ),
  LEARNINGS_KEEP_LINES: parseInt(process.env.MEMORY_LEARNINGS_KEEP_LINES || '50', 10),
  CODEBASE_MAP_TTL_DAYS: parseInt(process.env.MEMORY_CODEBASE_MAP_TTL_DAYS || '90', 10),
  CODEBASE_MAP_MAX_ENTRIES: parseInt(process.env.MEMORY_CODEBASE_MAP_MAX_ENTRIES || '500', 10),
  LEARNINGS_WARN_THRESHOLD_KB: parseInt(process.env.MEMORY_LEARNINGS_WARN_THRESHOLD_KB || '40', 10),
  CODEBASE_MAP_WARN_ENTRIES: parseInt(process.env.MEMORY_CODEBASE_MAP_WARN_ENTRIES || '400', 10),
  DECISIONS_WARN_THRESHOLD_KB: parseInt(process.env.MEMORY_DECISIONS_WARN_THRESHOLD_KB || '80', 10),
};

function getMemoryDir(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'memory');
}

function ensureDir(dirPath) {
  const fs = require('fs');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const storage = createStorageHelpers({
  PROJECT_ROOT,
  validatePathWithinProject,
  validateProjectRoot,
  getMemoryDir,
  ensureDir,
});

const recording = createRecordingOps({
  PROJECT_ROOT,
  validateProjectRoot,
  getMemoryDir,
  ensureDir,
  withFileLockSync: storage.withFileLockSync,
  buildEntryId: storage.buildEntryId,
  normalizeArea: storage.normalizeArea,
  maybeSyncMemoryJson: storage.maybeSyncMemoryJson,
  emitMemorySavedEvent,
});

const reporting = createReportingOps({
  PROJECT_ROOT,
  CONFIG,
  getMemoryDir,
});

const ops = createCoreOps({
  PROJECT_ROOT,
  CONFIG,
  validateProjectRoot,
  getMemoryDir,
  ensureDir,
  emitMemorySavedEvent,
  emitMemoryQueriedEvent,
  withFileLockSync: storage.withFileLockSync,
  buildEntryId: storage.buildEntryId,
  normalizeArea: storage.normalizeArea,
  maybeSyncMemoryJson: storage.maybeSyncMemoryJson,
  loadMemoryArray: storage.loadMemoryArray,
  writeMemoryArray: storage.writeMemoryArray,
  normalizeEntryIds: storage.normalizeEntryIds,
  deleteMemoryByIds: storage.deleteMemoryByIds,
  recordGotcha: recording.recordGotcha,
  recordPattern: recording.recordPattern,
  recordDiscovery: recording.recordDiscovery,
  getMemoryHealth: reporting.getMemoryHealth,
  getMemoryStats: reporting.getMemoryStats,
});

module.exports = {
  getMemoryDir,
  getNamedMemoryDir: storage.getNamedMemoryDir,
  getCurrentSessionNumber: ops.getCurrentSessionNumber,
  recordGotcha: recording.recordGotcha,
  recordPattern: recording.recordPattern,
  recordDiscovery: recording.recordDiscovery,
  loadMemoryForContext: ops.loadMemoryForContext,
  formatMemoryAsMarkdown: ops.formatMemoryAsMarkdown,
  getMemoryStats: reporting.getMemoryStats,
  getMemoryHealth: reporting.getMemoryHealth,
  checkAndArchiveLearnings: ops.checkAndArchiveLearnings,
  pruneCodebaseMap: ops.pruneCodebaseMap,
  searchMemory: ops.searchMemory,
  forgetMemoryByQuery: ops.forgetMemoryByQuery,
  deleteMemoryByIds: storage.deleteMemoryByIds,
  readMemory: storage.readMemory,
  writeMemory: storage.writeMemory,
  listMemories: storage.listMemories,
  deleteMemory: storage.deleteMemory,
  CONFIG,
  readMemoryAsync: ops.readMemoryAsync,
  atomicWriteAsync: ops.atomicWriteAsync,
  ensureDirAsync: ops.ensureDirAsync,
  recordGotchaAsync: ops.recordGotchaAsync,
  recordPatternAsync: ops.recordPatternAsync,
  loadMemoryForContextAsync: ops.loadMemoryForContextAsync,
  findEntities: ops.findEntities,
  getRelated: ops.getRelated,
};
