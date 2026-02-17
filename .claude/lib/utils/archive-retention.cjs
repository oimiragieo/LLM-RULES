/**
 * archive-retention.cjs
 * Archive cleanup with retention policy
 *
 * @module archive-retention
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Audit archive directories and optionally clean up stale files
 *
 * Identifies files older than retention period and optionally deletes them.
 * Respects minimum keep count to preserve newest files.
 *
 * @param {Object} options - Configuration options
 * @param {number} [options.retentionDays=90] - Files older than this are stale
 * @param {number} [options.minKeep=5] - Minimum number of files to keep (newest)
 * @param {boolean} [options.dryRun=true] - If true, don't actually delete files
 * @param {string[]} options.archiveDirs - Array of archive directory paths to scan
 *
 * @returns {Object} Summary of audit results
 * @returns {number} return.total - Total files found
 * @returns {number} return.stale - Number of stale files (would be/were deleted)
 * @returns {number} return.kept - Number of files kept
 * @returns {string} return.summary - Human-readable summary
 *
 * @example
 * const { auditArchives } = require('.claude/lib/utils/archive-retention.cjs');
 *
 * // Dry run (default)
 * const result = auditArchives({
 *   archiveDirs: ['.claude/hooks/_archive', '.claude/tools/_archive'],
 *   retentionDays: 90,
 *   minKeep: 5,
 *   dryRun: true
 * });
 * console.log(result.summary);
 * // => "Archive Audit (DRY RUN): 75 total, 60 stale, 15 kept"
 *
 * // Actual cleanup
 * const result = auditArchives({
 *   archiveDirs: ['.claude/hooks/_archive'],
 *   retentionDays: 90,
 *   minKeep: 5,
 *   dryRun: false
 * });
 * console.log(result.summary);
 * // => "Archive Cleanup: 75 total, 60 deleted, 15 kept"
 */
function auditArchives(options) {
  const { retentionDays = 90, minKeep = 5, dryRun = true, archiveDirs = [] } = options || {};

  // Collect all files from all archive directories
  const allFiles = [];

  for (const archiveDir of archiveDirs) {
    if (!fs.existsSync(archiveDir)) {
      continue;
    }

    const files = fs.readdirSync(archiveDir);
    for (const file of files) {
      const filePath = path.join(archiveDir, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        allFiles.push({
          path: filePath,
          mtime: stats.mtime,
          ageMs: Date.now() - stats.mtime.getTime(),
        });
      }
    }
  }

  // Sort by age (newest first, so index 0 is newest)
  allFiles.sort((a, b) => a.ageMs - b.ageMs);

  const total = allFiles.length;
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

  // Identify stale files
  const staleFiles = [];
  const keptFiles = [];

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const isStale = file.ageMs > retentionMs;
    const shouldKeepForMinKeep = i < minKeep; // Keep N newest (index 0..minKeep-1)

    if (isStale && !shouldKeepForMinKeep) {
      staleFiles.push(file);
    } else {
      keptFiles.push(file);
    }
  }

  const staleCount = staleFiles.length;
  const keptCount = keptFiles.length;

  // Delete stale files if not dry run
  if (!dryRun && staleCount > 0) {
    for (const file of staleFiles) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        // Log error but continue (don't fail entire audit)
        console.error(`Failed to delete ${file.path}:`, err.message);
      }
    }
  }

  // Generate summary
  const modeStr = dryRun ? 'DRY RUN' : 'Cleanup';
  const actionStr = dryRun ? 'stale' : 'deleted';
  const summary = `Archive ${modeStr}: ${total} total, ${staleCount} ${actionStr}, ${keptCount} kept`;

  return {
    total,
    stale: staleCount,
    kept: keptCount,
    summary,
  };
}

module.exports = { auditArchives };
