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
const { createLogger } = require('../../utils/logger.cjs');

const logger = createLogger('memory-file-watcher');

// Debounce map to prevent rapid-fire redundant events
const debounceMap = new Map();
const DEBOUNCE_MS = 2000;

// Periodic cleanup for debounceMap entries to prevent unbounded memory growth.
// Entries older than DEBOUNCE_MS * 10 are considered stale and safe to remove.
// Uses .unref() so the interval does not prevent the process from exiting.
const DEBOUNCE_CLEANUP_MULTIPLIER = 10;
setInterval(
  () => {
    const staleThreshold = Date.now() - DEBOUNCE_MS * DEBOUNCE_CLEANUP_MULTIPLIER;
    for (const [key, timestamp] of debounceMap) {
      if (timestamp < staleThreshold) {
        debounceMap.delete(key);
      }
    }
  },
  10 * 60 * 1000 /* 10 minutes */
).unref();

// Clean up debounceMap on process exit to release memory
process.on('exit', () => {
  debounceMap.clear();
});

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
  logger.info('Starting recursive file watcher', { rootDir });

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
    logger.warn('Native recursive fs.watch is unavailable on this platform');
  }
}

module.exports = {
  startWatcher,
};
