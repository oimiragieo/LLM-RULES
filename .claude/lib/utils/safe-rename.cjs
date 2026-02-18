/**
 * safe-rename.cjs
 * Atomic file rename with cross-drive fallback
 *
 * @module safe-rename
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Safely rename a file, with fallback for cross-drive operations
 *
 * On Windows, fs.renameSync fails with EXDEV error when source and
 * destination are on different drives. This function automatically
 * falls back to copy+delete pattern in that case.
 *
 * @param {string} srcPath - Source file path
 * @param {string} destPath - Destination file path
 * @throws {Error} If source file doesn't exist or operation fails
 *
 * @example
 * const { safeRenameSync } = require('.claude/lib/utils/safe-rename.cjs');
 *
 * // Simple same-drive rename
 * safeRenameSync('file.txt', 'renamed.txt');
 *
 * // Cross-drive rename (automatically uses copy+delete)
 * safeRenameSync('C:/temp/file.txt', 'D:/backup/file.txt');
 */
function safeRenameSync(srcPath, destPath) {
  // Validate source exists
  if (!fs.existsSync(srcPath)) {
    const err = new Error(
      `ENOENT: no such file or directory, rename '${srcPath}' -> '${destPath}'`
    );
    err.code = 'ENOENT';
    throw err;
  }

  try {
    // Try fast atomic rename first (works on same drive)
    fs.renameSync(srcPath, destPath);
  } catch (err) {
    // If EXDEV error (cross-device link), fall back to copy+delete
    if (err.code === 'EXDEV') {
      copyAndDeleteFallback(srcPath, destPath);
    } else {
      // Re-throw other errors
      throw err;
    }
  }
}

/**
 * Fallback copy+delete operation for cross-drive renames
 * Uses temporary file for atomicity
 *
 * @param {string} srcPath - Source file path
 * @param {string} destPath - Destination file path
 * @private
 */
function copyAndDeleteFallback(srcPath, destPath) {
  const destDir = path.dirname(destPath);
  // Bug 3 fix: use random hex suffix to avoid concurrent collision
  const tempPath = path.join(
    destDir,
    `.${path.basename(destPath)}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );
  // Track whether dest was written (copy+rename to dest succeeded)
  let destWritten = false;

  try {
    // 1. Copy to temporary file first (atomic if dest drive supports it)
    fs.copyFileSync(srcPath, tempPath);

    // 2. Rename temp to final destination (should be same drive, so atomic)
    //    If this also fails with EXDEV, we just copy directly
    try {
      fs.renameSync(tempPath, destPath);
      destWritten = true;
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV') {
        // If even temp->dest fails (shouldn't happen on same drive),
        // just copy directly
        fs.copyFileSync(tempPath, destPath);
        destWritten = true;
        fs.unlinkSync(tempPath);
      } else {
        throw renameErr;
      }
    }

    // 3. Delete source only after successful copy to dest
    fs.unlinkSync(srcPath);
  } catch (err) {
    // Cleanup temp file if it exists
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_cleanupErr) {
        // Ignore cleanup errors
      }
    }
    // Bug 4 fix: if dest was written but src removal failed, clean up dest
    // to restore consistent state (avoid having data at both src and dest)
    if (destWritten && fs.existsSync(destPath)) {
      try {
        fs.unlinkSync(destPath);
      } catch (_cleanupErr) {
        // Best-effort cleanup — ignore errors
      }
    }
    throw err;
  }
}

module.exports = { safeRenameSync };
