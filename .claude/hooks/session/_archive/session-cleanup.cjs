#!/usr/bin/env node
/**
 * Session Cleanup Hook
 *
 * PreToolUse hook that cleans up stale files in .claude/context/tmp/
 * when older than 24 hours. Runs on first tool use of a session.
 *
 * Purpose: Prevent accumulation of temporary files across sessions
 * by automatically removing files that are more than 24 hours old.
 *
 * Enforcement:
 * - Runs once per session (on first tool invocation)
 * - Deletes files with mtime > 24 hours
 * - NEVER blocks tools (always returns "approve")
 * - Gracefully handles missing directory
 *
 * Exit codes:
 * - 0: Always allow operation (fail-open design)
 *
 * Output:
 * - JSON { "decision": "approve" } to stdout
 * - Cleanup stats logged to stderr only
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Track if cleanup already ran this session
let cleanupRan = false;

/**
 * Get the absolute path to the tmp directory
 * @returns {string} Absolute path to .claude/context/tmp/
 */
function getTmpDir() {
  // Find project root by looking for .claude directory
  const cwd = process.cwd();
  const claudeDir = path.join(cwd, '.claude');

  if (!fs.existsSync(claudeDir)) {
    // Not in project root - try parent directories
    const parts = cwd.split(path.sep);
    for (let i = parts.length; i > 0; i--) {
      // Use path.sep to join parts, not manual join
      const testRoot = parts.slice(0, i).join(path.sep);
      const testPath = path.join(testRoot, '.claude');
      if (fs.existsSync(testPath)) {
        return path.join(testPath, 'context', 'tmp');
      }
    }
  }

  return path.join(claudeDir, 'context', 'tmp');
}

/**
 * Clean up files older than 24 hours in tmp directory
 * @returns {{ deleted: number, errors: number, bytes: number }}
 */
function cleanupTmpFiles() {
  const tmpDir = getTmpDir();

  // If directory doesn't exist, nothing to clean
  if (!fs.existsSync(tmpDir)) {
    return { deleted: 0, errors: 0, bytes: 0 };
  }

  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  let deleted = 0;
  let errors = 0;
  let bytes = 0;

  try {
    const files = fs.readdirSync(tmpDir);

    for (const file of files) {
      const filePath = path.join(tmpDir, file);

      try {
        const stats = fs.statSync(filePath);

        // Skip directories
        if (stats.isDirectory()) {
          continue;
        }

        const age = now - stats.mtimeMs;

        // Delete if older than 24 hours
        if (age > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
          bytes += stats.size;
        }
      } catch (err) {
        // Log error but continue with other files
        console.error(`[session-cleanup] Error processing ${file}: ${err.message}`);
        errors++;
      }
    }
  } catch (err) {
    // Log error reading directory
    console.error(`[session-cleanup] Error reading tmp directory: ${err.message}`);
    errors++;
  }

  return { deleted, errors, bytes };
}

/**
 * Format bytes as human-readable size
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted size (e.g., "1.5 MB")
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Skip if cleanup already ran this session
    if (cleanupRan) {
      // Approve silently
      console.log(JSON.stringify({ decision: 'approve' }));
      process.exit(0);
    }

    // Mark cleanup as run
    cleanupRan = true;

    // Run cleanup
    const result = cleanupTmpFiles();

    // Log cleanup stats to stderr (never stdout for non-structured output)
    if (result.deleted > 0) {
      console.error(
        `[session-cleanup] Cleaned ${result.deleted} file(s) (${formatBytes(result.bytes)}) from tmp/`
      );
    }

    if (result.errors > 0) {
      console.error(`[session-cleanup] ${result.errors} error(s) during cleanup`);
    }

    // ALWAYS approve - never block tools
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
  } catch (err) {
    // On any error, fail open (allow tool to proceed)
    if (process.env.DEBUG_HOOKS) {
      console.error('[session-cleanup] Error:', err.message);
    }
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  main,
  cleanupTmpFiles,
  getTmpDir,
  formatBytes,
};
