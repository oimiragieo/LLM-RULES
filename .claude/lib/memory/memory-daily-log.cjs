/**
 * memory-daily-log.cjs - Append-Only Daily Log Writer
 * =====================================================
 *
 * Writes timestamped bullet entries to UTC-dated daily log files:
 *   .claude/context/memory/logs/YYYY/MM/YYYY-MM-DD.md
 *
 * Each entry format: `- [HH:MM:SS] <sanitized content>`
 *
 * Design principles:
 *   - Fail-open: all errors are caught, never throws
 *   - Atomic small appends via fs.appendFileSync (OS-level)
 *   - Recursive directory creation via fs.mkdirSync({recursive:true})
 *   - Content sanitized against prompt injection and XML-like tags
 *   - UTC timestamps throughout
 *
 * Created: Phase 8 — daily-log-consolidation milestone
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { MEMORY_DIR } = require('./memory-paths.cjs');
const { sanitizeMemoryContent } = require('./memory-sanitizer.cjs');

// ── Inline sanitization helpers ──────────────────────────────────────────────

/**
 * Strip XML/HTML-like angle-bracket tags to prevent prompt injection via tags.
 * e.g. `<system>evil</system>` → `evil`
 *
 * @param {string} content
 * @returns {string}
 */
function stripXmlTags(content) {
  return content.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize content for a daily log entry.
 *
 * Applies the memory sanitizer (prototype pollution stripping) and additionally
 * strips XML-like angle-bracket tags to guard against prompt injection patterns.
 *
 * @param {string} content - Raw content string
 * @returns {string} Sanitized content safe to write to the log
 */
function sanitizeForLog(content) {
  const str = String(content == null ? '' : content);
  // Run through the main memory sanitizer (strips prototype pollution keys)
  const result = sanitizeMemoryContent(str);
  const sanitized = typeof result.sanitized === 'string' ? result.sanitized : str;
  // Additionally strip XML-like tags
  return stripXmlTags(sanitized);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the daily log file path for a given date using UTC fields.
 *
 * Path format: `<memoryDir>/logs/YYYY/MM/YYYY-MM-DD.md`
 *
 * @param {Date} date - Date to derive the log path from (uses UTC fields)
 * @param {Object} [options]
 * @param {string} [options.memoryDir] - Override base memory directory (for testing)
 * @returns {string} Absolute path to the daily log file
 */
function getDailyLogPath(date, options) {
  const d = date instanceof Date ? date : new Date();
  const year = String(d.getUTCFullYear());
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const memoryDir = options && options.memoryDir ? options.memoryDir : MEMORY_DIR;
  return path.join(memoryDir, 'logs', year, month, `${year}-${month}-${day}.md`);
}

/**
 * Append a timestamped entry to the daily log file (fail-open).
 *
 * Creates the `logs/YYYY/MM/` directory structure if it does not exist.
 * Uses `fs.appendFileSync` for OS-level atomic small-write append.
 * Content is sanitized before writing.
 *
 * This function NEVER throws — all errors are caught and reported via
 * `console.error` so that callers (e.g. session-end hooks) are not disrupted.
 *
 * @param {string} content - Content to append as a log entry
 * @param {Object} [options]
 * @param {string} [options.memoryDir] - Override base memory directory (for testing)
 * @param {Date}   [options.date]      - Override current timestamp (for testing)
 */
function appendDailyLog(content, options) {
  try {
    const now = options && options.date instanceof Date ? options.date : new Date();
    const logPath = getDailyLogPath(now, options);
    const dir = path.dirname(logPath);

    // Create directory structure recursively (no-op if already exists)
    fs.mkdirSync(dir, { recursive: true });

    // Sanitize content
    const safeContent = sanitizeForLog(String(content == null ? '' : content));

    // Build UTC timestamp [HH:MM:SS]
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');

    // Format as append-only bullet entry
    const entry = `- [${hh}:${mm}:${ss}] ${safeContent}\n`;

    // Atomic small append (OS-level atomicity for writes < PIPE_BUF)
    fs.appendFileSync(logPath, entry, 'utf8');
  } catch (err) {
    console.error('[memory-daily-log] Failed to append daily log entry:', err.message || err);
  }
}

module.exports = {
  appendDailyLog,
  getDailyLogPath,
};
