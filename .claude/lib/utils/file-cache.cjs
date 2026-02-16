#!/usr/bin/env node
/**
 * file-cache.cjs - In-Memory File Cache with TTL and LRU Eviction
 * ================================================================
 *
 * Provides a simple in-memory cache for file contents with:
 * - Configurable TTL (time-to-live) for cache entries
 * - Optional maxEntries with LRU (Least Recently Used) eviction
 * - Graceful handling of missing/unreadable files
 *
 * Created: 2026-02-15 (HIGH-002 / ADR-129)
 */

'use strict';

const fs = require('fs');

/**
 * In-memory file cache with configurable TTL and LRU eviction.
 *
 * @example
 * const cache = new FileCache({ ttlMs: 30000, maxEntries: 100 });
 * const content = cache.readFileSync('/path/to/file.txt');
 */
class FileCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.ttlMs=30000] - Time-to-live in milliseconds
   * @param {number} [options.maxEntries=0] - Max cache entries (0 = unlimited)
   */
  constructor(options = {}) {
    this._ttlMs = options.ttlMs || 30000;
    this._maxEntries = options.maxEntries || 0;
    /** @type {Map<string, {content: string, cachedAt: number}>} */
    this._cache = new Map();
  }

  /**
   * Read a file, returning cached content if within TTL.
   *
   * @param {string} filePath - Absolute path to the file
   * @returns {string|null} File content, or null if file does not exist
   */
  readFileSync(filePath) {
    const now = Date.now();

    // Check cache
    if (this._cache.has(filePath)) {
      const entry = this._cache.get(filePath);
      if (now - entry.cachedAt < this._ttlMs) {
        // Move to end for LRU tracking (delete and re-insert)
        this._cache.delete(filePath);
        this._cache.set(filePath, entry);
        return entry.content;
      }
      // Expired - remove stale entry
      this._cache.delete(filePath);
    }

    // Read from disk
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_err) {
      return null;
    }

    // Evict LRU entry if at capacity
    if (this._maxEntries > 0 && this._cache.size >= this._maxEntries) {
      // Map iteration order is insertion order; first key is LRU
      const lruKey = this._cache.keys().next().value;
      this._cache.delete(lruKey);
    }

    // Store in cache
    this._cache.set(filePath, { content, cachedAt: now });
    return content;
  }

  /**
   * Invalidate (remove) a specific cache entry.
   *
   * @param {string} filePath - Path to invalidate
   */
  invalidate(filePath) {
    this._cache.delete(filePath);
  }

  /**
   * Clear all cache entries.
   */
  clear() {
    this._cache.clear();
  }

  /**
   * Check if a file path is currently cached (and not expired).
   *
   * @param {string} filePath - Path to check
   * @returns {boolean}
   */
  has(filePath) {
    if (!this._cache.has(filePath)) return false;
    const entry = this._cache.get(filePath);
    if (Date.now() - entry.cachedAt >= this._ttlMs) {
      this._cache.delete(filePath);
      return false;
    }
    return true;
  }

  /**
   * Current number of entries in cache (including potentially expired ones).
   *
   * @returns {number}
   */
  get size() {
    return this._cache.size;
  }
}

module.exports = { FileCache };
