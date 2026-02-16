#!/usr/bin/env node
/**
 * Atomic File Write Utility
 *
 * Prevents data corruption by writing to a temp file first, then renaming.
 * This is critical for state files that must not be corrupted if the process
 * crashes mid-write.
 *
 * Pattern: Write to .tmp-<random> -> Atomic rename to target
 *
 * Why this matters:
 * - fs.writeFileSync can leave partial/corrupted files on crash
 * - fs.renameSync is atomic on most filesystems (POSIX guarantee)
 * - Temp file in same directory ensures same filesystem (required for atomic rename)
 *
 * Usage:
 *   const { atomicWriteSync, atomicWriteJSONSync } = require('./atomic-write.cjs');
 *
 *   // Write text/binary content
 *   atomicWriteSync('/path/to/file.txt', 'content');
 *
 *   // Write JSON with pretty printing
 *   atomicWriteJSONSync('/path/to/state.json', { mode: 'agent' });
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lockfile = require('proper-lockfile');

/**
 * Write file atomically (write to temp, then rename)
 * Prevents data corruption on crash/power failure
 *
 * @param {string} filePath - Absolute path to target file
 * @param {string|Buffer} content - Content to write
 * @param {Object|string} [options] - fs.writeFileSync options (encoding, mode, flag)
 * @throws {Error} If write or rename fails
 */
/**
 * Sleep for a given number of milliseconds (busy wait for sync context)
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    // Busy wait
  }
}

function atomicWriteSync(filePath, content, options = {}) {
  const dir = path.dirname(filePath);
  const tempFile = path.join(dir, `.tmp-${crypto.randomBytes(4).toString('hex')}`);
  const syncLockEnabled =
    String(process.env.ATOMIC_WRITE_SYNC_LOCK || 'on')
      .trim()
      .toLowerCase() !== 'off';
  let releaseLock = null;

  try {
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (syncLockEnabled) {
      const lockTarget = fs.existsSync(filePath) ? filePath : dir;
      const maxWaitMs = Number(process.env.ATOMIC_WRITE_SYNC_LOCK_TIMEOUT_MS || 3000);
      const retryMs = Number(process.env.ATOMIC_WRITE_SYNC_LOCK_RETRY_MS || 25);
      const deadline = Date.now() + (Number.isFinite(maxWaitMs) && maxWaitMs > 0 ? maxWaitMs : 3000);
      const effectiveRetryMs = Number.isFinite(retryMs) && retryMs > 0 ? retryMs : 25;

      for (;;) {
        try {
          releaseLock = lockfile.lockSync(lockTarget, { stale: 5000 });
          break;
        } catch (lockErr) {
          const lockBusy =
            lockErr &&
            (lockErr.code === 'ELOCKED' ||
              lockErr.code === 'EEXIST' ||
              /already locked/i.test(lockErr.message || ''));
          if (!lockBusy || Date.now() >= deadline) {
            throw lockErr;
          }
          sleep(effectiveRetryMs);
        }
      }
    }

    // Write to temp file
    fs.writeFileSync(tempFile, content, options);

    // SEC-AUDIT-013 FIX: Windows-specific handling for atomic rename
    if (process.platform === 'win32') {
      // On Windows, fs.renameSync can fail if destination exists or is locked
      // Strategy: unlink destination first, with retry on EBUSY/EPERM
      if (fs.existsSync(filePath)) {
        let retries = 3;
        while (retries > 0) {
          try {
            fs.unlinkSync(filePath);
            break;
          } catch (unlinkErr) {
            if ((unlinkErr.code === 'EBUSY' || unlinkErr.code === 'EPERM') && retries > 1) {
              // File is locked, wait and retry
              sleep(50);
              retries--;
            } else {
              throw unlinkErr;
            }
          }
        }
      }
    }

    // Atomic rename
    fs.renameSync(tempFile, filePath);
  } catch (e) {
    // Clean up temp file on error
    // CRITICAL-NEW-001 FIX: Remove TOCTOU race by handling ENOENT directly
    try {
      fs.unlinkSync(tempFile);
    } catch (cleanupErr) {
      // ENOENT is fine - file was already cleaned up or never created
      if (cleanupErr.code !== 'ENOENT' && process.env.DEBUG_ATOMIC_WRITE) {
        console.error(`[atomic-write] Cleanup failed: ${cleanupErr.message}`);
      }
    }
    throw e;
  } finally {
    if (typeof releaseLock === 'function') {
      try {
        releaseLock();
      } catch (_unlockErr) {
        // Best effort unlock.
      }
    }
  }
}

/**
 * SEC-AUDIT-013/014 FIX: Write file atomically with cross-platform locking (async)
 *
 * Uses proper-lockfile to prevent race conditions during concurrent writes.
 * This is the async version that provides stronger guarantees than atomicWriteSync
 * by using battle-tested locking with stale lock detection.
 *
 * @param {string} filePath - Absolute path to target file
 * @param {string|Buffer} content - Content to write
 * @param {Object|string} [options] - fs.promises.writeFile options (encoding, mode, flag)
 * @param {Object} [options.lockOptions] - proper-lockfile options override
 * @returns {Promise<void>}
 * @throws {Error} If write, rename, or locking fails
 */
async function atomicWriteAsync(filePath, content, options = {}) {
  const dir = path.dirname(filePath);
  const tempFile = path.join(dir, `.tmp-${crypto.randomBytes(4).toString('hex')}`);

  // Ensure directory exists
  await fs.promises.mkdir(dir, { recursive: true });

  // Determine lock target: file if exists, directory if not
  const lockTarget = fs.existsSync(filePath) ? filePath : dir;

  // Configure locking with stale lock detection
  const lockOptions = options.lockOptions || {
    stale: 5000, // Consider lock stale after 5 seconds
    retries: {
      retries: 5,
      factor: 2,
      minTimeout: 100,
      maxTimeout: 1000,
    },
  };

  // Acquire exclusive lock
  const release = await lockfile.lock(lockTarget, lockOptions);

  try {
    // Write to temp file
    await fs.promises.writeFile(tempFile, content, options);

    // On Windows, we need to handle the rename differently
    if (process.platform === 'win32') {
      // Delete target if exists (under lock protection)
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }

    // Rename (now safe because we hold lock)
    await fs.promises.rename(tempFile, filePath);
  } finally {
    // Always release lock
    await release();

    // Clean up temp file if it still exists (belt and suspenders)
    try {
      await fs.promises.unlink(tempFile);
    } catch (_e) {
      // Ignore - either succeeded or rename moved it
    }
  }
}

/**
 * Write JSON atomically with pretty printing
 *
 * @param {string} filePath - Absolute path to target file
 * @param {*} data - Data to serialize to JSON
 * @throws {Error} If serialization, write, or rename fails
 */
function atomicWriteJSONSync(filePath, data) {
  const content = JSON.stringify(data, null, 2) + '\n';
  atomicWriteSync(filePath, content, 'utf8');
}

/**
 * HOOK-006 FIX: Create a backup of existing file before modification
 * Creates a .bak file with timestamp to preserve previous state
 *
 * @param {string} filePath - Absolute path to file to backup
 * @param {Object} [options] - Backup options
 * @param {boolean} [options.keepMultiple=false] - Keep multiple backups with timestamps
 * @returns {string|null} Path to backup file if created, null if no existing file
 */
function createBackup(filePath, options = {}) {
  const { keepMultiple = false } = options;

  // Only backup if file exists
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const backupPath = keepMultiple ? `${filePath}.bak.${Date.now()}` : `${filePath}.bak`;

    // Read current content and write to backup
    const content = fs.readFileSync(filePath);
    atomicWriteSync(backupPath, content);

    if (process.env.DEBUG_ATOMIC_WRITE) {
      console.error(`[atomic-write] Backup created: ${backupPath}`);
    }

    return backupPath;
  } catch (e) {
    // Backup failure should not block the main operation
    if (process.env.DEBUG_ATOMIC_WRITE) {
      console.error(`[atomic-write] Backup failed: ${e.message}`);
    }
    return null;
  }
}

/**
 * HOOK-006 FIX: Restore from backup file
 *
 * @param {string} filePath - Absolute path to file to restore
 * @param {string} [backupPath] - Path to backup file (defaults to filePath.bak)
 * @returns {boolean} True if restore successful, false otherwise
 */
function restoreFromBackup(filePath, backupPath = null) {
  const backup = backupPath || `${filePath}.bak`;

  if (!fs.existsSync(backup)) {
    if (process.env.DEBUG_ATOMIC_WRITE) {
      console.error(`[atomic-write] No backup found: ${backup}`);
    }
    return false;
  }

  try {
    const content = fs.readFileSync(backup);
    atomicWriteSync(filePath, content);

    if (process.env.DEBUG_ATOMIC_WRITE) {
      console.error(`[atomic-write] Restored from: ${backup}`);
    }

    return true;
  } catch (e) {
    if (process.env.DEBUG_ATOMIC_WRITE) {
      console.error(`[atomic-write] Restore failed: ${e.message}`);
    }
    return false;
  }
}

/**
 * Write JSON atomically with automatic backup (HOOK-006 FIX)
 *
 * Creates a backup of the existing file before writing new content.
 * Use this for critical state files where recovery is important.
 *
 * @param {string} filePath - Absolute path to target file
 * @param {*} data - Data to serialize to JSON
 * @param {Object} [options] - Options
 * @param {boolean} [options.backup=true] - Create backup before writing
 * @throws {Error} If serialization, write, or rename fails
 */
function atomicWriteJSONSyncWithBackup(filePath, data, options = {}) {
  const { backup = true } = options;

  if (backup) {
    createBackup(filePath);
  }

  atomicWriteJSONSync(filePath, data);
}

module.exports = {
  atomicWriteSync,
  atomicWriteAsync, // SEC-AUDIT-013/014 FIX: async version with proper-lockfile
  atomicWriteJSONSync,
  atomicWriteJSONSyncWithBackup,
  createBackup,
  restoreFromBackup,
};
