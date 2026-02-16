'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * M13: RED tests for file-cache.cjs
 *
 * Tests for in-memory file cache with configurable TTL and max entries.
 */

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-cache-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('M13: File Cache Utility', () => {
  test('cache returns cached content within TTL', () => {
    const { FileCache } = require('../../../.claude/lib/utils/file-cache.cjs');
    const cache = new FileCache({ ttlMs: 5000 });

    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'original content');

    // First read should come from disk
    const content1 = cache.readFileSync(testFile);
    assert.strictEqual(content1, 'original content');

    // Modify the file on disk
    fs.writeFileSync(testFile, 'modified content');

    // Second read should still return cached content (within TTL)
    const content2 = cache.readFileSync(testFile);
    assert.strictEqual(content2, 'original content', 'Should return cached content within TTL');
  });

  test('cache expires after TTL', async () => {
    const { FileCache } = require('../../../.claude/lib/utils/file-cache.cjs');
    const cache = new FileCache({ ttlMs: 50 }); // Very short TTL

    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'original content');

    // First read
    const content1 = cache.readFileSync(testFile);
    assert.strictEqual(content1, 'original content');

    // Modify the file on disk
    fs.writeFileSync(testFile, 'modified content');

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 100));

    // Now should read fresh content from disk
    const content2 = cache.readFileSync(testFile);
    assert.strictEqual(content2, 'modified content', 'Should return fresh content after TTL expires');
  });

  test('cache invalidation removes entry', () => {
    const { FileCache } = require('../../../.claude/lib/utils/file-cache.cjs');
    const cache = new FileCache({ ttlMs: 60000 }); // Long TTL

    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'original content');

    // Cache the file
    cache.readFileSync(testFile);

    // Modify the file
    fs.writeFileSync(testFile, 'modified content');

    // Invalidate the cache entry
    cache.invalidate(testFile);

    // Now should read fresh content
    const content = cache.readFileSync(testFile);
    assert.strictEqual(content, 'modified content', 'Should read fresh content after invalidation');
  });

  test('cache size limit with LRU eviction', () => {
    const { FileCache } = require('../../../.claude/lib/utils/file-cache.cjs');
    const cache = new FileCache({ ttlMs: 60000, maxEntries: 2 });

    // Create 3 files
    const file1 = path.join(tmpDir, 'file1.txt');
    const file2 = path.join(tmpDir, 'file2.txt');
    const file3 = path.join(tmpDir, 'file3.txt');
    fs.writeFileSync(file1, 'content-1');
    fs.writeFileSync(file2, 'content-2');
    fs.writeFileSync(file3, 'content-3');

    // Cache all 3 files (max 2)
    cache.readFileSync(file1);
    cache.readFileSync(file2);
    cache.readFileSync(file3); // Should evict file1 (LRU)

    // Verify file1 was evicted
    assert.strictEqual(cache.has(file1), false, 'file1 should be evicted (LRU)');
    assert.strictEqual(cache.has(file2), true, 'file2 should still be cached');
    assert.strictEqual(cache.has(file3), true, 'file3 should still be cached');
  });

  test('cache clear removes all entries', () => {
    const { FileCache } = require('../../../.claude/lib/utils/file-cache.cjs');
    const cache = new FileCache({ ttlMs: 60000 });

    const file1 = path.join(tmpDir, 'file1.txt');
    const file2 = path.join(tmpDir, 'file2.txt');
    fs.writeFileSync(file1, 'content-1');
    fs.writeFileSync(file2, 'content-2');

    cache.readFileSync(file1);
    cache.readFileSync(file2);

    assert.strictEqual(cache.size, 2, 'Cache should have 2 entries');

    cache.clear();

    assert.strictEqual(cache.size, 0, 'Cache should be empty after clear');
    assert.strictEqual(cache.has(file1), false);
    assert.strictEqual(cache.has(file2), false);
  });

  test('cache handles missing files gracefully', () => {
    const { FileCache } = require('../../../.claude/lib/utils/file-cache.cjs');
    const cache = new FileCache({ ttlMs: 60000 });

    const missingFile = path.join(tmpDir, 'nonexistent.txt');

    // Should return null for missing files (not throw)
    const content = cache.readFileSync(missingFile);
    assert.strictEqual(content, null, 'Should return null for missing files');

    // Should not cache the miss
    assert.strictEqual(cache.has(missingFile), false, 'Should not cache missing files');
  });

  test('cache reports size correctly', () => {
    const { FileCache } = require('../../../.claude/lib/utils/file-cache.cjs');
    const cache = new FileCache({ ttlMs: 60000 });

    assert.strictEqual(cache.size, 0);

    const file1 = path.join(tmpDir, 'file1.txt');
    fs.writeFileSync(file1, 'content');
    cache.readFileSync(file1);

    assert.strictEqual(cache.size, 1);
  });

  test('LRU eviction preserves most recently used', () => {
    const { FileCache } = require('../../../.claude/lib/utils/file-cache.cjs');
    const cache = new FileCache({ ttlMs: 60000, maxEntries: 2 });

    const file1 = path.join(tmpDir, 'file1.txt');
    const file2 = path.join(tmpDir, 'file2.txt');
    const file3 = path.join(tmpDir, 'file3.txt');
    fs.writeFileSync(file1, 'content-1');
    fs.writeFileSync(file2, 'content-2');
    fs.writeFileSync(file3, 'content-3');

    cache.readFileSync(file1);
    cache.readFileSync(file2);

    // Access file1 again to make it most recently used
    cache.readFileSync(file1);

    // Adding file3 should evict file2 (least recently used), not file1
    cache.readFileSync(file3);

    assert.strictEqual(cache.has(file1), true, 'file1 should be kept (recently used)');
    assert.strictEqual(cache.has(file2), false, 'file2 should be evicted (LRU)');
    assert.strictEqual(cache.has(file3), true, 'file3 should be cached');
  });
});
