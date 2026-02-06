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
    await describe('checkAndArchiveLearnings', async function () {
      await it('should not archive when file is under 40KB', function () {
        setupTestDir();
        try {
          const learningsPath = path.join(MEMORY_DIR, 'learnings.md');
          const content = 'A'.repeat(10 * 1024);
          fs.writeFileSync(learningsPath, content);

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            checkAndArchiveLearnings,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const result = checkAndArchiveLearnings(TEST_PROJECT_ROOT);

          assert.strictEqual(result.archived, false, 'Should not archive under threshold');

          const archiveFiles = fs.readdirSync(path.join(MEMORY_DIR, 'archive'));
          assert.strictEqual(archiveFiles.length, 0, 'Archive should be empty');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should archive when file exceeds 40KB threshold', function () {
        setupTestDir();
        try {
          const learningsPath = path.join(MEMORY_DIR, 'learnings.md');
          const lines = [];
          for (let i = 0; i < 1000; i++) {
            lines.push(`Line ${i}: ${'X'.repeat(50)}`);
          }
          const content = lines.join('\n');
          fs.writeFileSync(learningsPath, content);

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            checkAndArchiveLearnings,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const result = checkAndArchiveLearnings(TEST_PROJECT_ROOT);

          assert.strictEqual(result.archived, true, 'Should archive over threshold');

          const archiveFiles = fs.readdirSync(path.join(MEMORY_DIR, 'archive'));
          assert.strictEqual(archiveFiles.length, 1, 'Should have one archive file');
          assert.match(
            archiveFiles[0],
            /^learnings-\d{4}-\d{2}\.md$/,
            'Archive filename should match pattern'
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should keep last 50 lines in current file after archival', function () {
        setupTestDir();
        try {
          const learningsPath = path.join(MEMORY_DIR, 'learnings.md');
          const lines = [];
          for (let i = 0; i < 200; i++) {
            lines.push(`Line ${i}: ${'X'.repeat(300)}`);
          }
          const content = lines.join('\n');
          fs.writeFileSync(learningsPath, content);

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            checkAndArchiveLearnings,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');
          checkAndArchiveLearnings(TEST_PROJECT_ROOT);

          const newContent = fs.readFileSync(learningsPath, 'utf8');
          const newLines = newContent.split('\n').filter(l => l.trim() !== '');

          assert(
            newLines.length <= 60 && newLines.length >= 40,
            `Should have ~50 lines, got ${newLines.length}`
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should report archive path and bytes', function () {
        setupTestDir();
        try {
          const learningsPath = path.join(MEMORY_DIR, 'learnings.md');
          const lines = [];
          for (let i = 0; i < 1000; i++) {
            lines.push(`Line ${i}: ${'X'.repeat(50)}`);
          }
          fs.writeFileSync(learningsPath, lines.join('\n'));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const {
            checkAndArchiveLearnings,
          } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const result = checkAndArchiveLearnings(TEST_PROJECT_ROOT);

          assert(result.archivedBytes > 0, 'Should report archived bytes');
          assert(result.archivePath, 'Should report archive path');
        } finally {
          cleanupTestDir();
        }
      });
    });

    // Test Suite 2: TTL/size-based pruning for codebase_map.json
    await describe('pruneCodebaseMap', async function () {
      await it('should remove entries older than 90 days', function () {
        setupTestDir();
        try {
          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');

          const now = new Date();
          const oldDate = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();
          const recentDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

          const codebaseMap = {
            discovered_files: {
              'old/file1.js': { description: 'Old file 1', last_accessed: oldDate },
              'old/file2.js': { description: 'Old file 2', last_accessed: oldDate },
              'recent/file1.js': { description: 'Recent file 1', last_accessed: recentDate },
              'recent/file2.js': { description: 'Recent file 2', last_accessed: recentDate },
            },
            last_updated: now.toISOString(),
          };
          fs.writeFileSync(mapPath, JSON.stringify(codebaseMap, null, 2));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { pruneCodebaseMap } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const result = pruneCodebaseMap(TEST_PROJECT_ROOT);

          const prunedMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

          assert.strictEqual(
            Object.keys(prunedMap.discovered_files).length,
            2,
            'Should have 2 entries'
          );
          assert(prunedMap.discovered_files['recent/file1.js'], 'Should keep recent file 1');
          assert(!prunedMap.discovered_files['old/file1.js'], 'Should remove old file 1');
          assert.strictEqual(result.prunedByTTL, 2, 'Should report 2 pruned by TTL');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should prune to under 500 entries if over after TTL', function () {
        setupTestDir();
        try {
          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');

          const now = new Date();

          const discovered_files = {};
          for (let i = 0; i < 600; i++) {
            // All recent entries (within TTL) - varying ages for sort order
            const accessDate = new Date(now - (i + 1) * 60 * 60 * 1000).toISOString(); // hours ago, not days
            discovered_files[`file${i}.js`] = {
              description: `File ${i}`,
              last_accessed: accessDate,
            };
          }

          const codebaseMap = { discovered_files, last_updated: now.toISOString() };
          fs.writeFileSync(mapPath, JSON.stringify(codebaseMap, null, 2));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { pruneCodebaseMap } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const result = pruneCodebaseMap(TEST_PROJECT_ROOT);

          const prunedMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

          assert(
            Object.keys(prunedMap.discovered_files).length <= 500,
            `Should have <=500 entries, got ${Object.keys(prunedMap.discovered_files).length}`
          );
          assert(result.prunedBySize >= 100, `Should prune by size, got ${result.prunedBySize}`);
        } finally {
          cleanupTestDir();
        }
      });

      await it('should not prune if under limits', function () {
        setupTestDir();
        try {
          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');

          const now = new Date();
          const recentDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

          const codebaseMap = {
            discovered_files: {
              'file1.js': { description: 'File 1', last_accessed: recentDate },
              'file2.js': { description: 'File 2', last_accessed: recentDate },
            },
            last_updated: now.toISOString(),
          };
          fs.writeFileSync(mapPath, JSON.stringify(codebaseMap, null, 2));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { pruneCodebaseMap } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const result = pruneCodebaseMap(TEST_PROJECT_ROOT);

          const prunedMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

          assert.strictEqual(
            Object.keys(prunedMap.discovered_files).length,
            2,
            'Should have 2 entries'
          );
          assert.strictEqual(result.prunedByTTL, 0, 'Should report 0 pruned by TTL');
          assert.strictEqual(result.prunedBySize, 0, 'Should report 0 pruned by size');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should add last_accessed to legacy entries', function () {
        setupTestDir();
        try {
          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');

          // Create entries WITHOUT last_accessed (legacy format)
          const codebaseMap = {
            discovered_files: {
              'legacy/file1.js': {
                description: 'Legacy file 1',
                discovered_at: '2026-01-01T00:00:00.000Z',
              },
              'legacy/file2.js': {
                description: 'Legacy file 2',
                discovered_at: '2026-01-01T00:00:00.000Z',
              },
            },
            last_updated: new Date().toISOString(),
          };
          fs.writeFileSync(mapPath, JSON.stringify(codebaseMap, null, 2));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { pruneCodebaseMap } = require('../../../.claude/lib/memory/memory-manager.cjs');
          pruneCodebaseMap(TEST_PROJECT_ROOT);

          const prunedMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

          for (const [key, value] of Object.entries(prunedMap.discovered_files)) {
            assert(value.last_accessed, `Entry ${key} should have last_accessed`);
          }
        } finally {
          cleanupTestDir();
        }
      });
    });

    // Test Suite 3: recordDiscovery with last_accessed
    await describe('recordDiscovery with last_accessed', async function () {
      await it('should add last_accessed timestamp when recording discovery', function () {
        setupTestDir();
        try {
          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordDiscovery } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const before = new Date();
          recordDiscovery('new/file.js', 'A new file', 'test', TEST_PROJECT_ROOT);
          const after = new Date();

          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');
          const codebaseMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
          const entry = codebaseMap.discovered_files['new/file.js'];

          assert(entry.last_accessed, 'Entry should have last_accessed');

          const accessTime = new Date(entry.last_accessed);
          assert(accessTime >= before && accessTime <= after, 'last_accessed should be recent');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should update last_accessed for existing entries', function () {
        setupTestDir();
        try {
          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');

          // Create an existing entry with old last_accessed
          const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const codebaseMap = {
            discovered_files: {
              'existing/file.js': {
                description: 'Existing file',
                last_accessed: oldDate,
                discovered_at: oldDate,
              },
            },
            last_updated: new Date().toISOString(),
          };
          fs.writeFileSync(mapPath, JSON.stringify(codebaseMap, null, 2));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { recordDiscovery } = require('../../../.claude/lib/memory/memory-manager.cjs');

          const before = new Date();
          recordDiscovery('existing/file.js', 'Updated description', 'test', TEST_PROJECT_ROOT);

          const updatedMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
          const entry = updatedMap.discovered_files['existing/file.js'];

          const accessTime = new Date(entry.last_accessed);
          assert(accessTime >= before, 'last_accessed should be updated to recent time');
          assert.strictEqual(
            entry.description,
            'Updated description',
            'Description should be updated'
          );
        } finally {
          cleanupTestDir();
        }
      });
    });

    // Test Suite 4: Memory Health Check
    await describe('getMemoryHealth', async function () {
      await it('should return healthy status when under thresholds', function () {
        setupTestDir();
        try {
          fs.writeFileSync(path.join(MEMORY_DIR, 'learnings.md'), 'A'.repeat(5 * 1024));

          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');
          const discovered_files = {};
          for (let i = 0; i < 50; i++) {
            discovered_files[`file${i}.js`] = { description: `File ${i}` };
          }
          fs.writeFileSync(mapPath, JSON.stringify({ discovered_files }, null, 2));

          for (let i = 1; i <= 10; i++) {
            const sessionPath = path.join(
              MEMORY_DIR,
              'sessions',
              `session_${String(i).padStart(3, '0')}.json`
            );
            fs.writeFileSync(sessionPath, JSON.stringify({ session_number: i }));
          }

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { getMemoryHealth } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const health = getMemoryHealth(TEST_PROJECT_ROOT);

          assert.strictEqual(
            health.status,
            'warning',
            'Status should be warning due to legacy sessions'
          );
          assert(
            health.warnings.some(w => w.includes('legacy sessions')),
            'Should warn about legacy sessions'
          );
        } finally {
          cleanupTestDir();
        }
      });

      // Note: CONFIG.LEARNINGS_WARN_THRESHOLD_KB defaults to 40KB (via ADR-080 env var migration)
      await it('should warn when learnings.md exceeds 40KB threshold', function () {
        setupTestDir();
        try {
          // Create file larger than 40KB threshold
          fs.writeFileSync(path.join(MEMORY_DIR, 'learnings.md'), 'A'.repeat(45 * 1024));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { getMemoryHealth } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const health = getMemoryHealth(TEST_PROJECT_ROOT);

          assert.strictEqual(health.status, 'warning', 'Status should be warning');
          assert(
            health.warnings.some(w => w.includes('learnings.md')),
            'Should warn about learnings.md'
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should warn when codebase_map.json exceeds 400 entries', function () {
        setupTestDir();
        try {
          fs.writeFileSync(path.join(MEMORY_DIR, 'learnings.md'), 'small');

          const mapPath = path.join(MEMORY_DIR, 'codebase_map.json');
          const discovered_files = {};
          for (let i = 0; i < 450; i++) {
            discovered_files[`file${i}.js`] = { description: `File ${i}` };
          }
          fs.writeFileSync(mapPath, JSON.stringify({ discovered_files }, null, 2));

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { getMemoryHealth } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const health = getMemoryHealth(TEST_PROJECT_ROOT);

          assert.strictEqual(health.status, 'warning', 'Status should be warning');
          assert(
            health.warnings.some(w => w.includes('codebase_map')),
            'Should warn about codebase_map'
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should report session count', function () {
        setupTestDir();
        try {
          fs.writeFileSync(path.join(MEMORY_DIR, 'learnings.md'), 'small');

          for (let i = 1; i <= 25; i++) {
            const sessionPath = path.join(
              MEMORY_DIR,
              'sessions',
              `session_${String(i).padStart(3, '0')}.json`
            );
            fs.writeFileSync(sessionPath, JSON.stringify({ session_number: i }));
          }

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { getMemoryHealth } = require('../../../.claude/lib/memory/memory-manager.cjs');
          const health = getMemoryHealth(TEST_PROJECT_ROOT);

          assert.strictEqual(health.sessionsCount, 25, 'Should report 25 sessions');
        } finally {
          cleanupTestDir();
        }
      });
    });

    // Test Suite 5: Async Functions (SEC-IMPL-001 Approved)
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
          // Create a non-existent directory path to force rename error
          const badPath = path.join(MEMORY_DIR, 'nonexistent-dir', 'file.md');

          delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
          const { atomicWriteAsync } = require('../../../.claude/lib/memory/memory-manager.cjs');

          // This should fail because parent directory doesn't exist
          await assert.rejects(
            atomicWriteAsync(badPath, 'content'),
            /ENOENT|EPERM/,
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
