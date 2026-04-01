#!/usr/bin/env node
/**
 * Hook: sync-memory-index.cjs
 *
 * Best-effort: keep the SQLite entity index in sync when core memory markdown files
 * are edited via Edit/Write/NotebookEdit.
 *
 * Why:
 * - The original SyncLayer/BackgroundSyncWorker model assumes a long-lived Node process (archived).
 * - Claude Code hooks run in short-lived processes, so we do a one-shot sync per write instead.
 * - Canonical sync: this hook only. SyncLayer/SyncWorker have been moved to .claude/archive/lib/memory/.
 *
 * Trigger:
 * - PostToolUse matcher: Edit|Write|NotebookEdit, MemoryRecord (wired in .claude/settings.json)
 */

'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { PROJECT_ROOT, validatePathWithinProject } = require('../../lib/utils/project-root.cjs');
const { MEMORY_DB_PATH } = require('../../lib/memory/memory-paths.cjs');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  extractFilePath,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

const { EntityExtractor } = require('../../lib/memory/entity-extractor.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

const CORE_MEMORY_MARKDOWN_FILES = new Set(['decisions.md', 'issues.md', 'learnings.md']);
const CORE_MEMORY_JSON_FILES = new Set(['patterns.json', 'gotchas.json']);
const EMBEDDING_MEMORY_FILES = new Set([
  'learnings.md',
  'decisions.md',
  'issues.md',
  'patterns.json',
  'gotchas.json',
]);

function getCoreMemoryFileType(absPath) {
  if (!absPath) return false;
  const normalized = path.normalize(absPath);
  const memDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  if (!normalized.startsWith(memDir)) return false;
  const base = path.basename(normalized);
  if (CORE_MEMORY_MARKDOWN_FILES.has(base)) return 'markdown';
  if (CORE_MEMORY_JSON_FILES.has(base)) return 'json';
  return false;
}

function ensureEntityDbInitialized(dbPath) {
  const lockFile = dbPath + '.init.lock';
  let lockAcquired = false;

  try {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Atomic lock acquisition (wx = exclusive create, fails if exists)
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      lockAcquired = true;
    } catch (lockErr) {
      if (lockErr.code === 'EEXIST') {
        // Another process is initializing -- check for stale lock (>10s old)
        try {
          const stat = fs.statSync(lockFile);
          if (Date.now() - stat.mtimeMs > 10000) {
            // Stale lock -- remove and retry
            fs.unlinkSync(lockFile);
            fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
            lockAcquired = true;
          }
        } catch (_e) {
          // Another process cleaned it or re-locked -- skip
        }
        if (!lockAcquired) {
          debugLog('sync-memory-index', 'Another process is initializing DB, skipping');
          return;
        }
      } else {
        throw lockErr;
      }
    }

    // Lazily initialize schema if missing (idempotent).
    // This avoids the "EntityExtractor assumes schema exists" failure mode.
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
        .get();
      if (row) return;

      const init = require('../../tools/cli/init-memory-db.cjs');
      init.initializeDatabase(db);
    } finally {
      db.close();
    }
  } catch (err) {
    debugLog('sync-memory-index', 'Failed to initialize entity DB schema', err);
  } finally {
    if (lockAcquired) {
      try {
        fs.unlinkSync(lockFile);
      } catch (_e) {
        // Best effort cleanup
      }
    }
  }
}

function buildEntityId(prefix, text) {
  const hash = crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
  return `${prefix}-${hash}`;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function qualityFromAccess(accessCount) {
  const count = Number.isFinite(accessCount) ? accessCount : 0;
  const max = 20;
  const ratio = Math.min(Math.log1p(count) / Math.log1p(max), 1);
  return clamp01(0.5 + ratio * 0.5);
}

function syncJsonMemory(absPath, dbPath) {
  // Safety: Check file exists and is not a directory
  if (!fs.existsSync(absPath)) {
    debugLog('sync-memory-index', `File does not exist: ${absPath}`);
    return;
  }

  let stats;
  try {
    stats = fs.statSync(absPath);
  } catch (err) {
    debugLog('sync-memory-index', `Failed to stat file: ${absPath}`, err);
    return;
  }

  if (stats.isDirectory()) {
    debugLog('sync-memory-index', `Path is a directory, not a file: ${absPath}`);
    return;
  }

  const base = path.basename(absPath);
  const type = base === 'patterns.json' ? 'pattern' : 'gotcha';

  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    debugLog('sync-memory-index', `Failed to read file: ${absPath}`, err);
    return;
  }

  let items = [];
  const parsed = safeParseJSON(raw, null);
  if (Array.isArray(parsed)) {
    items = parsed;
  } else {
    return;
  }

  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');

  try {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO entities (
        id, type, name, content, source_file, line_number,
        created_at, updated_at, last_accessed, access_count, quality_score
      )
      VALUES (?, ?, ?, ?, ?, ?, COALESCE(
        (SELECT created_at FROM entities WHERE id = ?),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, ?)
    `);

    const seenIds = new Set();
    for (const item of items) {
      const text = typeof item === 'string' ? item : item?.text;
      if (!text) continue;
      const content = typeof item === 'object' ? item?.content || null : null;
      const ts = item?.timestamp || null;
      const accessCount = Number.isFinite(item?.accessCount) ? item.accessCount : 0;
      const lastAccessed = item?.lastAccessed || null;
      const id = buildEntityId(type, text);
      seenIds.add(id);
      insert.run(
        id,
        type,
        text,
        content,
        absPath,
        null,
        id,
        lastAccessed,
        accessCount,
        qualityFromAccess(accessCount)
      );
      if (ts) {
        try {
          db.prepare('UPDATE entities SET created_at = ? WHERE id = ?').run(ts, id);
        } catch (_e) {
          // best-effort
        }
      }
    }

    if (seenIds.size > 0) {
      try {
        const placeholders = Array.from({ length: seenIds.size }).fill('?').join(', ');
        const params = Array.from(seenIds);
        db.prepare(
          `DELETE FROM entities WHERE source_file = ? AND type = ? AND id NOT IN (${placeholders})`
        ).run(absPath, type, ...params);
      } catch (_e) {
        // best-effort
      }
    }
  } finally {
    db.close();
  }
}

function maybeGenerateEmbeddingsForFile(absPath) {
  if (process.env.MEMORY_EMBED_ON_EDIT !== 'on') return;
  if (!absPath) return;
  const basename = path.basename(absPath);
  if (!EMBEDDING_MEMORY_FILES.has(basename)) return;

  const generatorPath = path.join(
    PROJECT_ROOT,
    '.claude',
    'tools',
    'cli',
    'generate-embeddings.cjs'
  );
  if (!fs.existsSync(generatorPath)) return;

  const timeoutMs = Number(process.env.MEMORY_EMBED_ON_EDIT_TIMEOUT_MS || 60000);
  // REMEDIATION-FIX: Use non-blocking spawn to avoid hanging the hook
  const { spawn } = require('child_process');
  const child = spawn(
    process.execPath,
    [generatorPath, '--file', absPath],
    buildEmbeddingSpawnOptions(PROJECT_ROOT, timeoutMs)
  );
  child.unref(); // Don't wait for child

  if (process.env.DEBUG_HOOKS) {
    console.warn('[sync-memory-index] Embedding generation triggered in background for', basename);
  }
}

function buildEmbeddingSpawnOptions(projectRoot, timeoutMs) {
  return {
    cwd: projectRoot,
    stdio: 'ignore',
    detached: true, // Allow child to run after parent exits
    timeout: timeoutMs,
    windowsHide: true, // Prevent detached console window popups on Windows
  };
}

async function main() {
  const startTime = Date.now();
  let output = null;
  let toolName = null;
  let absPath = null;
  const hookInput = await parseHookInputAsync({ timeout: 300, allowEmpty: true });
  if (!hookInput) process.exit(0);

  toolName = getToolName(hookInput);

  if (toolName === 'MemoryRecord') {
    const dbPath = MEMORY_DB_PATH;
    ensureEntityDbInitialized(dbPath);
    const memoryDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
    for (const fileName of CORE_MEMORY_JSON_FILES) {
      const targetPath = path.join(memoryDir, fileName);
      if (!fs.existsSync(targetPath)) continue;
      try {
        syncJsonMemory(targetPath, dbPath);
        maybeGenerateEmbeddingsForFile(targetPath);
      } catch (err) {
        debugLog('sync-memory-index', `Sync failed for ${fileName}`, err);
      }
    }

    try {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'sync-memory-index',
        output: {
          file: 'memory-record',
          fileType: 'json',
          toolName,
        },
        duration: Date.now() - startTime,
      });
    } catch (_e) {
      // Best-effort
    }

    process.exit(0);
  }

  const toolInput = getToolInput(hookInput);
  const filePath = extractFilePath(toolInput);

  if (!filePath) process.exit(0);

  const validated = validatePathWithinProject(filePath, PROJECT_ROOT);
  if (!validated.safe) {
    debugLog('sync-memory-index', `Blocked unsafe path: ${validated.reason}`, new Error(filePath));
    process.exit(0);
  }

  absPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  const fileType = getCoreMemoryFileType(absPath);
  if (!fileType) process.exit(0);
  // REMEDIATION-FIX: Allow JSON sync for all tools (e.g. manual edits by agents)
  // if (fileType === 'json' && toolName !== 'MemoryRecord' && !allowJsonHookSync) { ... }

  const dbPath = MEMORY_DB_PATH;
  ensureEntityDbInitialized(dbPath);

  try {
    if (fileType === 'json') {
      syncJsonMemory(absPath, dbPath);
      maybeGenerateEmbeddingsForFile(absPath);
    } else {
      const extractor = new EntityExtractor(dbPath);
      try {
        const { entities, relationships } = await extractor.extractFromFile(absPath);
        await extractor.storeEntities(entities || []);
        await extractor.storeRelationships(relationships || []);
        extractor.close();
      } catch (err) {
        extractor.close();
        debugLog('sync-memory-index', `Sync failed for ${path.basename(absPath)}`, err);
      }
      maybeGenerateEmbeddingsForFile(absPath);
    }

    // Enforce 25KB / 200-line caps on markdown memory files (best-effort)
    try {
      if (fileType === 'markdown') {
        const { enforceMemoryCaps } = require('../../lib/memory/memory-rotator.cjs');
        enforceMemoryCaps(absPath);
      }
    } catch (_e) {
      // Cap enforcement is best-effort in hooks
    }

    output = {
      file: absPath,
      fileType,
      toolName,
    };
  } catch (err) {
    debugLog('sync-memory-index', `Failed to initialize extractor for ${toolName || 'tool'}`, err);
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'sync-memory-index',
        error: err.message,
      });
    } catch (_e) {
      // Best-effort
    }
  }

  try {
    if (output) {
      await eventBus.emit(EventTypes.TOOL_COMPLETED, {
        type: EventTypes.TOOL_COMPLETED,
        timestamp: new Date().toISOString(),
        toolName: 'sync-memory-index',
        output,
        duration: Date.now() - startTime,
      });
    }
  } catch (_e) {
    // Best-effort
  }
  // Best-effort / non-blocking.
  process.exit(0);
}

module.exports = {
  syncJsonMemory,
  ensureEntityDbInitialized,
  buildEmbeddingSpawnOptions,
  _private: {
    buildEntityId,
    qualityFromAccess,
  },
  main,
};

if (require.main === module) {
  main().catch(err => {
    debugLog('sync-memory-index', 'Unhandled error', err);
    process.exit(0);
  });
}
