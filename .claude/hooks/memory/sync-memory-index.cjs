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
 * - PostToolUse matcher: Edit|Write|NotebookEdit (wired in .claude/settings.json)
 */

'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { PROJECT_ROOT, validatePathWithinProject } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputSync,
  getToolName,
  getToolInput,
  extractFilePath,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

const { EntityExtractor } = require('../../lib/memory/entity-extractor.cjs');

const CORE_MEMORY_MARKDOWN_FILES = new Set(['learnings.md', 'decisions.md', 'issues.md']);
const CORE_MEMORY_JSON_FILES = new Set(['patterns.json', 'gotchas.json']);

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
  try {
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
  const base = path.basename(absPath);
  const type = base === 'patterns.json' ? 'pattern' : 'issue';
  const raw = fs.readFileSync(absPath, 'utf8');
  let items = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) items = parsed;
  } catch (_e) {
    return;
  }

  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');

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

  db.close();
}

async function main() {
  const hookInput = parseHookInputSync();
  if (!hookInput) process.exit(0);

  const toolName = getToolName(hookInput);
  const toolInput = getToolInput(hookInput);
  const filePath = extractFilePath(toolInput);

  if (!filePath) process.exit(0);

  const validated = validatePathWithinProject(filePath, PROJECT_ROOT);
  if (!validated.safe) {
    debugLog('sync-memory-index', `Blocked unsafe path: ${validated.reason}`, new Error(filePath));
    process.exit(0);
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  const fileType = getCoreMemoryFileType(absPath);
  if (!fileType) process.exit(0);

  const dbPath = path.join(PROJECT_ROOT, '.claude', 'data', 'memory.db');
  ensureEntityDbInitialized(dbPath);

  try {
    if (fileType === 'json') {
      syncJsonMemory(absPath, dbPath);
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
    }
  } catch (err) {
    debugLog('sync-memory-index', `Failed to initialize extractor for ${toolName || 'tool'}`, err);
  }

  // Best-effort / non-blocking.
  process.exit(0);
}

module.exports = {
  syncJsonMemory,
  ensureEntityDbInitialized,
  _private: {
    buildEntityId,
    qualityFromAccess,
  },
  main,
};

main().catch(err => {
  debugLog('sync-memory-index', 'Unhandled error', err);
  process.exit(0);
});
