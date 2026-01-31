#!/usr/bin/env node
/**
 * Code Index Updater Hook
 * =======================
 *
 * PostToolUse(Edit|Write) hook that triggers code index updates when
 * source code files are modified.
 *
 * Behavior:
 * - Detects when code files (.js, .ts, .py, etc.) are written/edited
 * - Triggers incremental index update for the modified file
 * - Debounces rapid changes (5s window) to avoid excessive indexing
 * - Fails gracefully if index system unavailable
 *
 * Controls:
 * - CODE_INDEX_AUTO_UPDATE=off -> disable automatic indexing
 * - CODE_INDEX_DEBOUNCE_MS=5000 -> debounce interval (default: 5000ms)
 *
 * Output:
 * - Silent success (no output) - indexing happens in background
 * - Errors logged but don't block file operations (fail-open)
 */

'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');
const path = require('path');
const fs = require('fs').promises;

// Code file extensions that should be indexed
const INDEXABLE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.kt',
  '.cpp',
  '.cc',
  '.cxx',
  '.c',
  '.h',
  '.hpp',
]);

// Exclude patterns (don't index these)
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /\.next/,
  /coverage/,
  /\.min\./,
  /\.bundle\./,
  /\.map$/,
  /\.claude\/context\/code-index/, // Don't index the index itself
];

// Simple lock file for cross-process coordination
const LOCK_FILE = path.join(process.cwd(), '.claude/context/code-index/.indexing.lock');
const DEFAULT_DEBOUNCE_MS = parseInt(process.env.CODE_INDEX_DEBOUNCE_MS || '5000', 10);
const LOCK_TIMEOUT_MS = 10000; // 10 seconds max lock time (indexing should be fast)

function isDisabled() {
  return process.env.CODE_INDEX_AUTO_UPDATE === 'off';
}

function shouldIndexFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;

  // Check extension
  const ext = path.extname(filePath).toLowerCase();
  if (!INDEXABLE_EXTENSIONS.has(ext)) return false;

  // Check exclude patterns
  const normalizedPath = filePath.replace(/\\/g, '/');
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(normalizedPath)) return false;
  }

  return true;
}

/**
 * Simple lock check - returns true if we can proceed, false if another process is indexing
 * For fast indexing (<1s), this lightweight check is sufficient
 */
async function canProceed() {
  try {
    // Check if lock exists and is stale
    const lockStats = await fs.stat(LOCK_FILE);
    const lockAge = Date.now() - lockStats.mtimeMs;

    if (lockAge > LOCK_TIMEOUT_MS) {
      // Stale lock - remove it
      await fs.unlink(LOCK_FILE).catch(() => {});
      return true;
    }

    // Lock is active - another process is indexing
    return false;
  } catch (_err) {
    // Lock file doesn't exist or stat failed - allow proceed (fail-open)
    return true;
  }
}

/**
 * Create lock file (lightweight protection for metadata.json writes)
 */
async function createLock() {
  try {
    await fs.writeFile(
      LOCK_FILE,
      JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
      }),
      { flag: 'wx' } // fail if exists (atomic)
    );
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Remove lock file
 */
async function removeLock() {
  await fs.unlink(LOCK_FILE).catch(() => {});
}

/**
 * Trigger index update with simple debouncing
 */
async function triggerIndexUpdate(filePath) {
  // Quick check - if another process is indexing, skip (they'll handle it)
  const proceed = await canProceed();
  if (!proceed) {
    return; // Another process is handling indexing
  }

  // Try to acquire lock (best-effort, non-blocking)
  const hasLock = await createLock();
  if (!hasLock) {
    return; // Another process got the lock first
  }

  try {
    const { IndexManager } = require('../../lib/code-indexing/index-manager.cjs');
    const projectRoot = process.cwd();

    // Create index manager
    const manager = new IndexManager({ projectRoot });

    // Check if index exists
    const indexMetadataPath = path.join(projectRoot, '.claude/context/code-index/metadata.json');
    const indexExists = await fs
      .access(indexMetadataPath)
      .then(() => true)
      .catch(() => false);

    if (!indexExists) {
      await removeLock();
      return;
    }

    // Use incremental update (Merkle tree) if available, otherwise fall back to directory indexing
    // Run indexing in background (non-blocking)
    setImmediate(async () => {
      try {
        // Try incremental update first (uses Merkle tree for O(log n) change detection)
        const result = await manager.incrementalUpdate({
          onProgress: () => {}, // Silent progress
        });

        if (
          result.updateType === 'incremental' &&
          result.filesAdded === 0 &&
          result.filesModified === 0 &&
          result.filesDeleted === 0
        ) {
          // No changes detected - nothing to do
          debugLog('code-index-updater', 'No changes detected (Merkle tree)');
        } else {
          debugLog(
            'code-index-updater',
            `Incremental update: ${result.filesModified} modified, ${result.filesAdded} added, ${result.filesDeleted} deleted`
          );
        }
      } catch (err) {
        // Fallback: if incremental fails, index the directory containing the file
        debugLog(
          'code-index-updater',
          'Incremental update failed, falling back to directory index',
          err
        );
        try {
          const fileDir = path.dirname(filePath);
          await manager.indexDirectory(fileDir, {
            onProgress: () => {},
          });
        } catch (fallbackErr) {
          debugLog('code-index-updater', `Fallback indexing failed (non-blocking)`, fallbackErr);
        }
      } finally {
        await removeLock();
      }
    });
  } catch (err) {
    debugLog('code-index-updater', 'Index update error (ignored)', err);
    await removeLock();
  }
}

/**
 * Schedule debounced update (simple timer-based)
 */
let debounceTimer = null;
function scheduleDebouncedUpdate(filePath) {
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Schedule update after debounce period
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    triggerIndexUpdate(filePath).catch(() => {
      // Non-blocking - errors are logged but don't affect file operations
    });
  }, DEFAULT_DEBOUNCE_MS);
}

async function main() {
  try {
    if (isDisabled()) {
      process.exit(0);
    }

    const hookInput = await parseHookInputAsync();
    if (!hookInput) process.exit(0);

    const toolName = getToolName(hookInput);
    if (toolName !== 'Write' && toolName !== 'Edit') {
      process.exit(0);
    }

    const toolInput = getToolInput(hookInput);
    if (!toolInput || typeof toolInput !== 'object') process.exit(0);

    const filePath = toolInput.file_path || toolInput.target_file;
    if (!filePath || typeof filePath !== 'string') process.exit(0);

    // Check if this file should be indexed
    if (!shouldIndexFile(filePath)) {
      process.exit(0);
    }

    // Schedule debounced update
    scheduleDebouncedUpdate(filePath);

    // Exit successfully (don't block the tool)
    process.exit(0);
  } catch (err) {
    // Fail open - don't block file operations if hook fails
    debugLog('code-index-updater', 'Hook error (fail open)', err);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}
