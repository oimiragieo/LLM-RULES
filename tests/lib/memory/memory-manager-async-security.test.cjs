#!/usr/bin/env node
/**
 * Memory Manager Tests - Critical Memory System Fixes
 * ===================================================
 *
 * Tests for:
 * 1. Auto-archival for learnings.md at 40KB threshold
 * 2. TTL/size-based pruning for codebase_map.json
 * 3. Memory health check functionality
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test setup - use a temporary directory
// We create a fake project root so getMemoryDir() resolves correctly
const TEST_PROJECT_ROOT = path.join(__dirname, '..', '.test-memory', '.test-project');
const MEMORY_DIR = path.join(TEST_PROJECT_ROOT, '.claude', 'context', 'memory');

// Cleanup and setup
function setupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'archive'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'sessions'), { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
}

// Simple test framework
async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

async function it(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    process.exitCode = 1;
  }
}

// Run tests
if (require.main === module) {
  (async () => {
    console.log('Memory Manager Tests - Critical Memory System Fixes');
    console.log('===================================================');

    // Test Suite 1: Auto-archival for learnings.md
    await describe('Async Functions - readMemoryAsync', async function () {
      await it('should read file content asynchronously', async function () {
        setupTestDir();
        try {
          const testFile = path.join(MEMORY_DIR, 'test-read.md');
          fs.writeFileSync(testFile, 'test content');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { readMemoryAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const content = await readMemoryAsync(testFile);
          assert.strictEqual(content, 'test content', 'Should read file content');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should return null for missing file (ENOENT)', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { readMemoryAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const content = await readMemoryAsync(path.join(MEMORY_DIR, 'nonexistent.md'));
          assert.strictEqual(content, null, 'Should return null for missing file');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should throw on non-ENOENT errors', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { readMemoryAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Try to read a directory as a file - should throw EISDIR
          await assert.rejects(
            readMemoryAsync(MEMORY_DIR),
            { code: 'EISDIR' },
            'Should throw EISDIR when reading directory'
          );
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Async Functions - atomicWriteAsync', async function () {
      await it('should write file atomically', async function () {
        setupTestDir();
        try {
          const testFile = path.join(MEMORY_DIR, 'test-write.md');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { atomicWriteAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          await atomicWriteAsync(testFile, 'atomic content');

          const content = fs.readFileSync(testFile, 'utf8');
          assert.strictEqual(content, 'atomic content', 'Should write content');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should not leave temp file on success', async function () {
        setupTestDir();
        try {
          const testFile = path.join(MEMORY_DIR, 'test-atomic.md');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { atomicWriteAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          await atomicWriteAsync(testFile, 'content');

          // Check no temp files left
          const files = fs.readdirSync(MEMORY_DIR);
          const tempFiles = files.filter(f => f.includes('.tmp'));
          assert.strictEqual(tempFiles.length, 0, 'Should not leave temp files');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should clean up temp file on write error', async function () {
        setupTestDir();
        try {
          // Use an invalid path payload to force write failure deterministically.
          const badPath = path.join(MEMORY_DIR, 'invalid\0file.md');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { atomicWriteAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          await assert.rejects(
            atomicWriteAsync(badPath, 'content'),
            /ERR_INVALID_ARG_VALUE|ERR_INVALID_ARG_TYPE|EINVAL/,
            'Should throw on bad path'
          );

          // Check no temp files left in memory dir
          const files = fs.readdirSync(MEMORY_DIR);
          const tempFiles = files.filter(f => f.includes('.tmp'));
          assert.strictEqual(tempFiles.length, 0, 'Should clean up temp files on error');
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Async Functions - recordGotchaAsync', async function () {
      await it('should record gotcha asynchronously', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordGotchaAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const result = await recordGotchaAsync('async test gotcha', TEST_PROJECT_ROOT);
          assert.strictEqual(result, true, 'Should return true for new gotcha');

          const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
          const gotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
          assert.strictEqual(gotchas.length, 1, 'Should have one gotcha');
          assert.strictEqual(gotchas[0].text, 'async test gotcha', 'Should have correct text');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should reject duplicate gotchas', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordGotchaAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          await recordGotchaAsync('duplicate gotcha', TEST_PROJECT_ROOT);
          const result = await recordGotchaAsync('duplicate gotcha', TEST_PROJECT_ROOT);

          assert.strictEqual(result, false, 'Should return false for duplicate');

          const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
          const gotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
          assert.strictEqual(gotchas.length, 1, 'Should still have only one gotcha');
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Async Functions - recordPatternAsync', async function () {
      await it('should record pattern asynchronously', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordPatternAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const result = await recordPatternAsync('async test pattern', TEST_PROJECT_ROOT);
          assert.strictEqual(result, true, 'Should return true for new pattern');

          const patternsFile = path.join(MEMORY_DIR, 'patterns.json');
          const patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
          assert.strictEqual(patterns.length, 1, 'Should have one pattern');
          assert.strictEqual(patterns[0].text, 'async test pattern', 'Should have correct text');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should reject duplicate patterns', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordPatternAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          await recordPatternAsync('duplicate pattern', TEST_PROJECT_ROOT);
          const result = await recordPatternAsync('duplicate pattern', TEST_PROJECT_ROOT);

          assert.strictEqual(result, false, 'Should return false for duplicate');

          const patternsFile = path.join(MEMORY_DIR, 'patterns.json');
          const patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
          assert.strictEqual(patterns.length, 1, 'Should still have only one pattern');
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Async Functions - loadMemoryForContextAsync', async function () {
      await it('should load memory asynchronously', async function () {
        setupTestDir();
        try {
          // Create test data
          fs.writeFileSync(
            path.join(MEMORY_DIR, 'gotchas.json'),
            JSON.stringify([{ text: 'gotcha 1', timestamp: new Date().toISOString() }])
          );
          fs.writeFileSync(
            path.join(MEMORY_DIR, 'patterns.json'),
            JSON.stringify([{ text: 'pattern 1', timestamp: new Date().toISOString() }])
          );

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContextAsync,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const memory = await loadMemoryForContextAsync(TEST_PROJECT_ROOT);

          assert.strictEqual(memory.gotchas.length, 1, 'Should have 1 gotcha');
          assert.strictEqual(memory.patterns.length, 1, 'Should have 1 pattern');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should handle missing files gracefully', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContextAsync,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Memory dir exists but no files
          const memory = await loadMemoryForContextAsync(TEST_PROJECT_ROOT);

          assert.strictEqual(memory.gotchas.length, 0, 'Should have empty gotchas');
          assert.strictEqual(memory.patterns.length, 0, 'Should have empty patterns');
          assert.strictEqual(memory.discoveries.length, 0, 'Should have empty discoveries');
          assert.strictEqual(memory.recent_sessions.length, 0, 'Should have empty sessions');
        } finally {
          cleanupTestDir();
        }
      });
    });

    // Test Suite 6: CRITICAL-001-MEMORY - Path Traversal Prevention
    await describe('CRITICAL-001-MEMORY - Path Traversal Prevention', async function () {
      await it('should reject path outside PROJECT_ROOT in recordGotcha', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordGotcha } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Path clearly outside PROJECT_ROOT (temp directory)
          const outsidePath = process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp';

          try {
            recordGotcha('test gotcha', outsidePath);
            assert.fail('Should have thrown error for path outside PROJECT_ROOT');
          } catch (err) {
            assert(
              err.message.includes('Invalid projectRoot'),
              `Expected path validation error, got: ${err.message}`
            );
          }
        } finally {
          cleanupTestDir();
        }
      });

      await it('should reject path outside PROJECT_ROOT in recordPattern', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordPattern } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Path clearly outside PROJECT_ROOT
          const outsidePath = process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp';

          try {
            recordPattern('test pattern', outsidePath);
            assert.fail('Should have thrown error for path outside PROJECT_ROOT');
          } catch (err) {
            assert(
              err.message.includes('Invalid projectRoot'),
              `Expected path validation error, got: ${err.message}`
            );
          }
        } finally {
          cleanupTestDir();
        }
      });

      await it('should reject path containing traversal sequences', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordGotcha } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Path containing .. traversal sequence (raw, not resolved by path.join)
          const traversalPath = TEST_PROJECT_ROOT + '/../../../etc';

          try {
            recordGotcha('test gotcha', traversalPath);
            assert.fail('Should have thrown error for traversal sequence');
          } catch (err) {
            assert(
              err.message.includes('Invalid projectRoot'),
              `Expected path validation error, got: ${err.message}`
            );
          }
        } finally {
          cleanupTestDir();
        }
      });

      await it('should accept valid projectRoot within PROJECT_ROOT', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordGotcha } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Valid path within test project root
          const result = recordGotcha('valid gotcha', TEST_PROJECT_ROOT);
          assert.strictEqual(result, true, 'Should succeed for valid projectRoot');

          // Verify the gotcha was recorded
          const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
          const gotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
          assert.strictEqual(gotchas.length, 1, 'Should have one gotcha');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should reject path outside PROJECT_ROOT in async functions', async function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            recordGotchaAsync,
            recordPatternAsync,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Path clearly outside PROJECT_ROOT
          const outsidePath = process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp';

          await assert.rejects(
            recordGotchaAsync('test gotcha', outsidePath),
            /Invalid projectRoot/,
            'recordGotchaAsync should reject path outside PROJECT_ROOT'
          );

          await assert.rejects(
            recordPatternAsync('test pattern', outsidePath),
            /Invalid projectRoot/,
            'recordPatternAsync should reject path outside PROJECT_ROOT'
          );
        } finally {
          cleanupTestDir();
        }
      });
    });

    // Test Suite 7: Access Tracking (lastAccessed/accessCount)
    await describe('Access Tracking - Gotchas and Patterns', async function () {
      // Note: ADR-079 made access stats writes non-blocking via setImmediate().
      // These tests must be async to wait for the write to complete.
      await it('should initialize and update access tracking fields on loadMemoryForContext', async function () {
        setupTestDir();
        const prevInterval = process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS;
        const prevEnabled = process.env.MEMORY_ACCESS_TRACKING;
        process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS = '0';
        process.env.MEMORY_ACCESS_TRACKING = 'on';

        try {
          const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
          const patternsFile = path.join(MEMORY_DIR, 'patterns.json');

          fs.writeFileSync(
            gotchasFile,
            JSON.stringify([{ text: 'gotcha 1', timestamp: '2026-02-01T00:00:00.000Z' }], null, 2)
          );
          fs.writeFileSync(
            patternsFile,
            JSON.stringify([{ text: 'pattern 1', timestamp: '2026-02-01T00:00:00.000Z' }], null, 2)
          );

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContext,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const memory = loadMemoryForContext(TEST_PROJECT_ROOT);
          assert.strictEqual(memory.gotchas.length, 1, 'Should load gotchas');
          assert.strictEqual(memory.patterns.length, 1, 'Should load patterns');

          // ADR-079: Access stats writes are non-blocking via setImmediate()
          // Wait for the async write to complete before checking the file
          await new Promise(resolve => setTimeout(resolve, 50));

          const accessStatsPath = path.join(MEMORY_DIR, 'access-stats.json');
          const accessStats = JSON.parse(fs.readFileSync(accessStatsPath, 'utf8'));
          const keys = Object.keys(accessStats.entries || {});
          assert.ok(keys.length >= 2, 'Expected access stats entries for gotchas and patterns');

          assert.strictEqual(
            memory.gotchas[0].accessCount,
            1,
            'Gotcha accessCount should increment'
          );
          assert.strictEqual(
            typeof memory.gotchas[0].lastAccessed,
            'string',
            'Gotcha lastAccessed set'
          );

          assert.strictEqual(
            memory.patterns[0].accessCount,
            1,
            'Pattern accessCount should increment'
          );
          assert.strictEqual(
            typeof memory.patterns[0].lastAccessed,
            'string',
            'Pattern lastAccessed set'
          );
        } finally {
          if (typeof prevInterval === 'undefined') {
            delete process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS;
          } else {
            process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS = prevInterval;
          }
          if (typeof prevEnabled === 'undefined') {
            delete process.env.MEMORY_ACCESS_TRACKING;
          } else {
            process.env.MEMORY_ACCESS_TRACKING = prevEnabled;
          }
          cleanupTestDir();
        }
      });

      await it('should update access tracking fields on loadMemoryForContextAsync', async function () {
        setupTestDir();
        const prevInterval = process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS;
        const prevEnabled = process.env.MEMORY_ACCESS_TRACKING;
        process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS = '0';
        process.env.MEMORY_ACCESS_TRACKING = 'on';

        try {
          const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
          fs.writeFileSync(
            gotchasFile,
            JSON.stringify(
              [{ text: 'gotcha async', timestamp: '2026-02-01T00:00:00.000Z' }],
              null,
              2
            )
          );

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContextAsync,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const memory = await loadMemoryForContextAsync(TEST_PROJECT_ROOT);
          assert.strictEqual(memory.gotchas.length, 1, 'Should load gotchas async');

          // ADR-079: Access stats writes are non-blocking via setImmediate()
          // Wait for the async write to complete before checking the file
          await new Promise(resolve => setTimeout(resolve, 50));

          const accessStatsPath = path.join(MEMORY_DIR, 'access-stats.json');
          const accessStats = JSON.parse(fs.readFileSync(accessStatsPath, 'utf8'));
          const keys = Object.keys(accessStats.entries || {});
          assert.ok(keys.length >= 1, 'Expected access stats entry for gotcha');

          assert.strictEqual(
            memory.gotchas[0].accessCount,
            1,
            'Async gotcha accessCount should increment'
          );
          assert.strictEqual(
            typeof memory.gotchas[0].lastAccessed,
            'string',
            'Async gotcha lastAccessed set'
          );
        } finally {
          if (typeof prevInterval === 'undefined') {
            delete process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS;
          } else {
            process.env.MEMORY_ACCESS_TRACKING_MIN_INTERVAL_MS = prevInterval;
          }
          if (typeof prevEnabled === 'undefined') {
            delete process.env.MEMORY_ACCESS_TRACKING;
          } else {
            process.env.MEMORY_ACCESS_TRACKING = prevEnabled;
          }
          cleanupTestDir();
        }
      });
    });

    console.log('\n===================================================');
    console.log('Test run complete.');
  })();
}
