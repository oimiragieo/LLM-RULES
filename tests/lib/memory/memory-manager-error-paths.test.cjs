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
    await describe('Split-Brain Fix - MTM sessions loaded into recent_sessions', async function () {
      await it('should load recent_sessions from MTM (memory-tiers) when present', function () {
        setupTestDir();
        try {
          const mtmDir = path.join(MEMORY_DIR, 'mtm');
          fs.mkdirSync(mtmDir, { recursive: true });

          fs.writeFileSync(
            path.join(mtmDir, 'session_2026-02-01T10-00-00.json'),
            JSON.stringify(
              {
                tier: 'MTM',
                session_id: 'mtm-1',
                timestamp: '2026-02-01T10:00:00.000Z',
                summary: 'MTM summary 1',
                tasks_completed: ['A', 'B'],
              },
              null,
              2
            )
          );
          fs.writeFileSync(
            path.join(mtmDir, 'session_2026-02-01T11-00-00.json'),
            JSON.stringify(
              {
                tier: 'MTM',
                session_id: 'mtm-2',
                timestamp: '2026-02-01T11:00:00.000Z',
                summary: 'MTM summary 2',
                tasks_completed: ['C'],
              },
              null,
              2
            )
          );

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContext,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const memory = loadMemoryForContext(TEST_PROJECT_ROOT);
          assert.ok(memory.recent_sessions.length >= 2, 'Expected MTM sessions to be loaded');
          assert.ok(
            memory.recent_sessions.some(s => s.source === 'mtm' && s.summary === 'MTM summary 1'),
            'Expected MTM summary 1 present'
          );
          assert.ok(
            memory.recent_sessions.some(s => s.source === 'mtm' && s.summary === 'MTM summary 2'),
            'Expected MTM summary 2 present'
          );
        } finally {
          cleanupTestDir();
        }
      });

      // Obsolete test: Legacy fallback is removed in favor of strict MTM/LTM
      // await it('should fall back to legacy sessions/ when MTM is empty', function () { ... });
    });

    // Test Suite 8: Error Path Coverage (IMP-006)
    await describe('Error Path Coverage - Corrupted JSON', async function () {
      await it('should handle corrupted gotchas.json gracefully', function () {
        setupTestDir();
        try {
          // Write corrupted JSON
          const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
          fs.writeFileSync(gotchasFile, '{ invalid json content');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContext,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should return empty gotchas
          const memory = loadMemoryForContext(TEST_PROJECT_ROOT);
          assert.strictEqual(
            memory.gotchas.length,
            0,
            'Should return empty gotchas for corrupted file'
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should handle corrupted patterns.json gracefully', function () {
        setupTestDir();
        try {
          // Write corrupted JSON
          const patternsFile = path.join(MEMORY_DIR, 'patterns.json');
          fs.writeFileSync(patternsFile, 'not valid json [');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContext,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should return empty patterns
          const memory = loadMemoryForContext(TEST_PROJECT_ROOT);
          assert.strictEqual(
            memory.patterns.length,
            0,
            'Should return empty patterns for corrupted file'
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should handle corrupted codebase_map.json gracefully', function () {
        setupTestDir();
        try {
          // Write corrupted JSON
          const mapFile = path.join(MEMORY_DIR, 'codebase_map.json');
          fs.writeFileSync(mapFile, '{ "discovered_files": ');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContext,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should return empty discoveries
          const memory = loadMemoryForContext(TEST_PROJECT_ROOT);
          assert.strictEqual(
            memory.discoveries.length,
            0,
            'Should return empty discoveries for corrupted file'
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should handle corrupted session files gracefully', function () {
        setupTestDir();
        try {
          // Write corrupted session file
          const sessionFile = path.join(MEMORY_DIR, 'sessions', 'session_001.json');
          fs.writeFileSync(sessionFile, '{ broken json');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContext,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should return empty sessions
          const memory = loadMemoryForContext(TEST_PROJECT_ROOT);
          assert.strictEqual(
            memory.recent_sessions.length,
            0,
            'Should return empty sessions for corrupted file'
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should reset corrupted gotchas.json when recording new gotcha', function () {
        setupTestDir();
        try {
          // Write corrupted JSON
          const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
          fs.writeFileSync(gotchasFile, '{ invalid json');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordGotcha } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should create new valid file
          const result = recordGotcha('new gotcha after corruption', TEST_PROJECT_ROOT);
          assert.strictEqual(result, true, 'Should successfully record gotcha');

          // Verify file is now valid
          const gotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
          assert.strictEqual(gotchas.length, 1, 'Should have one gotcha');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should reset corrupted patterns.json when recording new pattern', function () {
        setupTestDir();
        try {
          // Write corrupted JSON
          const patternsFile = path.join(MEMORY_DIR, 'patterns.json');
          fs.writeFileSync(patternsFile, 'corrupted [[[');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordPattern } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should create new valid file
          const result = recordPattern('new pattern after corruption', TEST_PROJECT_ROOT);
          assert.strictEqual(result, true, 'Should successfully record pattern');

          // Verify file is now valid
          const patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
          assert.strictEqual(patterns.length, 1, 'Should have one pattern');
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Error Path Coverage - Missing Directories', async function () {
      await it('should handle missing memory directory gracefully in loadMemoryForContext', function () {
        // Use a non-existent project root path
        const nonExistentRoot = path.join(
          __dirname,
          '..',
          'context',
          'memory',
          '.nonexistent-project'
        );

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
        const { loadMemoryForContext } = require('../../../.claude/lib/memory/memory-manager.cjs');

        // This should not throw - but may fail validation
        // Testing that it handles gracefully
        try {
          // loadMemoryForContext validates projectRoot, so this may throw
          // The test verifies it doesn't crash unexpectedly
          loadMemoryForContext(nonExistentRoot);
        } catch (err) {
          // Expected: path validation error
          assert(
            err.message.includes('Invalid projectRoot'),
            `Expected path validation error, got: ${err.message}`
          );
        }
      });

      await it('should create directories when recording gotcha to new path', function () {
        setupTestDir();
        try {
          // Remove the memory directory
          fs.rmSync(MEMORY_DIR, { recursive: true });

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordGotcha } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should create directories and record
          const result = recordGotcha('gotcha creating dirs', TEST_PROJECT_ROOT);
          assert.strictEqual(result, true, 'Should successfully record gotcha');

          // Verify directory was created
          assert(fs.existsSync(MEMORY_DIR), 'Memory directory should be created');
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Error Path Coverage - Async Functions', async function () {
      await it('should handle corrupted JSON in recordGotchaAsync', async function () {
        setupTestDir();
        try {
          // Write corrupted JSON
          const gotchasFile = path.join(MEMORY_DIR, 'gotchas.json');
          fs.writeFileSync(gotchasFile, '{ broken json {{');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordGotchaAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should recover and create new valid file
          const result = await recordGotchaAsync(
            'async gotcha after corruption',
            TEST_PROJECT_ROOT
          );
          assert.strictEqual(result, true, 'Should successfully record gotcha');

          // Verify file is now valid
          const gotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
          assert.strictEqual(gotchas.length, 1, 'Should have one gotcha');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should handle corrupted JSON in recordPatternAsync', async function () {
        setupTestDir();
        try {
          // Write corrupted JSON
          const patternsFile = path.join(MEMORY_DIR, 'patterns.json');
          fs.writeFileSync(patternsFile, 'invalid {{json');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordPatternAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should recover and create new valid file
          const result = await recordPatternAsync(
            'async pattern after corruption',
            TEST_PROJECT_ROOT
          );
          assert.strictEqual(result, true, 'Should successfully record pattern');

          // Verify file is now valid
          const patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
          assert.strictEqual(patterns.length, 1, 'Should have one pattern');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should handle corrupted JSON in loadMemoryForContextAsync', async function () {
        setupTestDir();
        try {
          // Write corrupted JSON to multiple files
          fs.writeFileSync(path.join(MEMORY_DIR, 'gotchas.json'), '{ bad');
          fs.writeFileSync(path.join(MEMORY_DIR, 'patterns.json'), '[ broken');
          fs.writeFileSync(path.join(MEMORY_DIR, 'codebase_map.json'), 'not json');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            loadMemoryForContextAsync,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should return empty arrays
          const memory = await loadMemoryForContextAsync(TEST_PROJECT_ROOT);
          assert.strictEqual(memory.gotchas.length, 0, 'Should return empty gotchas');
          assert.strictEqual(memory.patterns.length, 0, 'Should return empty patterns');
          assert.strictEqual(memory.discoveries.length, 0, 'Should return empty discoveries');
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Error Path Coverage - pruneCodebaseMap', async function () {
      await it('should handle corrupted codebase_map.json in pruneCodebaseMap', function () {
        setupTestDir();
        try {
          // Write corrupted JSON
          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');
          fs.writeFileSync(mapPath, '{ corrupted json content');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { pruneCodebaseMap } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should return zero counts
          const result = pruneCodebaseMap(TEST_PROJECT_ROOT);
          assert.strictEqual(result.prunedByTTL, 0, 'Should return 0 for corrupted file');
          assert.strictEqual(result.prunedBySize, 0, 'Should return 0 for corrupted file');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should handle missing discovered_files in codebase_map.json', function () {
        setupTestDir();
        try {
          // Write valid JSON but missing discovered_files
          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');
          fs.writeFileSync(mapPath, JSON.stringify({ last_updated: new Date().toISOString() }));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { pruneCodebaseMap } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // Should not throw, should return zero counts
          const result = pruneCodebaseMap(TEST_PROJECT_ROOT);
          assert.strictEqual(result.totalPruned, 0, 'Should return 0 for missing discovered_files');
        } finally {
          cleanupTestDir();
        }
      });
    });

    console.log('\n===================================================');
    console.log('Test run complete.');
  })();
}
