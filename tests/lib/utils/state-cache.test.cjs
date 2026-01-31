#!/usr/bin/env node
/**
 * State Cache Tests
 * =================
 *
 * TDD tests for the state-cache.cjs module.
 * Tests cover: caching, TTL expiration, invalidation, error handling.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// The module we're testing (will fail until implemented)
let stateCache;
try {
  stateCache = require('../../../.claude/lib/utils/state-cache.cjs');
} catch (_err) {
  // Module doesn't exist yet - expected in RED phase
  stateCache = null;
}

describe('state-cache', () => {
  let testDir;
  let testFile;

  beforeEach(() => {
    // Create temp directory for test files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-cache-test-'));
    testFile = path.join(testDir, 'test-state.json');

    // Clear cache before each test
    if (stateCache && stateCache.clearAllCache) {
      stateCache.clearAllCache();
    }
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('module exports', () => {
    it('should export getCachedState function', () => {
      assert.ok(stateCache, 'Module should be loadable');
      assert.strictEqual(
        typeof stateCache.getCachedState,
        'function',
        'getCachedState should be a function'
      );
    });

    it('should export invalidateCache function', () => {
      assert.ok(stateCache, 'Module should be loadable');
      assert.strictEqual(
        typeof stateCache.invalidateCache,
        'function',
        'invalidateCache should be a function'
      );
    });

    it('should export clearAllCache function', () => {
      assert.ok(stateCache, 'Module should be loadable');
      assert.strictEqual(
        typeof stateCache.clearAllCache,
        'function',
        'clearAllCache should be a function'
      );
    });

    it('should export DEFAULT_TTL_MS constant', () => {
      assert.ok(stateCache, 'Module should be loadable');
      assert.strictEqual(
        typeof stateCache.DEFAULT_TTL_MS,
        'number',
        'DEFAULT_TTL_MS should be a number'
      );
      assert.strictEqual(stateCache.DEFAULT_TTL_MS, 1000, 'DEFAULT_TTL_MS should be 1000ms');
    });
  });

  describe('getCachedState', () => {
    it('should read file and return parsed JSON', () => {
      assert.ok(stateCache, 'Module should be loadable');

      const testData = { key: 'value', nested: { a: 1 } };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      const result = stateCache.getCachedState(testFile);
      assert.deepStrictEqual(result, testData, 'Should return parsed JSON');
    });

    it('should return default value when file does not exist', () => {
      assert.ok(stateCache, 'Module should be loadable');

      const nonExistentFile = path.join(testDir, 'non-existent.json');
      const defaultValue = { default: true };

      const result = stateCache.getCachedState(nonExistentFile, defaultValue);
      assert.deepStrictEqual(result, defaultValue, 'Should return default value');
    });

    it('should return empty object as default when no default provided', () => {
      assert.ok(stateCache, 'Module should be loadable');

      const nonExistentFile = path.join(testDir, 'non-existent.json');

      const result = stateCache.getCachedState(nonExistentFile);
      assert.deepStrictEqual(result, {}, 'Should return empty object');
    });

    it('should return default value on JSON parse error', () => {
      assert.ok(stateCache, 'Module should be loadable');

      fs.writeFileSync(testFile, 'not valid json {{{');
      const defaultValue = { fallback: true };

      const result = stateCache.getCachedState(testFile, defaultValue);
      assert.deepStrictEqual(result, defaultValue, 'Should return default on parse error');
    });

    it('should cache the result and return cached value on subsequent calls', () => {
      assert.ok(stateCache, 'Module should be loadable');

      const testData = { cached: true };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      // First call - reads from file
      const result1 = stateCache.getCachedState(testFile);
      assert.deepStrictEqual(result1, testData, 'First call should return file data');

      // Modify file after first read
      const newData = { cached: false, modified: true };
      fs.writeFileSync(testFile, JSON.stringify(newData));

      // Second call - should return cached data (TTL not expired)
      const result2 = stateCache.getCachedState(testFile);
      assert.deepStrictEqual(
        result2,
        testData,
        'Second call should return cached data, not new file data'
      );
    });

    it('should re-read file after TTL expires', (t, done) => {
      assert.ok(stateCache, 'Module should be loadable');

      const testData = { version: 1 };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      // First call with very short TTL
      const result1 = stateCache.getCachedState(testFile, {}, 50); // 50ms TTL
      assert.deepStrictEqual(result1, testData, 'First call should return file data');

      // Modify file
      const newData = { version: 2 };
      fs.writeFileSync(testFile, JSON.stringify(newData));

      // Wait for TTL to expire
      setTimeout(() => {
        const result2 = stateCache.getCachedState(testFile, {}, 50);
        assert.deepStrictEqual(
          result2,
          newData,
          'After TTL expiration, should return new file data'
        );
        done();
      }, 100); // Wait 100ms (longer than 50ms TTL)
    });

    it('should use custom TTL when provided', (t, done) => {
      assert.ok(stateCache, 'Module should be loadable');

      const testData = { custom: true };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      // First call with custom TTL
      const result1 = stateCache.getCachedState(testFile, {}, 200);
      assert.deepStrictEqual(result1, testData);

      // Modify file
      const newData = { custom: false };
      fs.writeFileSync(testFile, JSON.stringify(newData));

      // After 50ms, cache should still be valid (200ms TTL)
      setTimeout(() => {
        const result2 = stateCache.getCachedState(testFile, {}, 200);
        assert.deepStrictEqual(result2, testData, 'Cache should still be valid');

        // After 250ms, cache should be expired
        setTimeout(() => {
          const result3 = stateCache.getCachedState(testFile, {}, 200);
          assert.deepStrictEqual(result3, newData, 'Cache should be expired');
          done();
        }, 200);
      }, 50);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cache for specific file', () => {
      assert.ok(stateCache, 'Module should be loadable');

      const testData = { original: true };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      // Read to populate cache
      stateCache.getCachedState(testFile);

      // Modify file
      const newData = { modified: true };
      fs.writeFileSync(testFile, JSON.stringify(newData));

      // Invalidate cache
      stateCache.invalidateCache(testFile);

      // Next read should get fresh data
      const result = stateCache.getCachedState(testFile);
      assert.deepStrictEqual(result, newData, 'Should return fresh data after invalidation');
    });

    it('should not throw when invalidating non-cached path', () => {
      assert.ok(stateCache, 'Module should be loadable');

      // Should not throw
      assert.doesNotThrow(() => {
        stateCache.invalidateCache('/non/existent/path.json');
      });
    });
  });

  describe('clearAllCache', () => {
    it('should clear all cached entries', () => {
      assert.ok(stateCache, 'Module should be loadable');

      const file1 = path.join(testDir, 'file1.json');
      const file2 = path.join(testDir, 'file2.json');

      fs.writeFileSync(file1, JSON.stringify({ file: 1 }));
      fs.writeFileSync(file2, JSON.stringify({ file: 2 }));

      // Populate cache
      stateCache.getCachedState(file1);
      stateCache.getCachedState(file2);

      // Modify files
      fs.writeFileSync(file1, JSON.stringify({ file: 1, modified: true }));
      fs.writeFileSync(file2, JSON.stringify({ file: 2, modified: true }));

      // Clear all cache
      stateCache.clearAllCache();

      // Both should return fresh data
      const result1 = stateCache.getCachedState(file1);
      const result2 = stateCache.getCachedState(file2);

      assert.deepStrictEqual(result1, { file: 1, modified: true });
      assert.deepStrictEqual(result2, { file: 2, modified: true });
    });
  });

  describe('edge cases', () => {
    it('should handle empty JSON file', () => {
      assert.ok(stateCache, 'Module should be loadable');

      fs.writeFileSync(testFile, '{}');
      const result = stateCache.getCachedState(testFile, { default: true });
      assert.deepStrictEqual(result, {}, 'Should return empty object from file');
    });

    it('should handle JSON arrays', () => {
      assert.ok(stateCache, 'Module should be loadable');

      const testData = [1, 2, 3, { nested: true }];
      fs.writeFileSync(testFile, JSON.stringify(testData));

      const result = stateCache.getCachedState(testFile);
      assert.deepStrictEqual(result, testData, 'Should handle arrays');
    });

    it('should handle null in JSON', () => {
      assert.ok(stateCache, 'Module should be loadable');

      fs.writeFileSync(testFile, 'null');
      const result = stateCache.getCachedState(testFile, { default: true });
      // null is valid JSON, should return null
      assert.strictEqual(result, null, 'Should return null from file');
    });

    it('should handle permission errors gracefully', () => {
      assert.ok(stateCache, 'Module should be loadable');

      // Skip on Windows where permission handling differs
      if (process.platform === 'win32') {
        return;
      }

      fs.writeFileSync(testFile, JSON.stringify({ data: true }));
      fs.chmodSync(testFile, 0o000); // No permissions

      const defaultValue = { fallback: true };
      const result = stateCache.getCachedState(testFile, defaultValue);

      // Restore permissions for cleanup
      fs.chmodSync(testFile, 0o644);

      assert.deepStrictEqual(result, defaultValue, 'Should return default on permission error');
    });

    it('should handle concurrent reads to same file', () => {
      assert.ok(stateCache, 'Module should be loadable');

      const testData = { concurrent: true };
      fs.writeFileSync(testFile, JSON.stringify(testData));

      // Multiple concurrent reads
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(stateCache.getCachedState(testFile));
      }

      // All should return same data
      results.forEach((result, i) => {
        assert.deepStrictEqual(result, testData, `Read ${i} should return correct data`);
      });
    });
  });
});
