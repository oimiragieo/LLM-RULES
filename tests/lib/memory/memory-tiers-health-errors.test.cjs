#!/usr/bin/env node
/**
 * Memory Tiers Tests - STM/MTM/LTM Implementation
 * ================================================
 *
 * Tests for Phase 2 of Memory System:
 * 1. Memory tier definitions (STM, MTM, LTM)
 * 2. Session consolidation (STM -> MTM)
 * 3. LTM promotion (MTM -> LTM)
 * 4. Session summarization for LTM
 * 5. Integration with existing memory-manager.cjs
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test setup - use a temporary directory
const TEST_PROJECT_ROOT = path.join(__dirname, '..', '.test-memory', '.test-tiers');
const MEMORY_DIR = path.join(TEST_PROJECT_ROOT, '.claude', 'context', 'memory');

// Setup directories
function setupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'archive'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'stm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'ltm'), { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
}

// Simple test framework
let passCount = 0;
let failCount = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

// Helper to clear require cache for fresh imports
function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

// Run tests
if (require.main === module) {
  console.log('Memory Tiers Tests - STM/MTM/LTM Implementation');
  console.log('================================================');

  describe('LTM Summary Format', function () {
    it('should generate markdown-compatible summary', function () {
      setupTestDir();
      try {
        const { generateSessionSummary } = freshRequire(
          '../../../.claude/lib/memory/memory-tiers.cjs'
        );

        const sessions = [
          {
            session_id: 'sess-001',
            timestamp: '2026-01-20T10:00:00.000Z',
            summary: 'Implemented user authentication',
            tasks_completed: ['Add JWT middleware', 'Create login endpoint'],
            patterns_found: ['Token refresh pattern'],
            decisions_made: ['Use bcrypt for hashing'],
            files_modified: ['src/auth.js', 'src/middleware.js'],
          },
          {
            session_id: 'sess-002',
            timestamp: '2026-01-22T14:00:00.000Z',
            summary: 'Fixed database connection issues',
            tasks_completed: ['Fix connection pooling'],
            patterns_found: [],
            decisions_made: ['Increase pool size to 20'],
            files_modified: ['src/db.js', 'src/config.js', 'src/auth.js'],
          },
        ];

        const summary = generateSessionSummary(sessions);

        assert(summary.type === 'session_summary', 'Should have type');
        assert(summary.date_range.start === '2026-01-20', 'Should have correct start date');
        assert(summary.date_range.end === '2026-01-22', 'Should have correct end date');
        assert(summary.session_count === 2, 'Should have correct session count');
        assert(summary.key_learnings.length > 0, 'Should have key learnings');
        assert(summary.major_decisions.length === 2, 'Should have 2 decisions');
        assert(
          summary.files_frequently_touched.includes('src/auth.js'),
          'Should track frequently touched files'
        );
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 6: Tier Health Check Integration
  describe('getTierHealth', function () {
    it('should report health of all tiers', function () {
      setupTestDir();
      try {
        const { getTierHealth } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Create some data in each tier
        fs.writeFileSync(
          path.join(MEMORY_DIR, 'stm', 'session_current.json'),
          JSON.stringify({ session_id: 'current' }, null, 2)
        );

        for (let i = 1; i <= 5; i++) {
          fs.writeFileSync(
            path.join(MEMORY_DIR, 'mtm', `session_${i}.json`),
            JSON.stringify({ session_id: `mtm-${i}` }, null, 2)
          );
        }

        for (let i = 1; i <= 3; i++) {
          fs.writeFileSync(
            path.join(MEMORY_DIR, 'ltm', `summary_${i}.json`),
            JSON.stringify({ type: 'session_summary' }, null, 2)
          );
        }

        const health = getTierHealth(TEST_PROJECT_ROOT);

        assert(health.stm, 'Should have STM health');
        assert(health.mtm, 'Should have MTM health');
        assert(health.ltm, 'Should have LTM health');
        assert.strictEqual(health.stm.sessionCount, 1, 'STM should have 1 session');
        assert.strictEqual(health.mtm.sessionCount, 5, 'MTM should have 5 sessions');
        assert.strictEqual(health.ltm.summaryCount, 3, 'LTM should have 3 summaries');
      } finally {
        cleanupTestDir();
      }
    });

    it('should warn when MTM is approaching limit', function () {
      setupTestDir();
      try {
        const { getTierHealth } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Create 9 sessions in MTM (approaching 10 limit)
        for (let i = 1; i <= 9; i++) {
          fs.writeFileSync(
            path.join(MEMORY_DIR, 'mtm', `session_${i}.json`),
            JSON.stringify({ session_id: `mtm-${i}` }, null, 2)
          );
        }

        const health = getTierHealth(TEST_PROJECT_ROOT);

        assert(health.mtm.warnings.length > 0, 'Should have warnings when approaching limit');
        assert(
          health.mtm.warnings.some(w => w.includes('approaching')),
          'Warning should mention approaching limit'
        );
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 7: Write STM Entry
  describe('writeSTMEntry', function () {
    it('should write current session data to STM', function () {
      setupTestDir();
      try {
        const { writeSTMEntry, readSTMEntry } = freshRequire(
          '../../../.claude/lib/memory/memory-tiers.cjs'
        );

        const sessionData = {
          session_id: 'current-session',
          timestamp: new Date().toISOString(),
          summary: 'Current work in progress',
          tasks_in_progress: ['implementing memory tiers'],
        };

        writeSTMEntry(sessionData, TEST_PROJECT_ROOT);

        const read = readSTMEntry(TEST_PROJECT_ROOT);
        assert(read, 'Should be able to read STM entry');
        assert.strictEqual(read.session_id, 'current-session', 'Should have correct session_id');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 8: Error Path Coverage (IMP-006)
  describe('Error Path Coverage - Corrupted JSON', function () {
    it('should handle corrupted STM session file in readSTMEntry', function () {
      setupTestDir();
      try {
        const { readSTMEntry } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Write corrupted JSON
        const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
        fs.writeFileSync(stmPath, '{ corrupted json');

        // Should return null for corrupted file
        const result = readSTMEntry(TEST_PROJECT_ROOT);
        assert.strictEqual(result, null, 'Should return null for corrupted STM file');
      } finally {
        cleanupTestDir();
      }
    });

    it('should handle corrupted MTM session files in getMTMSessions', function () {
      setupTestDir();
      try {
        const { getMTMSessions } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Write one valid and one corrupted session
        const mtmDir = path.join(MEMORY_DIR, 'mtm');
        fs.writeFileSync(
          path.join(mtmDir, 'session_001.json'),
          JSON.stringify({ session_id: 'valid-session', timestamp: new Date().toISOString() })
        );
        fs.writeFileSync(path.join(mtmDir, 'session_002.json'), '{ corrupted');

        // Should filter out corrupted file
        const sessions = getMTMSessions(TEST_PROJECT_ROOT);
        assert.strictEqual(sessions.length, 1, 'Should have only 1 valid session');
        assert.strictEqual(sessions[0].session_id, 'valid-session', 'Should keep valid session');
      } finally {
        cleanupTestDir();
      }
    });

    it('should handle corrupted STM in consolidateSession', function () {
      setupTestDir();
      try {
        const { consolidateSession } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Write corrupted STM
        const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
        fs.writeFileSync(stmPath, '{ broken json {{');

        // Should return error result
        const result = consolidateSession('test-session', TEST_PROJECT_ROOT);
        assert.strictEqual(result.success, false, 'Should fail for corrupted STM');
        assert(result.error, 'Should have error message');
      } finally {
        cleanupTestDir();
      }
    });

    it('should handle missing STM in consolidateSession', function () {
      setupTestDir();
      try {
        const { consolidateSession } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Don't create STM file
        const result = consolidateSession('nonexistent-session', TEST_PROJECT_ROOT);
        assert.strictEqual(result.success, false, 'Should fail for missing STM');
        assert(result.error.includes('No STM session'), 'Should report no STM session');
      } finally {
        cleanupTestDir();
      }
    });

    it('should handle session not found in promoteToLTM', function () {
      setupTestDir();
      try {
        const { promoteToLTM } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Don't create any MTM sessions
        const result = promoteToLTM('nonexistent-session', TEST_PROJECT_ROOT);
        assert.strictEqual(result.success, false, 'Should fail for nonexistent session');
        assert(result.error.includes('not found'), 'Should report session not found');
      } finally {
        cleanupTestDir();
      }
    });
  });

  describe('Error Path Coverage - Empty/Invalid Data', function () {
    it('should handle empty sessions array in generateSessionSummary', function () {
      setupTestDir();
      try {
        const { generateSessionSummary } = freshRequire(
          '../../../.claude/lib/memory/memory-tiers.cjs'
        );

        // Should return null for empty array
        const result = generateSessionSummary([]);
        assert.strictEqual(result, null, 'Should return null for empty sessions');
      } finally {
        cleanupTestDir();
      }
    });

    it('should handle null sessions in generateSessionSummary', function () {
      setupTestDir();
      try {
        const { generateSessionSummary } = freshRequire(
          '../../../.claude/lib/memory/memory-tiers.cjs'
        );

        // Should return null for null input
        const result = generateSessionSummary(null);
        assert.strictEqual(result, null, 'Should return null for null sessions');
      } finally {
        cleanupTestDir();
      }
    });

    it('should handle unknown tier in getTierPath', function () {
      setupTestDir();
      try {
        const { getTierPath } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Should throw for unknown tier
        try {
          getTierPath('UNKNOWN', TEST_PROJECT_ROOT);
          assert.fail('Should have thrown error for unknown tier');
        } catch (err) {
          assert(
            err.message.includes('Unknown tier'),
            `Expected 'Unknown tier' error, got: ${err.message}`
          );
        }
      } finally {
        cleanupTestDir();
      }
    });
  });

  describe('Error Path Coverage - File System Edge Cases', function () {
    it('should handle clearSTM when file does not exist', function () {
      setupTestDir();
      try {
        const { clearSTM } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

        // Should not throw when file doesn't exist
        clearSTM(TEST_PROJECT_ROOT);
        // If we get here without error, test passes
        assert(true, 'Should not throw for missing STM file');
      } finally {
        cleanupTestDir();
      }
    });

    it('should handle summarizeOldSessions when under limit', function () {
      setupTestDir();
      try {
        const { summarizeOldSessions } = freshRequire(
          '../../../.claude/lib/memory/memory-tiers.cjs'
        );

        // Create only 3 sessions (under the 10 limit)
        const mtmDir = path.join(MEMORY_DIR, 'mtm');
        for (let i = 1; i <= 3; i++) {
          fs.writeFileSync(
            path.join(mtmDir, `session_${i}.json`),
            JSON.stringify({ session_id: `session-${i}`, timestamp: new Date().toISOString() })
          );
        }

        // Should return 0 summarized
        const result = summarizeOldSessions(TEST_PROJECT_ROOT);
        assert.strictEqual(result.summarized, 0, 'Should not summarize when under limit');
        assert.strictEqual(result.summaryPath, null, 'Should have null summaryPath');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Summary
  console.log('\n================================================');
  console.log(`Tests: ${passCount} passed, ${failCount} failed`);
  console.log('================================================');

  if (failCount > 0) {
    process.exitCode = 1;
  }
}
