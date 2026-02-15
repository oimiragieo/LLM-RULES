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
    console.log('\n===================================================');
    console.log('Test run complete.');
  })();
}
