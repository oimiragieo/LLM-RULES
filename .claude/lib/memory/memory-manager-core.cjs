#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const eventBus = require('../events/event-bus.cjs');
const { EventTypes } = require('../events/event-types.cjs');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { createStorageHelpers } = require('./memory-manager-core-storage.cjs');
const { createRecordingOps } = require('./memory-manager-core-recording.cjs');
const { createReportingOps } = require('./memory-manager-core-reporting.cjs');
const {
  atomicWriteSync,
  atomicWriteAsync: atomicWriteAsyncWithLock,
} = require('../utils/atomic-write.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { recordMemoryOperation } = require('./memory-slo-metrics.cjs');
const { sanitizeMemoryContent } = require('./memory-sanitizer.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const logger = createLogger('memory-manager');
const asyncWriteQueue = new Map();

function _emitEvent(eventType, payload) {
  if (String(process.env.MEMORY_EMIT_EVENTS || 'on').toLowerCase() === 'off') return;
  try {
    const p = eventBus.emit(eventType, { type: eventType, ...payload });
    if (p && typeof p.catch === 'function') {
      p.catch(err => {
        if (process.env.MEMORY_DEBUG) {
          logger.warn('Event emission failed', {
            eventType,
            error: err?.message || String(err),
          });
        }
      });
    }
  } catch (_e) {
    // Best-effort observability; do not block memory operations.
  }
}

function emitMemorySavedEvent({ key, value, source }) {
  _emitEvent(EventTypes.MEMORY_SAVED, { key, value, source });
}

function emitMemoryQueriedEvent({ query, results, latency }) {
  _emitEvent(EventTypes.MEMORY_QUERIED, { query, results, latency });
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

function getCurrentSessionNumber(memoryDir) {
  const sessionsDir = path.join(memoryDir, 'sessions');
  ensureDir(sessionsDir);
  const files = fs
    .readdirSync(sessionsDir)
    .filter(f => f.match(/^session_\d{3}\.json$/))
    .sort();
  if (files.length === 0) return 1;
  const match = files[files.length - 1].match(/session_(\d{3})\.json/);
  return match ? parseInt(match[1], 10) + 1 : 1;
}

function checkAndArchiveLearnings(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  const learningsPath = path.join(memoryDir, 'learnings.md');
  const archiveDir = path.join(memoryDir, 'archive');
  ensureDir(archiveDir);

  const result = { archived: false, archivedBytes: 0, archivePath: null };

  if (!fs.existsSync(learningsPath)) return result;

  const stats = fs.statSync(learningsPath);
  const thresholdBytes = CONFIG.LEARNINGS_ARCHIVE_THRESHOLD_KB * 1024;
  if (stats.size <= thresholdBytes) return result;

  const lines = fs.readFileSync(learningsPath, 'utf8').split('\n');
  const linesToKeep = CONFIG.LEARNINGS_KEEP_LINES;
  if (lines.length <= linesToKeep) return result;

  const archiveContent = lines.slice(0, -linesToKeep).join('\n');
  const keepContent = lines.slice(-linesToKeep).join('\n');

  const archiveResult = sanitizeMemoryContent(archiveContent);
  const keepResult = sanitizeMemoryContent(keepContent);

  if (!archiveResult.safe) {
    logger.warn('Memory sanitizer detected dangerous content in archive', {
      detections: archiveResult.detections,
    });
    throw new Error(
      `Archive blocked: dangerous content detected (${archiveResult.detections.join(', ')})`
    );
  }
  if (!keepResult.safe) {
    logger.warn('Memory sanitizer detected dangerous content in keep content', {
      detections: keepResult.detections,
    });
    throw new Error(
      `Archive blocked: dangerous content detected (${keepResult.detections.join(', ')})`
    );
  }

  const archiveFilename = `learnings-${new Date().toISOString().slice(0, 7)}.md`;
  result.archivePath = path.join(archiveDir, archiveFilename);
  fs.appendFileSync(result.archivePath, archiveResult.original + '\n\n');
  atomicWriteSync(learningsPath, keepResult.original);
  result.archived = true;
  result.archivedBytes = archiveContent.length;

  if (process.env.MEMORY_DEBUG || process.env.DEBUG_HOOKS) {
    logger.info(`Archived ${result.archivedBytes} bytes`, { archivePath: result.archivePath });
  }
  return result;
}

function _pruneOldSessions(sessionsDir) {
  const files = fs
    .readdirSync(sessionsDir)
    .filter(f => f.match(/^session_\d{3}\.json$/))
    .sort();
  if (files.length > CONFIG.MAX_SESSIONS) {
    for (const file of files.slice(0, files.length - CONFIG.MAX_SESSIONS)) {
      fs.unlinkSync(path.join(sessionsDir, file));
    }
  }
}

function _sanitizeMapField(fieldValue, fieldName, entryPath) {
  const result = sanitizeMemoryContent(String(fieldValue));
  if (!result.safe) {
    logger.warn(`Memory sanitizer detected dangerous content in codebase_map ${fieldName}`, {
      path: entryPath,
      detections: result.detections,
    });
    throw new Error(
      `Codebase map write blocked: dangerous content in ${fieldName} (${result.detections.join(', ')})`
    );
  }
  return result.sanitized;
}

function pruneCodebaseMap(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  const mapPath = path.join(memoryDir, 'codebase_map.json');
  const result = { prunedByTTL: 0, prunedBySize: 0, totalPruned: 0 };

  if (!fs.existsSync(mapPath)) return result;

  let codebaseMap;
  try {
    const content = fs.readFileSync(mapPath, 'utf8');
    codebaseMap = safeParseJSON(content, null, null, null);
    if (!codebaseMap || typeof codebaseMap !== 'object' || Array.isArray(codebaseMap)) {
      logger.warn('pruneCodebaseMap: invalid codebase_map structure, skipping prune');
      return result;
    }
  } catch (_e) {
    return result;
  }

  if (!codebaseMap.discovered_files) return result;

  const now = new Date();
  const ttlMs = CONFIG.CODEBASE_MAP_TTL_DAYS * 24 * 60 * 60 * 1000;
  const maxEntries = CONFIG.CODEBASE_MAP_MAX_ENTRIES;

  for (const [_key, value] of Object.entries(codebaseMap.discovered_files)) {
    if (!value.last_accessed) value.last_accessed = value.discovered_at || now.toISOString();
  }

  let entries = Object.entries(codebaseMap.discovered_files).map(([entryPath, info]) => ({
    path: entryPath,
    ...info,
    accessDate: new Date(info.last_accessed),
  }));

  const initialCount = entries.length;
  const ttlCutoff = new Date(now - ttlMs);
  entries = entries.filter(entry => {
    const keep = entry.accessDate >= ttlCutoff;
    if (!keep) result.prunedByTTL += 1;
    return keep;
  });

  if (entries.length > maxEntries) {
    entries.sort((a, b) => a.accessDate - b.accessDate);
    result.prunedBySize = entries.length - maxEntries;
    entries = entries.slice(result.prunedBySize);
  }

  result.totalPruned = initialCount - entries.length;

  const newDiscoveredFiles = {};
  for (const entry of entries) {
    const { path: entryPath, _accessDate, ...info } = entry;
    if (info.description)
      info.description = _sanitizeMapField(info.description, 'description', entryPath);
    if (info.category) info.category = _sanitizeMapField(info.category, 'category', entryPath);
    newDiscoveredFiles[entryPath] = info;
  }

  codebaseMap.discovered_files = newDiscoveredFiles;
  codebaseMap.last_updated = now.toISOString();
  atomicWriteSync(mapPath, JSON.stringify(codebaseMap, null, 2) + '\n');

  if (result.totalPruned > 0) {
    logger.info(`Pruned ${result.totalPruned} codebase_map entries`, {
      prunedByTTL: result.prunedByTTL,
      prunedBySize: result.prunedBySize,
    });
  }
  return result;
}

function _countLoadedItems(result) {
  return ['gotchas', 'patterns', 'decisions', 'discoveries', 'recent_sessions'].reduce(
    (sum, key) => sum + (Array.isArray(result[key]) ? result[key].length : 0),
    0
  );
}

function _recordReadOp(started, projectRoot) {
  recordMemoryOperation(
    { kind: 'read', ok: true, readLatencyMs: Date.now() - started },
    projectRoot
  );
}

let _ContextualMemoryClass = null;
function getContextualMemoryClass() {
  if (_ContextualMemoryClass) return _ContextualMemoryClass;
  const loaded = require('./contextual-memory.cjs');
  if (!loaded || typeof loaded.ContextualMemory !== 'function') {
    throw new Error('ContextualMemory module unavailable');
  }
  _ContextualMemoryClass = loaded.ContextualMemory;
  return _ContextualMemoryClass;
}

function loadMemoryForContext(projectRoot = PROJECT_ROOT) {
  const started = Date.now();
  validateProjectRoot(projectRoot);
  const ContextualMemory = getContextualMemoryClass();
  const memory = new ContextualMemory({ projectRoot });
  const result = memory.loadContextSync({
    maxItems: CONFIG.MAX_ITEMS,
    maxChars: CONFIG.MAX_CONTEXT_CHARS,
  });
  emitMemoryQueriedEvent({
    query: 'context:loadMemoryForContext',
    results: _countLoadedItems(result),
    latency: Date.now() - started,
  });
  _recordReadOp(started, projectRoot);
  return result;
}

async function loadMemoryForContextAsync(projectRoot = PROJECT_ROOT) {
  const started = Date.now();
  validateProjectRoot(projectRoot);
  const ContextualMemory = getContextualMemoryClass();
  const memory = new ContextualMemory({ projectRoot });
  const result = await memory.loadContext({
    maxItems: CONFIG.MAX_ITEMS,
    maxChars: CONFIG.MAX_CONTEXT_CHARS,
  });
  emitMemoryQueriedEvent({
    query: 'context:loadMemoryForContextAsync',
    results: _countLoadedItems(result),
    latency: Date.now() - started,
  });
  _recordReadOp(started, projectRoot);
  return result;
}

async function readMemoryAsync(file) {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function atomicWriteAsync(filePath, data) {
  const previous = asyncWriteQueue.get(filePath) || Promise.resolve();
  const queued = previous
    .catch(err => {
      if (process.env.MEMORY_DEBUG) {
        logger.warn('Previous queued write failed', {
          filePath,
          error: err?.message || String(err),
        });
      }
    })
    .then(() => atomicWriteAsyncWithLock(filePath, data, 'utf8'));
  asyncWriteQueue.set(filePath, queued);
  try {
    await queued;
  } finally {
    if (asyncWriteQueue.get(filePath) === queued) asyncWriteQueue.delete(filePath);
  }
}

async function ensureDirAsync(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function recordGotchaAsync(gotcha, projectRoot = PROJECT_ROOT) {
  return recording.recordGotcha(gotcha, projectRoot);
}

async function recordPatternAsync(pattern, projectRoot = PROJECT_ROOT) {
  return recording.recordPattern(pattern, projectRoot);
}

function formatMemoryAsMarkdown(projectRoot = PROJECT_ROOT) {
  const memory = loadMemoryForContext(projectRoot);
  const sections = [
    '# Project Memory Context\n',
    '_Loaded with read-time truncation for context efficiency_\n',
  ];

  if (memory.gotchas.length > 0) {
    sections.push('## Gotchas (Pitfalls to Avoid)\n');
    for (const g of memory.gotchas) sections.push(`- ${g.text}`);
    sections.push('');
  }
  if (memory.patterns.length > 0) {
    sections.push('## Patterns (Reusable Solutions)\n');
    for (const p of memory.patterns) sections.push(`- ${p.text}`);
    sections.push('');
  }
  if (memory.discoveries.length > 0) {
    sections.push('## Codebase Discoveries\n');
    for (const d of memory.discoveries) sections.push(`- \`${d.path}\`: ${d.description}`);
    sections.push('');
  }
  if (memory.recent_sessions.length > 0) {
    sections.push('## Recent Sessions\n');
    for (const s of memory.recent_sessions) {
      sections.push(`### Session ${s.session_number} (${s.timestamp?.split('T')[0] || 'unknown'})`);
      if (s.summary) sections.push(s.summary);
      if (s.tasks_completed?.length > 0) sections.push('Tasks: ' + s.tasks_completed.join(', '));
      sections.push('');
    }
  }
  return sections.join('\n');
}

async function _callContextualMemory(method, args) {
  try {
    const ContextualMemory = getContextualMemoryClass();
    const memory = new ContextualMemory();
    const results = await memory[method](...args);
    memory.close();
    return results;
  } catch (err) {
    if (process.env.MEMORY_DEBUG)
      logger.error(`ContextualMemory ${method} failed`, { error: err.message });
    return [];
  }
}

async function searchMemory(query, options = {}) {
  return _callContextualMemory('search', [query, options]);
}

async function findEntities(type, filters = {}) {
  return _callContextualMemory('findEntities', [type, filters]);
}

async function getRelated(id, options = {}) {
  return _callContextualMemory('getRelated', [id, options]);
}

async function forgetMemoryByQuery(query, options = {}, projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  const { threshold, limit = 20, area } = options || {};
  const memoryDir = getMemoryDir(projectRoot);
  const gotchasFile = path.join(memoryDir, 'gotchas.json');
  const patternsFile = path.join(memoryDir, 'patterns.json');

  let results = [];
  try {
    results = await searchMemory(query, { limit, threshold, area: storage.normalizeArea(area) });
  } catch (_e) {
    results = [];
  }

  const candidateTexts = new Set(results.map(r => String(r?.content || '').trim()).filter(Boolean));
  const ids = new Set();
  const removeByText = entry => {
    if (!entry || typeof entry.text !== 'string') return false;
    if (!candidateTexts.has(entry.text.trim())) return false;
    return !area || entry.area === storage.normalizeArea(area);
  };

  for (const [file, label] of [
    [gotchasFile, 'gotchas'],
    [patternsFile, 'patterns'],
  ]) {
    const entries = storage.loadMemoryArray(file);
    const changed = storage.normalizeEntryIds(entries);
    const kept = entries.filter(entry => {
      if (removeByText(entry)) {
        ids.add(storage.buildEntryId(entry));
        return false;
      }
      return true;
    });
    if (changed || kept.length !== entries.length) storage.writeMemoryArray(file, kept);
    void label;
  }

  if (ids.size === 0) {
    const vectorIds = results
      .map(r => r?.metadata?.id)
      .filter(id => typeof id === 'string' && id.trim().length > 0);
    if (vectorIds.length > 0) {
      const deleted = storage.deleteMemoryByIds(vectorIds, projectRoot);
      return { deleted: deleted.deleted, ids: vectorIds };
    }
  }

  return { deleted: ids.size, ids: [...ids] };
}

module.exports = {
  getMemoryDir,
  getNamedMemoryDir: storage.getNamedMemoryDir,
  getCurrentSessionNumber,
  recordGotcha: recording.recordGotcha,
  recordPattern: recording.recordPattern,
  recordDiscovery: recording.recordDiscovery,
  loadMemoryForContext,
  formatMemoryAsMarkdown,
  getMemoryStats: reporting.getMemoryStats,
  getMemoryHealth: reporting.getMemoryHealth,
  checkAndArchiveLearnings,
  pruneCodebaseMap,
  searchMemory,
  forgetMemoryByQuery,
  deleteMemoryByIds: storage.deleteMemoryByIds,
  readMemory: storage.readMemory,
  writeMemory: storage.writeMemory,
  listMemories: storage.listMemories,
  deleteMemory: storage.deleteMemory,
  CONFIG,
  readMemoryAsync,
  atomicWriteAsync,
  ensureDirAsync,
  recordGotchaAsync,
  recordPatternAsync,
  loadMemoryForContextAsync,
  findEntities,
  getRelated,
};
