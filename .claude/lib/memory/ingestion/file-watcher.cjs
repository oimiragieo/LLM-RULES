'use strict';

/**
 * Native File Watcher
 * ===================
 * Monitors the project workspace for file additions/modifications
 * and queues them seamlessly into the SQLite durable message queue
 * for the Ingestion Pipeline. Uses native fs.watch for Windows/macOS
 * recursive support.
 */

const fs = require('fs');
const path = require('path');
const { enqueueMessage } = require('../../db/queue-operations.cjs');

// Debounce map to prevent rapid-fire redundant events
const debounceMap = new Map();
const DEBOUNCE_MS = 2000;

// Directories to purely ignore
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.tmp', '.claude/debug']);

/**
 * Check if the given path should be ignored.
 */
function shouldIgnore(filePath) {
  const parts = filePath.split(path.sep);
  for (const part of parts) {
    if (IGNORED_DIRS.has(part)) return true;
  }
  return false;
}

/**
 * Starts watching the specified directory.
 * @param {string} rootDir
 * @param {import('better-sqlite3').Database} db - SQLite db instance for enqueue
 */
function startWatcher(rootDir = process.cwd(), db) {
  console.log(`[Memory] Starting recursive file watcher on: ${rootDir}`);

  try {
    fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const fullPath = path.join(rootDir, filename);
      if (shouldIgnore(fullPath)) return;

      // Ensure it's not a directory and actually exists (debounce deleted files)
      fs.stat(fullPath, (err, stats) => {
        if (err || !stats.isFile()) return; // Ignored if deleted or dir

        const now = Date.now();
        const lastSeen = debounceMap.get(fullPath) || 0;

        if (now - lastSeen > DEBOUNCE_MS) {
          debounceMap.set(fullPath, now);

          if (!db) {
            console.warn('[Memory] file-watcher: no db provided, skipping enqueue');
            return;
          }
          try {
            enqueueMessage(db, {
              chatId: 'file-watcher',
              userId: 'file-watcher',
              text: JSON.stringify({
                type: 'FILE_INGEST',
                payload: { filePath: fullPath, eventType },
              }),
            });
          } catch (dbErr) {
            console.error(`[Memory] Failed to enqueue file event: ${dbErr.message}`);
          }
        }
      });
    });
  } catch (err) {
    console.error(`[Memory] Failed to start watcher: ${err.message}`);
    console.log(
      '[Memory] Ensure you are on a platform that supports native recursive fs.watch (Windows/macOS)'
    );
  }
}

module.exports = {
  startWatcher,
};
