#!/usr/bin/env node
/**
 * Memory Manager - Session-Based Memory System
 * =============================================
 *
 * Inspired by Auto-Claude's memory architecture:
 * - Session-based JSON files (not monolithic)
 * - Read-time truncation for context efficiency
 * - Typed episodes (patterns, gotchas, discoveries)
 * - Structured capture with tools
 *
 * Storage Structure:
 *   .claude/context/memory/
 *   ├── sessions/
 *   │   ├── session_001.json
 *   │   ├── session_002.json
 *   │   └── ...
 *   ├── codebase_map.json      # File discoveries
 *   ├── gotchas.json           # Pitfalls (array)
 *   ├── patterns.json          # Patterns (array)
 *   ├── learnings.md           # Legacy (read-only archive)
 *   ├── decisions.md           # ADRs (unchanged)
 *   └── issues.md              # Active blockers (unchanged)
 */

'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { atomicWriteJSONSync, atomicWriteSync } = require('../utils/atomic-write.cjs');
const { DatabaseSync } = require('node:sqlite');

// BUG-001 Fix: Import findProjectRoot to prevent nested .claude folder creation
// CRITICAL-001-MEMORY: Import path validation utility
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');

/**
 * CRITICAL-001-MEMORY FIX: Validate projectRoot parameter
 * All functions that accept projectRoot MUST call this first
 * @param {string} projectRoot - The project root path to validate
 * @throws {Error} If path is invalid or outside PROJECT_ROOT
 */
function validateProjectRoot(projectRoot) {
  if (projectRoot !== PROJECT_ROOT) {
    const validation = validatePathWithinProject(projectRoot, PROJECT_ROOT);
    if (!validation.safe) {
      throw new Error(`Invalid projectRoot: ${validation.reason}`);
    }
  }
}

// Configuration
const CONFIG = {
  // Max characters to load into context per category
  MAX_CONTEXT_CHARS: {
    gotchas: 2000,
    patterns: 2000,
    discoveries: 3000,
    sessions: 5000,
    legacy: 3000,
  },
  // Max items to return
  MAX_ITEMS: {
    gotchas: 20,
    patterns: 20,
    discoveries: 30,
    sessions: 5,
  },
  // Session retention
  MAX_SESSIONS: 50,
  // Archival thresholds
  LEARNINGS_ARCHIVE_THRESHOLD_KB: 40,
  LEARNINGS_KEEP_LINES: 50,
  // Codebase map pruning
  CODEBASE_MAP_TTL_DAYS: 90,
  CODEBASE_MAP_MAX_ENTRIES: 500,
  // Health check thresholds
  LEARNINGS_WARN_THRESHOLD_KB: 35,
  CODEBASE_MAP_WARN_ENTRIES: 400,
};

const ACCESS_TRACKING_MIN_INTERVAL_MS = Number(
  process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS || 5 * 60 * 1000
);

function toSafeInt(val, fallback = 0) {
  const n = Number.parseInt(String(val), 10);
  return Number.isFinite(n) ? n : fallback;
}

function ensureAccessTrackingFields(entry) {
  if (!entry || typeof entry !== 'object') return false;
  let changed = false;

  if (typeof entry.accessCount !== 'number') {
    entry.accessCount = 0;
    changed = true;
  }
  if (typeof entry.lastAccessed === 'undefined') {
    entry.lastAccessed = null;
    changed = true;
  }

  return changed;
}

function maybeTouchEntriesForAccessTracking(allEntries, returnedEntries, nowIso) {
  if (!Array.isArray(allEntries) || allEntries.length === 0) return false;
  if (!Array.isArray(returnedEntries) || returnedEntries.length === 0) {
    // Still ensure schema defaults exist for older entries, but don't bump counts.
    let schemaChanged = false;
    for (const entry of allEntries) {
      schemaChanged = ensureAccessTrackingFields(entry) || schemaChanged;
    }
    return schemaChanged;
  }

  const nowMs = Date.parse(nowIso);
  const identifiers = new Set(
    returnedEntries
      .filter(e => e && typeof e === 'object' && typeof e.text === 'string')
      .map(e => `${e.text}\n${e.timestamp || ''}`)
  );

  let changed = false;
  for (const entry of allEntries) {
    changed = ensureAccessTrackingFields(entry) || changed;

    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.text !== 'string') continue;

    const id = `${entry.text}\n${entry.timestamp || ''}`;
    if (!identifiers.has(id)) continue;

    const lastAccessedMs = entry.lastAccessed ? Date.parse(entry.lastAccessed) : 0;
    const minInterval = Number.isFinite(ACCESS_TRACKING_MIN_INTERVAL_MS)
      ? ACCESS_TRACKING_MIN_INTERVAL_MS
      : 0;

    if (!entry.lastAccessed || nowMs - lastAccessedMs >= minInterval) {
      entry.accessCount = toSafeInt(entry.accessCount, 0) + 1;
      entry.lastAccessed = nowIso;
      changed = true;
    }
  }

  return changed;
}

/**
 * Get the memory directory path for the given project root.
 *
 * @param {string} [projectRoot=PROJECT_ROOT] - The project root directory path
 * @returns {string} The absolute path to the memory directory (.claude/context/memory)
 * @example
 * const memDir = getMemoryDir('/path/to/project');
 * // Returns: '/path/to/project/.claude/context/memory'
 */
function getMemoryDir(projectRoot = PROJECT_ROOT) {
  return path.join(projectRoot, '.claude', 'context', 'memory');
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get current session number (auto-increment)
 */
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

/**
 * Save a new session with insights from agent work.
 *
 * @deprecated Prefer `.claude/lib/memory/memory-tiers.cjs` for canonical session storage (STM → MTM → LTM).
 * This legacy path writes `.claude/context/memory/sessions/session_NNN.json` and is kept only for backward
 * compatibility and tooling that still expects `sessions/`.
 *
 * Creates a numbered session file (e.g., session_001.json) containing
 * the session summary, tasks completed, patterns found, and gotchas.
 * Also records any patterns and gotchas to their respective files.
 *
 * @deprecated Use memory-tiers.cjs (writeSTMEntry + consolidateSession) for session recording.
 * This function writes to the legacy sessions/ directory. The canonical session storage
 * is now STM → MTM via memory-tiers.cjs. This function is retained for:
 * - Backward compatibility with older code
 * - Recording patterns and gotchas extracted from sessions
 *
 * For new code, use:
 *   const memoryTiers = require('./memory-tiers.cjs');
 *   memoryTiers.writeSTMEntry(sessionData, projectRoot);
 *   memoryTiers.consolidateSession(sessionId, projectRoot);
 *
 * @param {Object} insights - Session insights to save
 * @param {string} [insights.summary] - Brief summary of the session
 * @param {string[]} [insights.tasks_completed] - List of completed tasks
 * @param {string[]} [insights.files_modified] - List of modified files
 * @param {string[]} [insights.discoveries] - New discoveries made
 * @param {string[]} [insights.patterns_found] - Reusable patterns identified
 * @param {string[]} [insights.gotchas_encountered] - Pitfalls encountered
 * @param {string[]} [insights.decisions_made] - Decisions made during session
 * @param {string[]} [insights.next_steps] - Recommended next steps
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {{sessionNum: number, file: string}} Session number and file path
 * @throws {Error} If projectRoot is invalid or outside PROJECT_ROOT
 * @example
 * const result = saveSession({
 *   summary: 'Implemented user authentication',
 *   tasks_completed: ['Add JWT middleware', 'Create login endpoint'],
 *   patterns_found: ['Use bcrypt for password hashing']
 * });
 * // Returns: { sessionNum: 1, file: '/path/.claude/context/memory/sessions/session_001.json' }
 */
function saveSession(insights, _projectRoot = PROJECT_ROOT) {
  throw new Error(
    'saveSession is DEPRECATED. Use memory-tiers.cjs writeSTMEntry + consolidateSession instead. ' +
      'The .claude/context/memory/sessions/ directory is legacy.'
  );
}

/**
 * Check and archive learnings.md if it exceeds 40KB threshold
 * Creates archive file: .claude/context/memory/archive/learnings-YYYY-MM.md
 * Keeps only last 50 lines of current file (for continuity)
 */
function checkAndArchiveLearnings(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  const learningsPath = path.join(memoryDir, 'learnings.md');
  const archiveDir = path.join(memoryDir, 'archive');

  // Ensure archive directory exists
  ensureDir(archiveDir);

  const result = {
    archived: false,
    archivedBytes: 0,
    archivePath: null,
  };

  // Check if learnings.md exists
  if (!fs.existsSync(learningsPath)) {
    return result;
  }

  // Check file size
  const stats = fs.statSync(learningsPath);
  const thresholdBytes = CONFIG.LEARNINGS_ARCHIVE_THRESHOLD_KB * 1024;

  if (stats.size <= thresholdBytes) {
    return result;
  }

  // Read and split content
  const content = fs.readFileSync(learningsPath, 'utf8');
  const lines = content.split('\n');

  // Determine lines to keep vs archive
  const linesToKeep = CONFIG.LEARNINGS_KEEP_LINES;
  if (lines.length <= linesToKeep) {
    return result; // Not enough lines to archive
  }

  const archiveLines = lines.slice(0, -linesToKeep);
  const keepLines = lines.slice(-linesToKeep);

  const archiveContent = archiveLines.join('\n');
  const keepContent = keepLines.join('\n');

  // Create archive filename with YYYY-MM format
  const now = new Date();
  const archiveFilename = `learnings-${now.toISOString().slice(0, 7)}.md`;
  const archivePath = path.join(archiveDir, archiveFilename);

  // Append to archive (may already have content from previous archives this month)
  fs.appendFileSync(archivePath, archiveContent + '\n\n');

  // Write truncated content back to learnings.md
  atomicWriteSync(learningsPath, keepContent);

  result.archived = true;
  result.archivedBytes = archiveContent.length;
  result.archivePath = archivePath;

  if (process.env.MEMORY_DEBUG || process.env.DEBUG_HOOKS) {
    console.error(`[MEMORY] Archived ${result.archivedBytes} bytes to ${archivePath}`);
  }

  return result;
}

/**
 * Prune old sessions beyond MAX_SESSIONS
 */
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

/**
 * Prune codebase_map.json entries based on TTL and size limits
 * - Remove entries older than 90 days (TTL)
 * - If still over 500 entries, remove oldest until under 500
 */
function pruneCodebaseMap(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  const mapPath = path.join(memoryDir, 'codebase_map.json');

  const result = {
    prunedByTTL: 0,
    prunedBySize: 0,
    totalPruned: 0,
  };

  // Check if codebase_map.json exists
  if (!fs.existsSync(mapPath)) {
    return result;
  }

  // Load the file
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

  // First, add last_accessed to any entries missing it (migration)
  for (const [_key, value] of Object.entries(codebaseMap.discovered_files)) {
    if (!value.last_accessed) {
      // Use discovered_at as fallback, or current time
      value.last_accessed = value.discovered_at || now.toISOString();
    }
  }

  // Convert to array for sorting and filtering
  let entries = Object.entries(codebaseMap.discovered_files).map(([path, info]) => ({
    path,
    ...info,
    accessDate: new Date(info.last_accessed),
  }));

  const initialCount = entries.length;

  // Phase 1: Remove entries older than TTL
  const ttlCutoff = new Date(now - ttlMs);
  entries = entries.filter(entry => {
    const keep = entry.accessDate >= ttlCutoff;
    if (!keep) result.prunedByTTL++;
    return keep;
  });

  // Phase 2: If still over max, remove oldest until under limit
  if (entries.length > maxEntries) {
    // Sort by last_accessed ascending (oldest first)
    entries.sort((a, b) => a.accessDate - b.accessDate);

    const toRemove = entries.length - maxEntries;
    result.prunedBySize = toRemove;
    entries = entries.slice(toRemove);
  }

  result.totalPruned = initialCount - entries.length;

  // Rebuild discovered_files object
  const newDiscoveredFiles = {};
  for (const entry of entries) {
    const { path: entryPath, _accessDate, ...info } = entry;
    newDiscoveredFiles[entryPath] = info;
  }

  codebaseMap.discovered_files = newDiscoveredFiles;
  codebaseMap.last_updated = now.toISOString();

  // Write back
  atomicWriteSync(mapPath, JSON.stringify(codebaseMap, null, 2));

  if (result.totalPruned > 0) {
    console.log(
      `[MEMORY] Pruned ${result.totalPruned} codebase_map entries (TTL: ${result.prunedByTTL}, Size: ${result.prunedBySize})`
    );
  }

  return result;
}

/**
 * Record a gotcha (pitfall to avoid) in the memory system.
 *
 * Gotchas are stored in gotchas.json and help agents avoid repeating mistakes.
 * Duplicate gotchas (case-insensitive match) are automatically rejected.
 *
 * @param {string|Object} gotcha - The gotcha text or object with text property
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {boolean} True if gotcha was added, false if duplicate
 * @throws {Error} If projectRoot is invalid or outside PROJECT_ROOT
 * @example
 * // Record a simple gotcha
 * recordGotcha('Always close DB connections in workers');
 *
 * // Record with additional metadata
 * recordGotcha({ text: 'Never use sync fs in hooks', category: 'performance' });
 */
function recordGotcha(gotcha, projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const memoryDir = getMemoryDir(projectRoot);
  ensureDir(memoryDir);

  const gotchasFile = path.join(memoryDir, 'gotchas.json');

  let gotchas = [];
  if (fs.existsSync(gotchasFile)) {
    try {
      gotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
    } catch (_e) {
      gotchas = [];
    }
  }

  // Check for duplicates (simple text match)
  const isDuplicate = gotchas.some(
    g =>
      g.text.toLowerCase() === gotcha.text?.toLowerCase() ||
      g.text.toLowerCase() === gotcha.toLowerCase?.()
  );

  if (!isDuplicate) {
    const now = new Date().toISOString();
    const entry =
      typeof gotcha === 'string'
        ? { text: gotcha, timestamp: now, accessCount: 0, lastAccessed: null }
        : { ...gotcha, timestamp: now, accessCount: 0, lastAccessed: null };

    gotchas.push(entry);
    atomicWriteJSONSync(gotchasFile, gotchas);
  }

  return !isDuplicate;
}

/**
 * Record a pattern (reusable solution) in the memory system.
 *
 * Patterns are stored in patterns.json and help agents reuse successful solutions.
 * Duplicate patterns (case-insensitive match) are automatically rejected.
 *
 * @param {string|Object} pattern - The pattern text or object with text property
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {boolean} True if pattern was added, false if duplicate
 * @throws {Error} If projectRoot is invalid or outside PROJECT_ROOT
 * @example
 * // Record a simple pattern
 * recordPattern('Use async/await for all API calls');
 *
 * // Record with additional metadata
 * recordPattern({ text: 'Validate input at boundary', category: 'security' });
 */
function recordPattern(pattern, projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const memoryDir = getMemoryDir(projectRoot);
  ensureDir(memoryDir);

  const patternsFile = path.join(memoryDir, 'patterns.json');

  let patterns = [];
  if (fs.existsSync(patternsFile)) {
    try {
      patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
    } catch (_e) {
      patterns = [];
    }
  }

  // Check for duplicates
  const isDuplicate = patterns.some(
    p =>
      p.text.toLowerCase() === pattern.text?.toLowerCase() ||
      p.text.toLowerCase() === pattern.toLowerCase?.()
  );

  if (!isDuplicate) {
    const now = new Date().toISOString();
    const entry =
      typeof pattern === 'string'
        ? { text: pattern, timestamp: now, accessCount: 0, lastAccessed: null }
        : { ...pattern, timestamp: now, accessCount: 0, lastAccessed: null };

    patterns.push(entry);
    atomicWriteJSONSync(patternsFile, patterns);
  }

  return !isDuplicate;
}

/**
 * Record a codebase discovery in the memory system.
 *
 * Discoveries are stored in codebase_map.json and help agents remember
 * important files and their purposes. Each discovery includes a last_accessed
 * timestamp for TTL-based pruning (entries older than 90 days are pruned).
 *
 * @param {string} filePath - Path to the discovered file (relative or absolute)
 * @param {string} description - Description of what the file contains/does
 * @param {string} [category='general'] - Category for the discovery (e.g., 'config', 'api', 'test')
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {boolean} Always returns true on success
 * @throws {Error} If projectRoot is invalid or outside PROJECT_ROOT
 * @example
 * recordDiscovery('src/auth.ts', 'JWT authentication handler', 'security');
 * recordDiscovery('.claude/hooks/routing/router-enforcer.cjs', 'Main routing hook');
 */
function recordDiscovery(filePath, description, category = 'general', projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const memoryDir = getMemoryDir(projectRoot);
  ensureDir(memoryDir);

  const mapFile = path.join(memoryDir, 'codebase_map.json');

  let codebaseMap = { discovered_files: {}, last_updated: null };
  if (fs.existsSync(mapFile)) {
    try {
      codebaseMap = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    } catch (_e) {
      codebaseMap = { discovered_files: {}, last_updated: null };
    }
  }

  const now = new Date().toISOString();

  // Check if entry already exists
  const existing = codebaseMap.discovered_files[filePath];

  codebaseMap.discovered_files[filePath] = {
    description,
    category,
    discovered_at: existing?.discovered_at || now, // Keep original discovery time
    last_accessed: now, // Always update last_accessed
  };
  codebaseMap.last_updated = now;

  atomicWriteSync(mapFile, JSON.stringify(codebaseMap, null, 2));
  return true;
}

/**
 * Load memory with truncation for context efficiency.
 *
 * This is the key function for loading memory into agent context.
 * It loads gotchas, patterns, discoveries, and recent sessions with
 * truncation to fit within context limits defined in CONFIG.
 *
 * Access tracking: Updates lastAccessed and accessCount for loaded items.
 * Writes are rate-limited per entry via MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS.
 *
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {Object} Memory context object
 * @returns {Array<{text: string, timestamp: string}>} returns.gotchas - Recent gotchas
 * @returns {Array<{text: string, timestamp: string}>} returns.patterns - Recent patterns
 * @returns {Array<{path: string, description: string}>} returns.discoveries - File discoveries
 * @returns {Array<Object>} returns.recent_sessions - Recent session summaries
 * @returns {string} returns.legacy_summary - Truncated learnings.md content
 * @throws {Error} If projectRoot is invalid or outside PROJECT_ROOT
 * @example
 * const memory = loadMemoryForContext();
 * console.log(memory.gotchas); // [{text: '...', timestamp: '...'}]
 * console.log(memory.patterns); // [{text: '...', timestamp: '...'}]
 */
function loadMemoryForContext(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  const result = {
    gotchas: [],
    patterns: [],
    discoveries: [],
    recent_sessions: [],
    legacy_summary: '',
  };

  // Try loading from SQLite (Ghost Memory) first
  // This uses the 'entities' table populated by EntityExtractor
  const dbPath = path.join(projectRoot, '.claude/data/memory.db');
  let dbPatternsLoaded = false;
  let dbGotchasLoaded = false;

  if (fs.existsSync(dbPath)) {
    try {
      const db = new DatabaseSync(dbPath);

      // Load patterns
      const patterns = db
        .prepare(
          "SELECT name, content, created_at FROM entities WHERE type = 'pattern' ORDER BY quality_score DESC, created_at DESC LIMIT ?"
        )
        .all(CONFIG.MAX_ITEMS.patterns);

      if (patterns.length > 0) {
        result.patterns = patterns.map(p => ({
          text: p.name + (p.content ? '\n' + p.content : ''),
          timestamp: p.created_at,
        }));
        dbPatternsLoaded = true;
      }

      // Load issues/gotchas
      const issues = db
        .prepare(
          "SELECT name, content, created_at FROM entities WHERE type = 'issue' ORDER BY quality_score DESC, created_at DESC LIMIT ?"
        )
        .all(CONFIG.MAX_ITEMS.gotchas);

      if (issues.length > 0) {
        result.gotchas = issues.map(i => ({
          text: i.name + (i.content ? '\n' + i.content : ''),
          timestamp: i.created_at,
        }));
        dbGotchasLoaded = true;
      }

      db.close();
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY] DB load failed:', e.message);
      }
    }
  }

  // Load gotchas from JSON if not loaded from DB
  const gotchasFile = path.join(memoryDir, 'gotchas.json');
  if (!dbGotchasLoaded && fs.existsSync(gotchasFile)) {
    try {
      const allGotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
      const selectedGotchas = allGotchas.slice(-CONFIG.MAX_ITEMS.gotchas);
      result.gotchas = truncateItems(selectedGotchas, CONFIG.MAX_CONTEXT_CHARS.gotchas);

      const now = new Date().toISOString();
      const changed = maybeTouchEntriesForAccessTracking(allGotchas, result.gotchas, now);
      if (changed) {
        atomicWriteJSONSync(gotchasFile, allGotchas);
      }
    } catch (e) {
      console.warn('[Memory] Failed to parse gotchas.json:', e.message);
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'loadMemory (gotchas):', e.message);
      }
    }
  }

  // Load patterns from JSON if not loaded from DB
  const patternsFile = path.join(memoryDir, 'patterns.json');
  if (!dbPatternsLoaded && fs.existsSync(patternsFile)) {
    try {
      const allPatterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
      const selectedPatterns = allPatterns.slice(-CONFIG.MAX_ITEMS.patterns);
      result.patterns = truncateItems(selectedPatterns, CONFIG.MAX_CONTEXT_CHARS.patterns);

      const now = new Date().toISOString();
      const changed = maybeTouchEntriesForAccessTracking(allPatterns, result.patterns, now);
      if (changed) {
        atomicWriteJSONSync(patternsFile, allPatterns);
      }
    } catch (e) {
      console.warn('[Memory] Failed to parse patterns.json:', e.message);
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'loadMemory (patterns):', e.message);
      }
    }
  }

  // Load codebase discoveries (truncated)
  const mapFile = path.join(memoryDir, 'codebase_map.json');
  if (fs.existsSync(mapFile)) {
    try {
      const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
      const discoveries = Object.entries(map.discovered_files || {})
        .slice(-CONFIG.MAX_ITEMS.discoveries)
        .map(([path, info]) => ({ path, ...info }));
      result.discoveries = truncateItems(discoveries, CONFIG.MAX_CONTEXT_CHARS.discoveries);
    } catch (e) {
      console.warn('[Memory] Failed to parse codebase_map.json:', e.message);
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'loadMemory (discoveries):', e.message);
      }
    }
  }

  // Load recent sessions from MTM (canonical) with fallback to legacy sessions/
  // SPLIT-BRAIN FIX: Write path uses memory-tiers (STM → MTM → LTM), so read path must also use MTM
  let mtmLoaded = false;
  try {
    // Try to load memory-tiers for MTM sessions
    const memoryTiers = require('./memory-tiers.cjs');
    const mtmSessions = memoryTiers.getMTMSessions(projectRoot);

    if (mtmSessions && mtmSessions.length > 0) {
      // Sort by time (oldest first) and take last N (newest slice).
      const sorted = mtmSessions
        .sort(
          (a, b) =>
            new Date(a.timestamp || a.consolidated_at || 0) -
            new Date(b.timestamp || b.consolidated_at || 0)
        )
        .slice(-CONFIG.MAX_ITEMS.sessions);

      const sessionNumberBase = mtmSessions.length - sorted.length;
      for (let i = 0; i < sorted.length; i++) {
        const session = sorted[i];
        result.recent_sessions.push({
          session_number: sessionNumberBase + i + 1, // Derived stable numbering for MTM
          timestamp: session.timestamp || session.consolidated_at,
          summary: session.summary || '',
          tasks_completed: (session.tasks_completed || []).slice(0, 5),
          source: 'mtm', // Mark source for debugging
        });
      }
      mtmLoaded = true;

      // Optionally load recent LTM summaries
      const ltmDir = memoryTiers.getTierPath('LTM', projectRoot);
      if (fs.existsSync(ltmDir)) {
        try {
          const ltmFiles = fs
            .readdirSync(ltmDir)
            .filter(f => f.endsWith('.json') && f.startsWith('summary_'))
            .sort()
            .slice(-2); // Last 2 summaries

          for (const file of ltmFiles) {
            try {
              const summary = JSON.parse(fs.readFileSync(path.join(ltmDir, file), 'utf8'));
              if (summary.type === 'session_summary') {
                result.recent_sessions.unshift({
                  session_number: 0, // LTM summaries are older
                  timestamp: summary.created_at,
                  summary: `[LTM Summary] ${summary.session_count} sessions from ${summary.date_range?.start || 'unknown'} to ${summary.date_range?.end || 'unknown'}`,
                  tasks_completed: [],
                  source: 'ltm',
                  key_learnings: (summary.key_learnings || []).slice(0, 3),
                });
              }
            } catch (_e) {
              // Skip malformed LTM files
            }
          }
        } catch (_e) {
          // LTM dir read failed, continue without
        }
      }
    }
  } catch (_e) {
    // memory-tiers not available, fall through to legacy
    if (process.env.MEMORY_DEBUG) {
      console.error('[MEMORY_DEBUG]', 'loadMemory (mtm):', _e.message);
    }
  }

  // Fallback to legacy sessions/ if MTM is empty or unavailable
  if (!mtmLoaded) {
    const sessionsDir = path.join(memoryDir, 'sessions');
    if (fs.existsSync(sessionsDir)) {
      const files = fs
        .readdirSync(sessionsDir)
        .filter(f => f.match(/^session_\d{3}\.json$/))
        .sort()
        .slice(-CONFIG.MAX_ITEMS.sessions);

      for (const file of files) {
        try {
          const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'));
          result.recent_sessions.push({
            session_number: session.session_number,
            timestamp: session.timestamp,
            summary: session.summary,
            tasks_completed: session.tasks_completed?.slice(0, 5),
            source: 'legacy', // Mark source for debugging
          });
        } catch (e) {
          if (process.env.MEMORY_DEBUG) {
            console.error('[MEMORY_DEBUG]', 'loadMemory (sessions):', e.message);
          }
        }
      }
    }
  }

  // Load legacy learnings.md (truncated to last N chars)
  const legacyFile = path.join(memoryDir, 'learnings.md');
  if (fs.existsSync(legacyFile)) {
    try {
      const content = fs.readFileSync(legacyFile, 'utf8');
      // Take last N characters
      result.legacy_summary =
        content.length > CONFIG.MAX_CONTEXT_CHARS.legacy
          ? '...' + content.slice(-CONFIG.MAX_CONTEXT_CHARS.legacy)
          : content;
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'loadMemory (learnings):', e.message);
      }
    }
  }

  return result;
}

/**
 * Truncate items to fit within character limit
 */
function truncateItems(items, maxChars) {
  let totalChars = 0;
  const result = [];

  for (const item of items) {
    const itemStr = JSON.stringify(item);
    if (totalChars + itemStr.length > maxChars) {
      break;
    }
    totalChars += itemStr.length;
    result.push(item);
  }

  return result;
}

// ===========================================================================
// ASYNC FUNCTIONS (SEC-IMPL-001 Approved)
// Safe async I/O with no exists() checks, explicit error handling, atomic writes
// ===========================================================================

/**
 * Read memory file asynchronously
 * SAFE: No exists() check - uses try/catch with ENOENT handling
 * @param {string} file - File path to read
 * @returns {Promise<string|null>} File content or null if missing
 */
async function readMemoryAsync(file) {
  try {
    return await fsp.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write file atomically using async operations
 * SAFE: Uses temp file + rename pattern for crash safety
 * @param {string} filePath - Target file path
 * @param {string} data - Content to write
 */
async function atomicWriteAsync(filePath, data) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(tmp, data, 'utf8');
    await fsp.rename(tmp, filePath);
  } catch (err) {
    // Clean up temp file on error (ignore cleanup errors)
    try {
      await fsp.unlink(tmp);
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error(
          JSON.stringify({ module: 'memory-manager', event: 'cleanup_error', error: e.message })
        );
      }
    }
    throw err;
  }
}

/**
 * Ensure directory exists asynchronously
 * SAFE: No exists() check - uses mkdir with recursive option
 * @param {string} dirPath - Directory path to create
 */
async function ensureDirAsync(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (err) {
    // EEXIST is fine (directory already exists)
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Record a gotcha (pitfall to avoid) asynchronously
 * @param {string|Object} gotcha - Gotcha text or object
 * @param {string} projectRoot - Project root path
 * @returns {Promise<boolean>} True if added, false if duplicate
 */
async function recordGotchaAsync(gotcha, projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const memoryDir = getMemoryDir(projectRoot);
  await ensureDirAsync(memoryDir);

  const gotchasFile = path.join(memoryDir, 'gotchas.json');

  let gotchas = [];
  const content = await readMemoryAsync(gotchasFile);
  if (content) {
    try {
      gotchas = JSON.parse(content);
    } catch (_e) {
      gotchas = [];
    }
  }

  // Check for duplicates (simple text match)
  const isDuplicate = gotchas.some(
    g =>
      g.text.toLowerCase() === gotcha.text?.toLowerCase() ||
      g.text.toLowerCase() === gotcha.toLowerCase?.()
  );

  if (!isDuplicate) {
    const now = new Date().toISOString();
    const entry =
      typeof gotcha === 'string'
        ? { text: gotcha, timestamp: now, accessCount: 0, lastAccessed: null }
        : { ...gotcha, timestamp: now, accessCount: 0, lastAccessed: null };

    gotchas.push(entry);
    await atomicWriteAsync(gotchasFile, JSON.stringify(gotchas, null, 2));
  }

  return !isDuplicate;
}

/**
 * Record a pattern (reusable solution) asynchronously
 * @param {string|Object} pattern - Pattern text or object
 * @param {string} projectRoot - Project root path
 * @returns {Promise<boolean>} True if added, false if duplicate
 */
async function recordPatternAsync(pattern, projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const memoryDir = getMemoryDir(projectRoot);
  await ensureDirAsync(memoryDir);

  const patternsFile = path.join(memoryDir, 'patterns.json');

  let patterns = [];
  const content = await readMemoryAsync(patternsFile);
  if (content) {
    try {
      patterns = JSON.parse(content);
    } catch (_e) {
      patterns = [];
    }
  }

  // Check for duplicates
  const isDuplicate = patterns.some(
    p =>
      p.text.toLowerCase() === pattern.text?.toLowerCase() ||
      p.text.toLowerCase() === pattern.toLowerCase?.()
  );

  if (!isDuplicate) {
    const now = new Date().toISOString();
    const entry =
      typeof pattern === 'string'
        ? { text: pattern, timestamp: now, accessCount: 0, lastAccessed: null }
        : { ...pattern, timestamp: now, accessCount: 0, lastAccessed: null };

    patterns.push(entry);
    await atomicWriteAsync(patternsFile, JSON.stringify(patterns, null, 2));
  }

  return !isDuplicate;
}

/**
 * Load memory for context asynchronously
 * @param {string} projectRoot - Project root path
 * @returns {Promise<Object>} Memory context object
 */
async function loadMemoryForContextAsync(projectRoot = PROJECT_ROOT) {
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const memoryDir = getMemoryDir(projectRoot);
  const result = {
    gotchas: [],
    patterns: [],
    discoveries: [],
    recent_sessions: [],
    legacy_summary: '',
  };

  // Load gotchas (truncated)
  const gotchasFile = path.join(memoryDir, 'gotchas.json');
  const gotchasContent = await readMemoryAsync(gotchasFile);
  if (gotchasContent) {
    try {
      const gotchas = JSON.parse(gotchasContent);
      const selectedGotchas = gotchas.slice(-CONFIG.MAX_ITEMS.gotchas);
      result.gotchas = truncateItems(selectedGotchas, CONFIG.MAX_CONTEXT_CHARS.gotchas);

      const now = new Date().toISOString();
      const changed = maybeTouchEntriesForAccessTracking(gotchas, result.gotchas, now);
      if (changed) {
        await atomicWriteAsync(gotchasFile, JSON.stringify(gotchas, null, 2));
      }
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'loadMemoryAsync (gotchas):', e.message);
      }
    }
  }

  // Load patterns (truncated)
  const patternsFile = path.join(memoryDir, 'patterns.json');
  const patternsContent = await readMemoryAsync(patternsFile);
  if (patternsContent) {
    try {
      const patterns = JSON.parse(patternsContent);
      const selectedPatterns = patterns.slice(-CONFIG.MAX_ITEMS.patterns);
      result.patterns = truncateItems(selectedPatterns, CONFIG.MAX_CONTEXT_CHARS.patterns);

      const now = new Date().toISOString();
      const changed = maybeTouchEntriesForAccessTracking(patterns, result.patterns, now);
      if (changed) {
        await atomicWriteAsync(patternsFile, JSON.stringify(patterns, null, 2));
      }
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'loadMemoryAsync (patterns):', e.message);
      }
    }
  }

  // Load codebase discoveries (truncated)
  const mapContent = await readMemoryAsync(path.join(memoryDir, 'codebase_map.json'));
  if (mapContent) {
    try {
      const map = JSON.parse(mapContent);
      const discoveries = Object.entries(map.discovered_files || {})
        .slice(-CONFIG.MAX_ITEMS.discoveries)
        .map(([filePath, info]) => ({ path: filePath, ...info }));
      result.discoveries = truncateItems(discoveries, CONFIG.MAX_CONTEXT_CHARS.discoveries);
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'loadMemoryAsync (discoveries):', e.message);
      }
    }
  }

  // Load recent sessions from MTM (canonical) with fallback to legacy sessions/
  // SPLIT-BRAIN FIX: Write path uses memory-tiers (STM → MTM → LTM), so read path must also use MTM
  let mtmLoaded = false;
  try {
    // Try to load memory-tiers for MTM sessions
    const memoryTiers = require('./memory-tiers.cjs');
    const mtmSessions = memoryTiers.getMTMSessions(projectRoot);

    if (mtmSessions && mtmSessions.length > 0) {
      // Sort by time (oldest first) and take last N (newest slice).
      const sorted = mtmSessions
        .sort(
          (a, b) =>
            new Date(a.timestamp || a.consolidated_at || 0) -
            new Date(b.timestamp || b.consolidated_at || 0)
        )
        .slice(-CONFIG.MAX_ITEMS.sessions);

      const sessionNumberBase = mtmSessions.length - sorted.length;
      for (let i = 0; i < sorted.length; i++) {
        const session = sorted[i];
        result.recent_sessions.push({
          session_number: sessionNumberBase + i + 1, // Derived stable numbering for MTM
          timestamp: session.timestamp || session.consolidated_at,
          summary: session.summary || '',
          tasks_completed: (session.tasks_completed || []).slice(0, 5),
          source: 'mtm', // Mark source for debugging
        });
      }
      mtmLoaded = true;

      // Optionally load recent LTM summaries
      const ltmDir = memoryTiers.getTierPath('LTM', projectRoot);
      try {
        const ltmFiles = await fsp.readdir(ltmDir);
        const summaryFiles = ltmFiles
          .filter(f => f.endsWith('.json') && f.startsWith('summary_'))
          .sort()
          .slice(-2); // Last 2 summaries

        for (const file of summaryFiles) {
          try {
            const summaryContent = await readMemoryAsync(path.join(ltmDir, file));
            if (summaryContent) {
              const summary = JSON.parse(summaryContent);
              if (summary.type === 'session_summary') {
                result.recent_sessions.unshift({
                  session_number: 0, // LTM summaries are older
                  timestamp: summary.created_at,
                  summary: `[LTM Summary] ${summary.session_count} sessions from ${summary.date_range?.start || 'unknown'} to ${summary.date_range?.end || 'unknown'}`,
                  tasks_completed: [],
                  source: 'ltm',
                  key_learnings: (summary.key_learnings || []).slice(0, 3),
                });
              }
            }
          } catch (_e) {
            // Skip malformed LTM files
          }
        }
      } catch (_e) {
        // LTM dir read failed, continue without
      }
    }
  } catch (_e) {
    // memory-tiers not available, fall through to legacy
    if (process.env.MEMORY_DEBUG) {
      console.error('[MEMORY_DEBUG]', 'loadMemoryAsync (mtm):', _e.message);
    }
  }

  // Fallback to legacy sessions/ if MTM is empty or unavailable
  if (!mtmLoaded) {
    const sessionsDir = path.join(memoryDir, 'sessions');
    try {
      const files = await fsp.readdir(sessionsDir);
      const sessionFiles = files
        .filter(f => f.match(/^session_\d{3}\.json$/))
        .sort()
        .slice(-CONFIG.MAX_ITEMS.sessions);

      for (const file of sessionFiles) {
        try {
          const sessionContent = await readMemoryAsync(path.join(sessionsDir, file));
          if (sessionContent) {
            const session = JSON.parse(sessionContent);
            result.recent_sessions.push({
              session_number: session.session_number,
              timestamp: session.timestamp,
              summary: session.summary,
              tasks_completed: session.tasks_completed?.slice(0, 5),
              source: 'legacy', // Mark source for debugging
            });
          }
        } catch (e) {
          if (process.env.METRICS_DEBUG === 'true') {
            console.error(
              JSON.stringify({
                module: 'memory-manager',
                error: e.message,
                timestamp: new Date().toISOString(),
              })
            );
          }
        }
      }
    } catch (_e) {
      /* ignore - sessions dir may not exist */
    }
  }

  // Load legacy learnings.md (truncated to last N chars)
  const legacyContent = await readMemoryAsync(path.join(memoryDir, 'learnings.md'));
  if (legacyContent) {
    result.legacy_summary =
      legacyContent.length > CONFIG.MAX_CONTEXT_CHARS.legacy
        ? '...' + legacyContent.slice(-CONFIG.MAX_CONTEXT_CHARS.legacy)
        : legacyContent;
  }

  return result;
}

/**
 * Format memory for markdown output (agent-friendly)
 */
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
      sections.push(`### Session ${s.session_number} (${s.timestamp?.split('T')[0] || 'unknown'})`);
      if (s.summary) sections.push(s.summary);
      if (s.tasks_completed?.length > 0) {
        sections.push('Tasks: ' + s.tasks_completed.join(', '));
      }
      sections.push('');
    }
  }

  return sections.join('\n');
}

/**
 * Get memory health status for monitoring.
 *
 * Checks various health indicators and returns warnings when thresholds
 * are exceeded:
 * - learnings.md size (warn if > 35KB)
 * - codebase_map.json entry count (warn if > 400)
 * - sessions directory count
 *
 * @param {string} [projectRoot=PROJECT_ROOT] - Project root directory path
 * @returns {Object} Health status object
 * @returns {'healthy'|'warning'} returns.status - Overall health status
 * @returns {string[]} returns.warnings - Array of warning messages
 * @returns {number} returns.learningsSizeKB - Size of learnings.md in KB
 * @returns {number} returns.codebaseMapEntries - Number of codebase_map entries
 * @returns {number} returns.sessionsCount - Number of session files
 * @example
 * const health = getMemoryHealth();
 * if (health.status === 'warning') {
 *   console.log('Warnings:', health.warnings);
 * }
 */
function getMemoryHealth(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  const result = {
    status: 'healthy',
    warnings: [],
    learningsSizeKB: 0,
    codebaseMapEntries: 0,
    sessionsCount: 0,
  };

  // Check learnings.md size
  const learningsPath = path.join(memoryDir, 'learnings.md');
  if (fs.existsSync(learningsPath)) {
    const stats = fs.statSync(learningsPath);
    result.learningsSizeKB = Math.round(stats.size / 1024);

    if (result.learningsSizeKB > CONFIG.LEARNINGS_WARN_THRESHOLD_KB) {
      result.warnings.push(
        `learnings.md is ${result.learningsSizeKB}KB (threshold: ${CONFIG.LEARNINGS_WARN_THRESHOLD_KB}KB) - consider archival`
      );
    }
  }

  // Check codebase_map.json entry count
  const mapPath = path.join(memoryDir, 'codebase_map.json');
  if (fs.existsSync(mapPath)) {
    try {
      const codebaseMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      result.codebaseMapEntries = Object.keys(codebaseMap.discovered_files || {}).length;

      if (result.codebaseMapEntries > CONFIG.CODEBASE_MAP_WARN_ENTRIES) {
        result.warnings.push(
          `codebase_map has ${result.codebaseMapEntries} entries (threshold: ${CONFIG.CODEBASE_MAP_WARN_ENTRIES}) - consider pruning`
        );
      }
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'getMemoryHealth (codebaseMap):', e.message);
      }
    }
  }

  // Check sessions count
  const sessionsDir = path.join(memoryDir, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir).filter(f => f.match(/^session_\d{3}\.json$/));
    result.sessionsCount = files.length;
  }

  // Set overall status
  if (result.warnings.length > 0) {
    result.status = 'warning';
  }

  return result;
}

/**
 * Get memory statistics
 */
function getMemoryStats(projectRoot = PROJECT_ROOT) {
  const memoryDir = getMemoryDir(projectRoot);
  const stats = {
    gotchas_count: 0,
    patterns_count: 0,
    discoveries_count: 0,
    sessions_count: 0,
    total_size_bytes: 0,
  };

  // Count gotchas
  const gotchasFile = path.join(memoryDir, 'gotchas.json');
  if (fs.existsSync(gotchasFile)) {
    try {
      const gotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
      stats.gotchas_count = gotchas.length;
      stats.total_size_bytes += fs.statSync(gotchasFile).size;
    } catch (e) {
      if (process.env.METRICS_DEBUG === 'true') {
        console.error(
          JSON.stringify({
            module: 'memory-manager',
            error: e.message,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }
  }

  // Count patterns
  const patternsFile = path.join(memoryDir, 'patterns.json');
  if (fs.existsSync(patternsFile)) {
    try {
      const patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
      stats.patterns_count = patterns.length;
      stats.total_size_bytes += fs.statSync(patternsFile).size;
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'getMemoryStats (patterns):', e.message);
      }
    }
  }

  // Count discoveries
  const mapFile = path.join(memoryDir, 'codebase_map.json');
  if (fs.existsSync(mapFile)) {
    try {
      const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
      stats.discoveries_count = Object.keys(map.discovered_files || {}).length;
      stats.total_size_bytes += fs.statSync(mapFile).size;
    } catch (e) {
      if (process.env.MEMORY_DEBUG) {
        console.error('[MEMORY_DEBUG]', 'getMemoryStats (discoveries):', e.message);
      }
    }
  }

  // Count sessions
  const sessionsDir = path.join(memoryDir, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir).filter(f => f.match(/^session_\d{3}\.json$/));
    stats.sessions_count = files.length;
    for (const file of files) {
      stats.total_size_bytes += fs.statSync(path.join(sessionsDir, file)).size;
    }
  }

  return stats;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'stats':
      console.log(JSON.stringify(getMemoryStats(), null, 2));
      break;

    case 'load':
      console.log(formatMemoryAsMarkdown());
      break;

    case 'record-gotcha':
      if (args[1]) {
        recordGotcha(args[1]);
        console.log('Gotcha recorded');
      } else {
        console.error('Usage: memory-manager.cjs record-gotcha "gotcha text"');
      }
      break;

    case 'record-pattern':
      if (args[1]) {
        recordPattern(args[1]);
        console.log('Pattern recorded');
      } else {
        console.error('Usage: memory-manager.cjs record-pattern "pattern text"');
      }
      break;

    case 'record-discovery':
      if (args[1] && args[2]) {
        recordDiscovery(args[1], args[2], args[3] || 'general');
        console.log('Discovery recorded');
      } else {
        console.error('Usage: memory-manager.cjs record-discovery "path" "description" [category]');
      }
      break;

    case 'save-session':
      // Read JSON from stdin
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => (input += chunk));
      process.stdin.on('end', () => {
        try {
          const insights = JSON.parse(input);
          const result = saveSession(insights);
          console.log(JSON.stringify(result));
        } catch (e) {
          console.error('Invalid JSON input:', e.message);
          process.exit(1);
        }
      });
      break;

    case 'health':
      console.log(JSON.stringify(getMemoryHealth(), null, 2));
      break;

    case 'archive-learnings':
      const archiveResult = checkAndArchiveLearnings();
      console.log(JSON.stringify(archiveResult, null, 2));
      break;

    case 'prune-codebase':
      const pruneResult = pruneCodebaseMap();
      console.log(JSON.stringify(pruneResult, null, 2));
      break;

    case 'dashboard':
      // Invoke memory-dashboard for unified view
      try {
        const dashboard = require('./memory-dashboard.cjs');
        const dashboardData = dashboard.getDashboard();
        console.log(dashboard.formatDashboard(dashboardData));
      } catch (e) {
        console.error('Dashboard not available:', e.message);
        console.log('Run: node .claude/lib/memory-dashboard.cjs');
      }
      break;

    case 'maintenance':
      // Invoke memory-scheduler for maintenance
      try {
        const scheduler = require('./memory-scheduler.cjs');
        const maintenanceType = args[1] || 'daily';
        const result = scheduler.runMaintenance(maintenanceType);
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error('Scheduler not available:', e.message);
        console.log('Run: node .claude/lib/memory/memory-scheduler.cjs');
      }
      break;

    default:
      console.log(`
Memory Manager - Session-Based Memory System

Commands:
  stats              Show memory statistics
  load               Load memory formatted as markdown
  health             Check memory health status
  dashboard          Show unified memory dashboard (Phase 4)
  maintenance [type] Run maintenance (daily/weekly, Phase 4)
  archive-learnings  Archive learnings.md if over 40KB
  prune-codebase     Prune codebase_map.json (TTL + size)
  record-gotcha      Record a gotcha/pitfall
  record-pattern     Record a reusable pattern
  record-discovery   Record a codebase discovery
  save-session       Save a session (JSON from stdin)

Examples:
  node memory-manager.cjs stats
  node memory-manager.cjs load
  node memory-manager.cjs health
  node memory-manager.cjs archive-learnings
  node memory-manager.cjs prune-codebase
  node memory-manager.cjs record-gotcha "Always close DB connections in workers"
  node memory-manager.cjs record-pattern "Use async/await for all API calls"
  node memory-manager.cjs record-discovery "src/auth.ts" "JWT authentication handler"
  echo '{"summary":"Fixed auth bug"}' | node memory-manager.cjs save-session
`);
  }
}

/**
 * Search memory using ContextualMemory (semantic search).
 * Falls back to an empty result set if ContextualMemory is unavailable.
 *
 * @param {string} query - Natural language query
 * @param {object} [options] - Search options (passed through)
 * @returns {Promise<Array>} Search results
 */
async function searchMemory(query, options = {}) {
  try {
    const { ContextualMemory } = require('./contextual-memory.cjs');
    const memory = new ContextualMemory();
    const results = await memory.search(query, options);
    memory.close();
    return results;
  } catch (err) {
    if (process.env.MEMORY_DEBUG) {
      console.error('[MEMORY_DEBUG]', 'ContextualMemory search failed:', err.message);
    }
    return [];
  }
}

module.exports = {
  getMemoryDir,
  getCurrentSessionNumber,
  saveSession,
  recordGotcha,
  recordPattern,
  recordDiscovery,
  loadMemoryForContext,
  formatMemoryAsMarkdown,
  getMemoryStats,
  getMemoryHealth,
  checkAndArchiveLearnings,
  pruneCodebaseMap,
  searchMemory,
  CONFIG,
  // Async functions (SEC-IMPL-001)
  readMemoryAsync,
  atomicWriteAsync,
  ensureDirAsync,
  recordGotchaAsync,
  recordPatternAsync,
  loadMemoryForContextAsync,
};
