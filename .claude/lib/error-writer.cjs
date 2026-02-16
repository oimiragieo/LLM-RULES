#!/usr/bin/env node
// @ts-check
/**
 * Error Writer Library
 *
 * Persists errors to JSONL files with:
 * - Daily rotation (new file at UTC midnight)
 * - Atomic writes (prevent corruption)
 * - Retry logic (3 attempts with exponential backoff)
 * - Archival (move old logs to archive folder)
 * - Compression (gzip logs older than 7 days)
 *
 * Location: .claude/context/artifacts/error-reports/
 * Format: errors-YYYY-MM-DD.jsonl (one JSON object per line)
 *
 * @module lib/error-writer
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { safeParseJSON } = require('./utils/safe-json.cjs');

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get error reports directory
 * Allows override via environment variable for testing
 */
function getErrorReportsDir() {
  if (process.env.ERROR_REPORTS_DIR) {
    return process.env.ERROR_REPORTS_DIR;
  }
  return path.join(process.cwd(), '.claude', 'context', 'artifacts', 'error-reports');
}

/**
 * Get archive directory
 */
function getArchiveDir() {
  return path.join(getErrorReportsDir(), 'archive');
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 100, // ms
};

// Archival configuration
const ARCHIVE_CONFIG = {
  activeRetention: 7, // days before archiving
  compressAfter: 7, // days in archive before compression
  deleteAfter: 30, // days total retention
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure directory exists
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 * @returns {string}
 */
function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get log file name for a date
 * @param {string} dateStr - YYYY-MM-DD format
 * @returns {string}
 */
function getLogFileName(dateStr) {
  return `errors-${dateStr}.jsonl`;
}

// =============================================================================
// Write Functions
// =============================================================================

/**
 * Get path to the active (today's) log file
 * @returns {string}
 */
function getActiveLogFile() {
  const dir = getErrorReportsDir();
  const dateStr = getTodayDateString();
  return path.join(dir, getLogFileName(dateStr));
}

/**
 * Synchronous sleep for exponential backoff
 *
 * SEC-AUDIT-020 FIX: Uses Atomics.wait() when available to properly block
 * the thread without CPU spin. Falls back to busy-wait on older Node.js.
 *
 * @param {number} ms - Milliseconds to sleep
 */
function syncSleep(ms) {
  // Use Atomics.wait for proper blocking (Node.js v16+)
  if (typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined') {
    try {
      // Create a shared buffer that will never be signaled (timeout-only)
      const sharedBuffer = new SharedArrayBuffer(4);
      const int32 = new Int32Array(sharedBuffer);
      // Atomics.wait blocks the thread without CPU spin
      Atomics.wait(int32, 0, 0, ms);
      return;
    } catch (_e) {
      // Fall through to busy-wait if Atomics.wait fails
    }
  }
  // Fallback to busy-wait for older Node.js versions
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait - only used when Atomics.wait unavailable
  }
}

/**
 * Write error entry to log file with retry logic
 *
 * @param {Object} errorEntry - Error entry object
 * @returns {boolean} True if write succeeded, false otherwise
 */
function writeError(errorEntry) {
  // Validate entry
  if (!errorEntry || typeof errorEntry !== 'object') {
    if (process.env.DEBUG_ERROR_WRITER) {
      console.error('[error-writer] Invalid entry:', errorEntry);
    }
    return false;
  }

  const logFile = getActiveLogFile();
  const line = JSON.stringify(errorEntry) + '\n';

  // Ensure directory exists
  try {
    ensureDir(path.dirname(logFile));
  } catch (e) {
    if (process.env.DEBUG_ERROR_WRITER) {
      console.error('[error-writer] Failed to create directory:', e.message);
    }
    return false;
  }

  // Retry loop
  let lastError;
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Append to file (atomic append on most filesystems)
      fs.appendFileSync(logFile, line, { encoding: 'utf8', flag: 'a' });
      return true;
    } catch (e) {
      lastError = e;

      // Check if error is transient
      if (e.code === 'EBUSY' || e.code === 'EAGAIN' || e.code === 'EMFILE') {
        // Wait before retry
        const delay = RETRY_CONFIG.baseDelay * Math.pow(2, attempt);
        syncSleep(delay);
        continue;
      }

      // Non-transient error, don't retry
      break;
    }
  }

  // All retries failed
  if (process.env.DEBUG_ERROR_WRITER) {
    console.error('[error-writer] Write failed after retries:', lastError?.message);
  }
  return false;
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Query errors from log files
 *
 * @param {Object} filter - Query filter
 * @param {string} [filter.category] - Filter by category
 * @param {string} [filter.severity] - Filter by severity
 * @param {string} [filter.date] - Filter by date (YYYY-MM-DD)
 * @param {string} [filter.agentName] - Filter by agent name
 * @param {string} [filter.taskId] - Filter by task ID
 * @param {number} [filter.limit] - Maximum number of results
 * @returns {Object[]} Array of matching error entries
 */
function queryErrors(filter = {}) {
  const dir = getErrorReportsDir();

  // Determine which files to search
  let files = [];
  if (filter.date) {
    // Single date
    const fileName = getLogFileName(filter.date);
    const filePath = path.join(dir, fileName);
    if (fs.existsSync(filePath)) {
      files.push(filePath);
    }
  } else {
    // All files in directory
    try {
      if (fs.existsSync(dir)) {
        files = fs
          .readdirSync(dir)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => path.join(dir, f))
          .sort()
          .reverse(); // Most recent first
      }
    } catch (e) {
      if (process.env.DEBUG_ERROR_WRITER) {
        console.error('[error-writer] Failed to list files:', e.message);
      }
      return [];
    }
  }

  const results = [];
  const limit = filter.limit || 1000;

  for (const file of files) {
    if (results.length >= limit) break;

    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        if (results.length >= limit) break;

        try {
          const entry = safeParseJSON(line);
          if (!entry || typeof entry !== 'object' || Object.keys(entry).length === 0) continue;

          // Apply filters
          if (filter.category && entry.category !== filter.category) continue;
          if (filter.severity && entry.severity !== filter.severity) continue;
          if (filter.agentName && entry.context?.agentName !== filter.agentName) continue;
          if (filter.taskId && entry.context?.taskId !== filter.taskId) continue;

          results.push(entry);
        } catch (_e) {
          // Skip invalid lines
          if (process.env.DEBUG_ERROR_WRITER) {
            console.error('[error-writer] Invalid JSON line:', line.slice(0, 50));
          }
        }
      }
    } catch (e) {
      if (process.env.DEBUG_ERROR_WRITER) {
        console.error('[error-writer] Failed to read file:', file, e.message);
      }
    }
  }

  return results;
}

// =============================================================================
// Archival Functions
// =============================================================================

/**
 * Archive old log files
 *
 * @param {Object} options - Archival options
 * @param {number} [options.daysOld] - Days before archiving (default: 7)
 * @param {boolean} [options.compress] - Compress archived files (default: true)
 * @returns {{archived: number, compressed: number, deleted: number}}
 */
function archiveOldLogs(options = {}) {
  const { daysOld = ARCHIVE_CONFIG.activeRetention, compress = true } = options;

  const dir = getErrorReportsDir();
  const archiveDir = getArchiveDir();

  const results = { archived: 0, compressed: 0, deleted: 0 };

  // Ensure directories exist
  try {
    ensureDir(archiveDir);
  } catch (e) {
    if (process.env.DEBUG_ERROR_WRITER) {
      console.error('[error-writer] Failed to create archive directory:', e.message);
    }
    return results;
  }

  // Calculate cutoff date
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // List log files
  let files = [];
  try {
    if (fs.existsSync(dir)) {
      files = fs.readdirSync(dir).filter(f => f.startsWith('errors-') && f.endsWith('.jsonl'));
    }
  } catch (e) {
    if (process.env.DEBUG_ERROR_WRITER) {
      console.error('[error-writer] Failed to list files:', e.message);
    }
    return results;
  }

  for (const fileName of files) {
    // Extract date from filename (errors-YYYY-MM-DD.jsonl)
    const match = fileName.match(/errors-(\d{4}-\d{2}-\d{2})\.jsonl/);
    if (!match) continue;

    const fileDate = match[1];
    if (fileDate >= cutoffStr) continue; // Not old enough

    const sourcePath = path.join(dir, fileName);
    const month = fileDate.slice(0, 7); // YYYY-MM
    const monthDir = path.join(archiveDir, month);

    try {
      ensureDir(monthDir);

      if (compress) {
        // Compress and move
        const content = fs.readFileSync(sourcePath);
        const compressed = zlib.gzipSync(content);
        const destPath = path.join(monthDir, fileName + '.gz');
        fs.writeFileSync(destPath, compressed);
        fs.unlinkSync(sourcePath);
        results.archived++;
        results.compressed++;
      } else {
        // Just move
        const destPath = path.join(monthDir, fileName);
        fs.renameSync(sourcePath, destPath);
        results.archived++;
      }
    } catch (e) {
      if (process.env.DEBUG_ERROR_WRITER) {
        console.error('[error-writer] Failed to archive:', fileName, e.message);
      }
    }
  }

  // Delete very old archives
  const deleteCutoff = new Date();
  deleteCutoff.setDate(deleteCutoff.getDate() - ARCHIVE_CONFIG.deleteAfter);
  const deleteCutoffStr = deleteCutoff.toISOString().slice(0, 10);

  try {
    if (fs.existsSync(archiveDir)) {
      const months = fs.readdirSync(archiveDir);
      for (const month of months) {
        const monthPath = path.join(archiveDir, month);
        if (!fs.statSync(monthPath).isDirectory()) continue;

        const archivedFiles = fs.readdirSync(monthPath);
        for (const archived of archivedFiles) {
          const match = archived.match(/errors-(\d{4}-\d{2}-\d{2})/);
          if (!match) continue;

          if (match[1] < deleteCutoffStr) {
            fs.unlinkSync(path.join(monthPath, archived));
            results.deleted++;
          }
        }

        // Remove empty month directories
        if (fs.readdirSync(monthPath).length === 0) {
          fs.rmdirSync(monthPath);
        }
      }
    }
  } catch (e) {
    if (process.env.DEBUG_ERROR_WRITER) {
      console.error('[error-writer] Failed to clean old archives:', e.message);
    }
  }

  return results;
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  writeError,
  getActiveLogFile,
  queryErrors,
  archiveOldLogs,
  // Configuration getters for testing
  getErrorReportsDir,
  getArchiveDir,
};
