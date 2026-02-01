#!/usr/bin/env node
/**
 * Hook: sync-memory-index.cjs
 *
 * Best-effort: keep the SQLite entity index in sync when core memory markdown files
 * are edited via Edit/Write/NotebookEdit.
 *
 * Why:
 * - The original SyncLayer/BackgroundSyncWorker model assumes a long-lived Node process.
 * - Claude Code hooks run in short-lived processes, so we do a one-shot sync per write instead.
 *
 * Trigger:
 * - PostToolUse matcher: Edit|Write|NotebookEdit (wired in .claude/settings.json)
 */

'use strict';

const path = require('path');

const { PROJECT_ROOT, validatePathWithinProject } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputSync,
  getToolName,
  getToolInput,
  extractFilePath,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');

const { EntityExtractor } = require('../../lib/memory/entity-extractor.cjs');

const CORE_MEMORY_FILES = new Set(['learnings.md', 'decisions.md', 'issues.md']);

function isCoreMemoryMarkdown(absPath) {
  if (!absPath) return false;
  const normalized = path.normalize(absPath);
  const memDir = path.join(PROJECT_ROOT, '.claude', 'context', 'memory');
  if (!normalized.startsWith(memDir)) return false;
  return CORE_MEMORY_FILES.has(path.basename(normalized));
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
  if (!isCoreMemoryMarkdown(absPath)) process.exit(0);

  const dbPath = path.join(PROJECT_ROOT, '.claude', 'data', 'memory.db');
  ensureEntityDbInitialized(dbPath);

  try {
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
  } catch (err) {
    debugLog(
      'sync-memory-index',
      `Failed to initialize extractor for ${toolName || 'tool'}`,
      err
    );
  }

  // Best-effort / non-blocking.
  process.exit(0);
}

main().catch(err => {
  debugLog('sync-memory-index', 'Unhandled error', err);
  process.exit(0);
});
