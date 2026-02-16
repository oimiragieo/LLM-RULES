#!/usr/bin/env node
/**
 * file-locker.cjs - File-Based Locking Utility
 * =============================================
 *
 * Provides atomic file locking for concurrent write protection.
 * Uses proper-lockfile for cross-platform locking.
 *
 * Created: 2026-02-13 (P0-006 Fix)
 */

'use strict';

const lockfile = require('proper-lockfile');

// Default lock options
const DEFAULT_LOCK_OPTIONS = {
  stale: 15000, // Lock considered stale after 15 seconds
  retries: {
    retries: 20, // Retry for high-contention multi-agent bursts
    minTimeout: 50,
    maxTimeout: 500,
    factor: 1.2,
    randomize: true,
  },
};

/**
 * Acquire lock on file
 *
 * @param {string} filePath - Path to file to lock
 * @param {Object} options - Lock options (overrides defaults)
 * @returns {Promise<Function>} - Release function
 */
async function acquireLock(filePath, options = {}) {
  const lockOptions = { ...DEFAULT_LOCK_OPTIONS, ...options };

  try {
    const release = await lockfile.lock(filePath, lockOptions);
    return release;
  } catch (err) {
    throw new Error(`Failed to acquire lock on ${filePath}: ${err.message}`);
  }
}

/**
 * Execute function with file lock (automatic acquire + release)
 *
 * @param {string} filePath - Path to file to lock
 * @param {Function} fn - Async function to execute while holding lock
 * @param {Object} options - Lock options
 * @returns {Promise<any>} - Result of fn()
 */
async function withLock(filePath, fn, options = {}) {
  const release = await acquireLock(filePath, options);

  try {
    const result = await fn();
    return result;
  } finally {
    // Always release lock, even on error
    try {
      await release();
    } catch (releaseErr) {
      // Log error but don't throw - original error is more important
      process.stderr.write(
        `[file-locker] Failed to release lock on ${filePath}: ${releaseErr.message}\n`
      );
    }
  }
}

/**
 * Check if file is currently locked
 *
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} - True if locked
 */
async function isLocked(filePath) {
  try {
    return await lockfile.check(filePath);
  } catch (_err) {
    return false;
  }
}

module.exports = {
  acquireLock,
  withLock,
  isLocked,
  DEFAULT_LOCK_OPTIONS,
};
