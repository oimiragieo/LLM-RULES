'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const {
  atomicWriteSync,
  atomicWriteAsync: atomicWriteAsyncWithLock,
} = require('../utils/atomic-write.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { recordMemoryOperation } = require('./memory-slo-metrics.cjs');
const { sanitizeMemoryContent } = require('./memory-sanitizer.cjs');

const logger = createLogger('memory-manager');
const asyncWriteQueue = new Map();

function createCoreOps({
  PROJECT_ROOT,
  CONFIG,
  validateProjectRoot,
  getMemoryDir,
  ensureDir,
  emitMemoryQueriedEvent,
  loadMemoryArray,
  writeMemoryArray,
  normalizeEntryIds,
  buildEntryId,
  normalizeArea,
  deleteMemoryByIds,
  recordGotcha,
  recordPattern,
  recordDiscovery,
  getMemoryHealth,
  getMemoryStats,
}) {
  function getCurrentSessionNumber(memoryDir) {
    const sessionsDir = path.join(memoryDir, 'sessions');
    ensureDir(sessionsDir);

    const files = fs
      .readdirSync(sessionsDir)
      .filter(f => f.match(/^session_\d{3}\.json$/))
      .sort();

    if (files.length === 0) return 1;

    const lastFile = files[files.length - 1];
    const match = lastFile.match(/session_(\d{3})\.json/);
    return match ? parseInt(match[1], 10) + 1 : 1;
  }

  function checkAndArchiveLearnings(projectRoot = PROJECT_ROOT) {
    const memoryDir = getMemoryDir(projectRoot);
    const learningsPath = path.join(memoryDir, 'learnings.md');
    const archiveDir = path.join(memoryDir, 'archive');

    ensureDir(archiveDir);

    const result = {
      archived: false,
      archivedBytes: 0,
      archivePath: null,
    };

    if (!fs.existsSync(learningsPath)) {
      return result;
    }

    const stats = fs.statSync(learningsPath);
    const thresholdBytes = CONFIG.LEARNINGS_ARCHIVE_THRESHOLD_KB * 1024;

    if (stats.size <= thresholdBytes) {
      return result;
    }

    const content = fs.readFileSync(learningsPath, 'utf8');
    const lines = content.split('\n');

    const linesToKeep = CONFIG.LEARNINGS_KEEP_LINES;
    if (lines.length <= linesToKeep) {
      return result;
    }

    const archiveLines = lines.slice(0, -linesToKeep);
    const keepLines = lines.slice(-linesToKeep);

    const archiveContent = archiveLines.join('\n');
    const keepContent = keepLines.join('\n');

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

    const now = new Date();
    const archiveFilename = `learnings-${now.toISOString().slice(0, 7)}.md`;
    const archivePath = path.join(archiveDir, archiveFilename);

    fs.appendFileSync(archivePath, archiveResult.sanitized + '\n\n');
    atomicWriteSync(learningsPath, keepResult.sanitized);

    result.archived = true;
    result.archivedBytes = archiveContent.length;
    result.archivePath = archivePath;

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
      const toDelete = files.slice(0, files.length - CONFIG.MAX_SESSIONS);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(sessionsDir, file));
      }
    }
  }

  function pruneCodebaseMap(projectRoot = PROJECT_ROOT) {
    const memoryDir = getMemoryDir(projectRoot);
    const mapPath = path.join(memoryDir, 'codebase_map.json');

    const result = {
      prunedByTTL: 0,
      prunedBySize: 0,
      totalPruned: 0,
    };

    if (!fs.existsSync(mapPath)) {
      return result;
    }

    let codebaseMap;
    try {
      codebaseMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    } catch (_e) {
      return result;
    }

    if (!codebaseMap.discovered_files) {
      return result;
    }

    const now = new Date();
    const ttlMs = CONFIG.CODEBASE_MAP_TTL_DAYS * 24 * 60 * 60 * 1000;
    const maxEntries = CONFIG.CODEBASE_MAP_MAX_ENTRIES;

    for (const [_key, value] of Object.entries(codebaseMap.discovered_files)) {
      if (!value.last_accessed) {
        value.last_accessed = value.discovered_at || now.toISOString();
      }
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

      const toRemove = entries.length - maxEntries;
      result.prunedBySize = toRemove;
      entries = entries.slice(toRemove);
    }

    result.totalPruned = initialCount - entries.length;

    const newDiscoveredFiles = {};
    for (const entry of entries) {
      const { path: entryPath, _accessDate, ...info } = entry;

      if (info.description) {
        const descResult = sanitizeMemoryContent(String(info.description));
        if (!descResult.safe) {
          logger.warn('Memory sanitizer detected dangerous content in codebase_map description', {
            path: entryPath,
            detections: descResult.detections,
          });
          throw new Error(
            `Codebase map write blocked: dangerous content in description (${descResult.detections.join(', ')})`
          );
        }
        info.description = descResult.sanitized;
      }

      if (info.category) {
        const catResult = sanitizeMemoryContent(String(info.category));
        if (!catResult.safe) {
          logger.warn('Memory sanitizer detected dangerous content in codebase_map category', {
            path: entryPath,
            detections: catResult.detections,
          });
          throw new Error(
            `Codebase map write blocked: dangerous content in category (${catResult.detections.join(', ')})`
          );
        }
        info.category = catResult.sanitized;
      }

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

  function loadMemoryForContext(projectRoot = PROJECT_ROOT) {
    const started = Date.now();
    validateProjectRoot(projectRoot);
    const { ContextualMemory } = require('./contextual-memory.cjs');
    const memory = new ContextualMemory({ projectRoot });
    const result = memory.loadContextSync({
      maxItems: CONFIG.MAX_ITEMS,
      maxChars: CONFIG.MAX_CONTEXT_CHARS,
    });
    const loadedCount =
      (Array.isArray(result.gotchas) ? result.gotchas.length : 0) +
      (Array.isArray(result.patterns) ? result.patterns.length : 0) +
      (Array.isArray(result.decisions) ? result.decisions.length : 0) +
      (Array.isArray(result.discoveries) ? result.discoveries.length : 0) +
      (Array.isArray(result.recent_sessions) ? result.recent_sessions.length : 0);
    emitMemoryQueriedEvent({
      query: 'context:loadMemoryForContext',
      results: loadedCount,
      latency: Date.now() - started,
    });
    recordMemoryOperation(
      {
        kind: 'read',
        ok: true,
        readLatencyMs: Date.now() - started,
      },
      projectRoot
    );
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
      .catch(() => {})
      .then(() => atomicWriteAsyncWithLock(filePath, data, 'utf8'));

    asyncWriteQueue.set(filePath, queued);
    try {
      await queued;
    } finally {
      if (asyncWriteQueue.get(filePath) === queued) {
        asyncWriteQueue.delete(filePath);
      }
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
    return recordGotcha(gotcha, projectRoot);
  }

  async function recordPatternAsync(pattern, projectRoot = PROJECT_ROOT) {
    return recordPattern(pattern, projectRoot);
  }

  async function loadMemoryForContextAsync(projectRoot = PROJECT_ROOT) {
    const started = Date.now();
    validateProjectRoot(projectRoot);
    const { ContextualMemory } = require('./contextual-memory.cjs');
    const memory = new ContextualMemory({ projectRoot });
    const result = await memory.loadContext({
      maxItems: CONFIG.MAX_ITEMS,
      maxChars: CONFIG.MAX_CONTEXT_CHARS,
    });
    const loadedCount =
      (Array.isArray(result.gotchas) ? result.gotchas.length : 0) +
      (Array.isArray(result.patterns) ? result.patterns.length : 0) +
      (Array.isArray(result.decisions) ? result.decisions.length : 0) +
      (Array.isArray(result.discoveries) ? result.discoveries.length : 0) +
      (Array.isArray(result.recent_sessions) ? result.recent_sessions.length : 0);
    emitMemoryQueriedEvent({
      query: 'context:loadMemoryForContextAsync',
      results: loadedCount,
      latency: Date.now() - started,
    });
    recordMemoryOperation(
      {
        kind: 'read',
        ok: true,
        readLatencyMs: Date.now() - started,
      },
      projectRoot
    );
    return result;
  }

  function formatMemoryAsMarkdown(projectRoot = PROJECT_ROOT) {
    const memory = loadMemoryForContext(projectRoot);
    const sections = [];

    sections.push('# Project Memory Context\n');
    sections.push('_Loaded with read-time truncation for context efficiency_\n');

    if (memory.gotchas.length > 0) {
      sections.push('## Gotchas (Pitfalls to Avoid)\n');
      for (const g of memory.gotchas) {
        sections.push(`- ${g.text}`);
      }
      sections.push('');
    }

    if (memory.patterns.length > 0) {
      sections.push('## Patterns (Reusable Solutions)\n');
      for (const p of memory.patterns) {
        sections.push(`- ${p.text}`);
      }
      sections.push('');
    }

    if (memory.discoveries.length > 0) {
      sections.push('## Codebase Discoveries\n');
      for (const d of memory.discoveries) {
        sections.push(`- \`${d.path}\`: ${d.description}`);
      }
      sections.push('');
    }

    if (memory.recent_sessions.length > 0) {
      sections.push('## Recent Sessions\n');
      for (const s of memory.recent_sessions) {
        sections.push(
          `### Session ${s.session_number} (${s.timestamp?.split('T')[0] || 'unknown'})`
        );
        if (s.summary) sections.push(s.summary);
        if (s.tasks_completed?.length > 0) {
          sections.push('Tasks: ' + s.tasks_completed.join(', '));
        }
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  async function searchMemory(query, options = {}) {
    try {
      const { ContextualMemory } = require('./contextual-memory.cjs');
      const memory = new ContextualMemory();
      const results = await memory.search(query, options);
      memory.close();
      return results;
    } catch (err) {
      if (process.env.MEMORY_DEBUG) {
        logger.error('ContextualMemory search failed', { error: err.message });
      }
      return [];
    }
  }

  async function forgetMemoryByQuery(query, options = {}, projectRoot = PROJECT_ROOT) {
    validateProjectRoot(projectRoot);
    const { threshold, limit = 20, area } = options || {};
    const memoryDir = getMemoryDir(projectRoot);
    const gotchasFile = path.join(memoryDir, 'gotchas.json');
    const patternsFile = path.join(memoryDir, 'patterns.json');

    let results = [];
    try {
      results = await searchMemory(query, {
        limit,
        threshold,
        area: normalizeArea(area),
      });
    } catch (_e) {
      results = [];
    }

    const candidateTexts = new Set(
      results.map(r => String(r?.content || '').trim()).filter(Boolean)
    );

    const ids = new Set();
    const removeByText = entry => {
      if (!entry || typeof entry.text !== 'string') return false;
      if (!candidateTexts.has(entry.text.trim())) return false;
      return !area || entry.area === normalizeArea(area);
    };

    const gotchas = loadMemoryArray(gotchasFile);
    const gotchasChanged = normalizeEntryIds(gotchas);
    const keptGotchas = gotchas.filter(entry => {
      if (removeByText(entry)) {
        ids.add(buildEntryId(entry));
        return false;
      }
      return true;
    });
    if (gotchasChanged || keptGotchas.length !== gotchas.length) {
      writeMemoryArray(gotchasFile, keptGotchas);
    }

    const patterns = loadMemoryArray(patternsFile);
    const patternsChanged = normalizeEntryIds(patterns);
    const keptPatterns = patterns.filter(entry => {
      if (removeByText(entry)) {
        ids.add(buildEntryId(entry));
        return false;
      }
      return true;
    });
    if (patternsChanged || keptPatterns.length !== patterns.length) {
      writeMemoryArray(patternsFile, keptPatterns);
    }

    if (ids.size === 0) {
      const vectorIds = results
        .map(r => r?.metadata?.id)
        .filter(id => typeof id === 'string' && id.trim().length > 0);
      if (vectorIds.length > 0) {
        const deleted = deleteMemoryByIds(vectorIds, projectRoot);
        return { deleted: deleted.deleted, ids: vectorIds };
      }
    }

    return { deleted: ids.size, ids: [...ids] };
  }

  async function findEntities(type, filters = {}) {
    try {
      const { ContextualMemory } = require('./contextual-memory.cjs');
      const memory = new ContextualMemory();
      const results = await memory.findEntities(type, filters);
      memory.close();
      return results;
    } catch (err) {
      if (process.env.MEMORY_DEBUG) {
        logger.error('ContextualMemory findEntities failed', { error: err.message });
      }
      return [];
    }
  }

  async function getRelated(id, options = {}) {
    try {
      const { ContextualMemory } = require('./contextual-memory.cjs');
      const memory = new ContextualMemory();
      const results = await memory.getRelated(id, options);
      memory.close();
      return results;
    } catch (err) {
      if (process.env.MEMORY_DEBUG) {
        logger.error('ContextualMemory getRelated failed', { error: err.message });
      }
      return [];
    }
  }

  return {
    getCurrentSessionNumber,
    checkAndArchiveLearnings,
    _pruneOldSessions,
    pruneCodebaseMap,
    recordGotcha,
    recordPattern,
    recordDiscovery,
    loadMemoryForContext,
    readMemoryAsync,
    atomicWriteAsync,
    ensureDirAsync,
    recordGotchaAsync,
    recordPatternAsync,
    loadMemoryForContextAsync,
    formatMemoryAsMarkdown,
    getMemoryHealth,
    getMemoryStats,
    searchMemory,
    forgetMemoryByQuery,
    findEntities,
    getRelated,
  };
}

module.exports = {
  createCoreOps,
};
