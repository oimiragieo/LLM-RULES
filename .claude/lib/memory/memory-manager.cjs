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
 *   ├── sessions/              # Legacy (not read; migrate to MTM)
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
const { createLogger } = require('../utils/logger.cjs');

const logger = createLogger('memory-manager');

/**
 * @typedef {Object} MemoryStats
 * @property {number} gotchas_count
 * @property {number} patterns_count
 * @property {number} discoveries_count
 * @property {number} sessions_count
 * @property {number} total_size_bytes
 */

/**
 * @typedef {Object} MemoryHealth
 * @property {'healthy'|'warning'} status
 * @property {string[]} warnings
 * @property {number} learningsSizeKB
 * @property {number} codebaseMapEntries
 * @property {number} sessionsCount
 */

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
    decisions: 2000,
    discoveries: 3000,
    sessions: 5000,
    legacy: 3000,
  },
  // Max items to return
  MAX_ITEMS: {
    gotchas: 20,
    patterns: 20,
    decisions: 10,
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
    logger.info(`Archived ${result.archivedBytes} bytes`, { archivePath: result.archivePath });
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
  atomicWriteSync(mapPath, JSON.stringify(codebaseMap, null, 2) + '\n');

  if (result.totalPruned > 0) {
    logger.info(`Pruned ${result.totalPruned} codebase_map entries`, {
      prunedByTTL: result.prunedByTTL,
      prunedBySize: result.prunedBySize,
    });
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
 * recordDiscovery('.claude/lib/routing/routing-table.cjs', 'Routing table source of truth');
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

  atomicWriteSync(mapFile, JSON.stringify(codebaseMap, null, 2) + '\n');
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
  // CRITICAL-001-MEMORY FIX: Validate projectRoot
  validateProjectRoot(projectRoot);
  const { ContextualMemory } = require('./contextual-memory.cjs');
  const memory = new ContextualMemory({ projectRoot });
  return memory.loadContextSync({
    maxItems: CONFIG.MAX_ITEMS,
    maxChars: CONFIG.MAX_CONTEXT_CHARS,
  });
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
        logger.error('Cleanup error in atomic write', { error: e.message, path: filePath });
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
  const { ContextualMemory } = require('./contextual-memory.cjs');
  const memory = new ContextualMemory({ projectRoot });
  return await memory.loadContext({
    maxItems: CONFIG.MAX_ITEMS,
    maxChars: CONFIG.MAX_CONTEXT_CHARS,
  });
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
        logger.debug('getMemoryHealth (codebaseMap) error', { error: e.message });
      }
    }
  }

  // Check sessions count
  const sessionsDir = path.join(memoryDir, 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir).filter(f => f.match(/^session_\d{3}\.json$/));
    result.sessionsCount = files.length;
    if (result.sessionsCount > 0) {
      result.warnings.push(
        `legacy sessions/ has ${result.sessionsCount} files - migrate to MTM and remove legacy fallback`
      );
    }
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
        logger.error('Error reading gotchas', { error: e.message });
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
        logger.debug('getMemoryStats (patterns) error', { error: e.message });
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
        logger.debug('getMemoryStats (discoveries) error', { error: e.message });
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
        logger.info('Gotcha recorded');
      } else {
        logger.error('Usage: memory-manager.cjs record-gotcha "gotcha text"');
      }
      break;

    case 'record-pattern':
      if (args[1]) {
        recordPattern(args[1]);
        logger.info('Pattern recorded');
      } else {
        logger.error('Usage: memory-manager.cjs record-pattern "pattern text"');
      }
      break;

    case 'record-discovery':
      if (args[1] && args[2]) {
        recordDiscovery(args[1], args[2], args[3] || 'general');
        logger.info('Discovery recorded');
      } else {
        logger.error('Usage: memory-manager.cjs record-discovery "path" "description" [category]');
      }
      break;

    case 'save-session':
      logger.error(
        'save-session is deprecated and disabled. Sessions are recorded via memory-tiers on SessionEnd. ' +
          'Use memory-tiers or pnpm run memory:weekly for maintenance.'
      );
      process.exit(1);
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
        logger.error('Dashboard not available', { error: e.message });
        console.log('Run: node .claude/lib/memory/memory-dashboard.cjs');
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
        logger.error('Scheduler not available', { error: e.message });
        console.log('Run: node .claude/lib/memory/memory-scheduler.cjs');
        console.log('Or: pnpm run memory:weekly');
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
  save-session       (deprecated, exits 1; use memory-tiers / SessionEnd)

Examples:
  node memory-manager.cjs stats
  node memory-manager.cjs load
  node memory-manager.cjs health
  node memory-manager.cjs archive-learnings
  node memory-manager.cjs prune-codebase
  node memory-manager.cjs record-gotcha "Always close DB connections in workers"
  node memory-manager.cjs record-pattern "Use async/await for all API calls"
  node memory-manager.cjs record-discovery "src/auth.ts" "JWT authentication handler"
  echo '{"summary":"Fixed auth bug"}' | node memory-manager.cjs save-session   # deprecated, exits 1
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
      logger.error('ContextualMemory search failed', { error: err.message });
    }
    return [];
  }
}

module.exports = {
  getMemoryDir,
  getCurrentSessionNumber,
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
