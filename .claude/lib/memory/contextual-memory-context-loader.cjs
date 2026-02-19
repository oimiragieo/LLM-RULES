// .claude/lib/memory/contextual-memory-context-loader.cjs

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const logger = createLogger('contextual-memory');

// Process-level cache for parsed memory files to speed up agent spawns
const PARSED_MEMORY_CACHE = new Map();

/**
 * Efficiently parse JSON with mtime-validated caching.
 */
function safeParseWithCache(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    const cached = PARSED_MEMORY_CACHE.get(filePath);
    if (cached && cached.mtime === stats.mtimeMs) {
      return cached.data;
    }
    const data = safeParseJSON(fs.readFileSync(filePath, 'utf8'));
    PARSED_MEMORY_CACHE.set(filePath, { mtime: stats.mtimeMs, data });
    return data;
  } catch (e) {
    logger.debug('Memory cache parse failed', { file: filePath, error: e.message });
    return null;
  }
}

/**
 * Read the end of a file without loading the entire content into memory.
 * Prevents FileTooLargeError for archives.
 */
function readTailSync(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const stats = fs.statSync(filePath);
    const size = stats.size;
    if (size === 0) return '';

    const readSize = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(readSize);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buffer, 0, readSize, size - readSize);
      let content = buffer.toString('utf8');
      // If we truncated, trim the first partial line/character
      if (size > maxBytes) {
        const firstNewline = content.indexOf('\n');
        content = '...' + (firstNewline !== -1 ? content.substring(firstNewline + 1) : content);
      }
      return content;
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    logger.debug('readTailSync failed', { file: filePath, error: e.message });
    return '';
  }
}

function getAccessTrackingMinIntervalMs() {
  return Number(process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS || 5 * 60 * 1000);
}

function isAccessTrackingEnabled() {
  return String(process.env.MEMORY_ACCESS_TRACKING || 'on').toLowerCase() !== 'off';
}

function getDefaultMaxItems() {
  return {
    gotchas: Number.parseInt(process.env.MEMORY_MAX_ITEMS_GOTCHAS || '20', 10),
    patterns: Number.parseInt(process.env.MEMORY_MAX_ITEMS_PATTERNS || '20', 10),
    decisions: Number.parseInt(process.env.MEMORY_MAX_ITEMS_DECISIONS || '10', 10),
    discoveries: Number.parseInt(process.env.MEMORY_MAX_ITEMS_DISCOVERIES || '30', 10),
    sessions: Number.parseInt(process.env.MEMORY_MAX_ITEMS_SESSIONS || '5', 10),
  };
}

function getDefaultMaxChars() {
  return {
    gotchas: Number.parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_GOTCHAS || '2000', 10),
    patterns: Number.parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_PATTERNS || '2000', 10),
    decisions: Number.parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_DECISIONS || '2000', 10),
    discoveries: Number.parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_DISCOVERIES || '3000', 10),
    sessions: Number.parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_SESSIONS || '5000', 10),
    legacy: Number.parseInt(process.env.MEMORY_MAX_CONTEXT_CHARS_LEGACY || '3000', 10),
  };
}

function toSafeInt(val, fallback = 0) {
  const n = Number.parseInt(String(val), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toSafePositiveInt(val, fallback) {
  const n = Number.parseInt(String(val), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isPathInside(baseDir, targetPath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);

  if (process.platform === 'win32') {
    const baseLower = base.toLowerCase();
    const targetLower = target.toLowerCase();
    return targetLower === baseLower || targetLower.startsWith(`${baseLower}${path.sep}`);
  }

  return target === base || target.startsWith(`${base}${path.sep}`);
}

function computeQualityScore(accessCount) {
  const count = Number.isFinite(accessCount) ? accessCount : 0;
  const max = 20;
  const ratio = Math.min(Math.log1p(count) / Math.log1p(max), 1);
  return Math.round((0.5 + ratio * 0.5) * 1000) / 1000;
}

function getAccessStatsPath(memoryDir) {
  return path.join(memoryDir, 'access-stats.json');
}

function loadAccessStats(memoryDir) {
  const statsPath = getAccessStatsPath(memoryDir);
  try {
    if (fs.existsSync(statsPath)) {
      const parsed = safeParseJSON(fs.readFileSync(statsPath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return {
          version: parsed.version || '1.0',
          entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
        };
      }
    }
  } catch (_e) {
    // Best-effort; fall through to default
  }
  return { version: '1.0', entries: {} };
}

function buildAccessKey(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.id) return `id:${entry.id}`;
  if (typeof entry.text === 'string') {
    return `text:${entry.text}\n${entry.timestamp || ''}`;
  }
  return null;
}

function applyAccessStats(entries, stats) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  if (!stats || typeof stats !== 'object' || !stats.entries) return;
  for (const entry of entries) {
    const key = buildAccessKey(entry);
    if (!key) continue;
    const stat = stats.entries[key];
    if (!stat) continue;
    entry.accessCount = toSafeInt(stat.accessCount, 0);
    entry.lastAccessed = stat.lastAccessed || null;
  }
}

function updateAccessStatsInPlace(stats, returnedEntries, nowIso) {
  if (!isAccessTrackingEnabled()) return false;
  if (!stats || typeof stats !== 'object') return false;
  if (!Array.isArray(returnedEntries) || returnedEntries.length === 0) return false;

  const entries = stats.entries || {};
  const nowMs = Date.parse(nowIso);
  const accessTrackingMinIntervalMs = getAccessTrackingMinIntervalMs();
  const minInterval = Number.isFinite(accessTrackingMinIntervalMs)
    ? accessTrackingMinIntervalMs
    : 0;

  let changed = false;
  for (const entry of returnedEntries) {
    const key = buildAccessKey(entry);
    if (!key) continue;

    const current = entries[key] || { accessCount: 0, lastAccessed: null };
    const lastAccessedMs = current.lastAccessed ? Date.parse(current.lastAccessed) : 0;

    if (!current.lastAccessed || nowMs - lastAccessedMs >= minInterval) {
      entries[key] = {
        accessCount: toSafeInt(current.accessCount, 0) + 1,
        lastAccessed: nowIso,
      };
      changed = true;
    }
  }

  stats.entries = entries;
  return changed;
}

function loadContextSync(memory, options = {}) {
  const defaultMaxItems = getDefaultMaxItems();
  const defaultMaxChars = getDefaultMaxChars();
  const rawMaxItems =
    options.maxItems && typeof options.maxItems === 'object' ? options.maxItems : {};
  const rawMaxChars =
    options.maxChars && typeof options.maxChars === 'object' ? options.maxChars : {};
  const maxItems = {
    gotchas: toSafePositiveInt(rawMaxItems.gotchas, defaultMaxItems.gotchas),
    patterns: toSafePositiveInt(rawMaxItems.patterns, defaultMaxItems.patterns),
    decisions: toSafePositiveInt(rawMaxItems.decisions, defaultMaxItems.decisions),
    discoveries: toSafePositiveInt(rawMaxItems.discoveries, defaultMaxItems.discoveries),
    sessions: toSafePositiveInt(rawMaxItems.sessions, defaultMaxItems.sessions),
  };
  const maxChars = {
    gotchas: toSafePositiveInt(rawMaxChars.gotchas, defaultMaxChars.gotchas),
    patterns: toSafePositiveInt(rawMaxChars.patterns, defaultMaxChars.patterns),
    decisions: toSafePositiveInt(rawMaxChars.decisions, defaultMaxChars.decisions),
    discoveries: toSafePositiveInt(rawMaxChars.discoveries, defaultMaxChars.discoveries),
    sessions: toSafePositiveInt(rawMaxChars.sessions, defaultMaxChars.sessions),
    legacy: toSafePositiveInt(rawMaxChars.legacy, defaultMaxChars.legacy),
  };
  const result = {
    gotchas: [],
    patterns: [],
    decisions: [],
    discoveries: [],
    recent_sessions: [],
    legacy_summary: '',
  };

  const memoryDir = memory.config.memoryDir;
  const dbPath = memory.config.dbPath;
  let dbPatternsLoaded = false;
  let dbGotchasLoaded = false;

  if (dbPath && fs.existsSync(dbPath)) {
    try {
      const db = new DatabaseSync(dbPath);
      const patterns = memory._loadEntitiesFromDb(db, 'pattern', maxItems.patterns);
      if (patterns.length > 0) {
        result.patterns = patterns;
        dbPatternsLoaded = true;
      }

      const issues = memory._loadEntitiesFromDb(db, 'issue', maxItems.gotchas);
      if (issues.length > 0) {
        result.gotchas = issues;
        dbGotchasLoaded = true;
      }

      const decisions = memory._loadEntitiesFromDb(db, 'decision', maxItems.decisions);
      if (decisions.length > 0) {
        result.decisions = decisions;
      }

      db.close();
    } catch (e) {
      logger.debug('DB load failed', { error: e.message });
    }
  }

  const accessStats = loadAccessStats(memoryDir);
  const nowIso = new Date().toISOString();

  const gotchasFile = path.join(memoryDir, 'gotchas.json');
  if (!dbGotchasLoaded) {
    const allGotchas = safeParseWithCache(gotchasFile);
    if (Array.isArray(allGotchas)) {
      const selectedGotchas = allGotchas.slice(-maxItems.gotchas);
      result.gotchas = memory._truncateItems(selectedGotchas, maxChars.gotchas);
      applyAccessStats(result.gotchas, accessStats);
    }
  }

  const patternsFile = path.join(memoryDir, 'patterns.json');
  if (!dbPatternsLoaded) {
    const allPatterns = safeParseWithCache(patternsFile);
    if (Array.isArray(allPatterns)) {
      const selectedPatterns = allPatterns.slice(-maxItems.patterns);
      result.patterns = memory._truncateItems(selectedPatterns, maxChars.patterns);
      applyAccessStats(result.patterns, accessStats);
    }
  }

  const gotchasAccessChanged = updateAccessStatsInPlace(accessStats, result.gotchas, nowIso);
  const patternsAccessChanged = updateAccessStatsInPlace(accessStats, result.patterns, nowIso);
  const accessChanged = gotchasAccessChanged || patternsAccessChanged;

  if (accessChanged) {
    setImmediate(() => {
      try {
        atomicWriteJSONSync(getAccessStatsPath(memoryDir), {
          version: '1.0',
          entries: accessStats.entries || {},
        });
        applyAccessStats(result.gotchas, accessStats);
        applyAccessStats(result.patterns, accessStats);
      } catch (_e) {
        // Best-effort; do not block context load
      }
    });
  }

  const mapFile = path.join(memoryDir, 'codebase_map.json');
  const map = safeParseWithCache(mapFile);
  if (map) {
    const discoveries = Object.entries(map.discovered_files || {})
      .slice(-maxItems.discoveries)
      .map(([filePath, info]) => ({ path: filePath, ...info }));
    result.discoveries = memory._truncateItems(discoveries, maxChars.discoveries);
  }

  try {
    const memoryTiers = require('./memory-tiers.cjs');
    const projectRoot = memory.config.projectRoot || PROJECT_ROOT;
    const mtmSessions = memoryTiers.getMTMSessions(projectRoot);
    if (mtmSessions && mtmSessions.length > 0) {
      const sorted = mtmSessions
        .sort(
          (a, b) =>
            new Date(a.timestamp || a.consolidated_at || 0) -
            new Date(b.timestamp || b.consolidated_at || 0)
        )
        .slice(-maxItems.sessions);

      const sessionNumberBase = mtmSessions.length - sorted.length;
      for (let i = 0; i < sorted.length; i++) {
        const session = sorted[i];
        result.recent_sessions.push({
          session_number: sessionNumberBase + i + 1,
          timestamp: session.timestamp || session.consolidated_at,
          summary: session.summary || '',
          tasks_completed: (session.tasks_completed || []).slice(0, 5),
          source: 'mtm',
        });
      }

      const ltmDir = memoryTiers.getTierPath('LTM', projectRoot);
      if (fs.existsSync(ltmDir)) {
        try {
          const ltmFiles = fs
            .readdirSync(ltmDir)
            .filter(f => f.endsWith('.json') && f.startsWith('summary_'))
            .sort()
            .slice(-2);
          for (const file of ltmFiles) {
            try {
              const summary = safeParseJSON(fs.readFileSync(path.join(ltmDir, file), 'utf8'));
              if (summary.type === 'session_summary') {
                result.recent_sessions.unshift({
                  session_number: 0,
                  timestamp: summary.created_at,
                  summary: `[LTM Summary] ${summary.session_count} sessions from ${summary.date_range?.start || 'unknown'} to ${summary.date_range?.end || 'unknown'}`,
                  tasks_completed: [],
                  source: 'ltm',
                  key_learnings: (summary.key_learnings || []).slice(0, 3),
                });
              }
            } catch (_e) {
              // ignore malformed LTM
            }
          }
        } catch (_e) {
          // ignore LTM read errors
        }
      }
    }
  } catch (e) {
    logger.debug('loadContextSync (mtm) error', { error: e.message });
  }

  const legacyPath = path.join(memoryDir, 'learnings.md');
  const limit = maxChars.legacy;
  if (typeof limit === 'number') {
    result.legacy_summary = readTailSync(legacyPath, limit);
  }

  return result;
}

module.exports = {
  computeQualityScore,
  isPathInside,
  loadContextSync,
  toSafeInt,
};
