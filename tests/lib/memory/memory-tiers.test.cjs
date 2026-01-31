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
const TEST_PROJECT_ROOT = path.join(__dirname, '..', 'context', 'memory', '.test-tiers');
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

  // Test Suite 1: Memory Tier Definitions
  describe('MEMORY_TIERS constants', function () {
    it('should define STM tier with correct properties', function () {
      setupTestDir();
      try {
        const { MEMORY_TIERS } = freshRequire('./memory-tiers.cjs');

        assert(MEMORY_TIERS.STM, 'STM tier should exist');
        assert.strictEqual(MEMORY_TIERS.STM.name, 'short-term', 'STM name should be "short-term"');
        assert.strictEqual(
          MEMORY_TIERS.STM.retention,
          'current_session',
          'STM retention should be "current_session"'
        );
        assert(MEMORY_TIERS.STM.path.includes('stm'), 'STM path should include "stm"');
        assert.strictEqual(MEMORY_TIERS.STM.maxSessions, 1, 'STM maxSessions should be 1');
      } finally {
        cleanupTestDir();
      }
    });

    it('should define MTM tier with correct properties', function () {
      setupTestDir();
      try {
        const { MEMORY_TIERS } = freshRequire('./memory-tiers.cjs');

        assert(MEMORY_TIERS.MTM, 'MTM tier should exist');
        assert.strictEqual(MEMORY_TIERS.MTM.name, 'mid-term', 'MTM name should be "mid-term"');
        assert.strictEqual(
          MEMORY_TIERS.MTM.retention,
          '10_sessions',
          'MTM retention should be "10_sessions"'
        );
        assert(MEMORY_TIERS.MTM.path.includes('mtm'), 'MTM path should include "mtm"');
        assert.strictEqual(MEMORY_TIERS.MTM.maxSessions, 10, 'MTM maxSessions should be 10');
      } finally {
        cleanupTestDir();
      }
    });

    it('should define LTM tier with correct properties', function () {
      setupTestDir();
      try {
        const { MEMORY_TIERS } = freshRequire('./memory-tiers.cjs');

        assert(MEMORY_TIERS.LTM, 'LTM tier should exist');
        assert.strictEqual(MEMORY_TIERS.LTM.name, 'long-term', 'LTM name should be "long-term"');
        assert.strictEqual(
          MEMORY_TIERS.LTM.retention,
          'permanent',
          'LTM retention should be "permanent"'
        );
        assert(MEMORY_TIERS.LTM.path.includes('ltm'), 'LTM path should include "ltm"');
        assert.strictEqual(
          MEMORY_TIERS.LTM.maxSessions,
          null,
          'LTM maxSessions should be null (unlimited)'
        );
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 2: Session Consolidation (STM -> MTM)
  describe('consolidateSession (STM -> MTM)', function () {
    it('should move session from STM to MTM after session ends', function () {
      setupTestDir();
      try {
        const { consolidateSession } = freshRequire('./memory-tiers.cjs');

        // Create a session in STM
        const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
        const sessionData = {
          session_id: 'test-session-001',
          timestamp: new Date().toISOString(),
          summary: 'Test session summary',
          tasks_completed: ['task1', 'task2'],
          discoveries: ['discovery1'],
          patterns_found: ['pattern1'],
        };
        fs.writeFileSync(stmPath, JSON.stringify(sessionData, null, 2));

        // Consolidate
        const result = consolidateSession('test-session-001', TEST_PROJECT_ROOT);

        assert(result.success, 'Consolidation should succeed');
        assert(result.mtmPath, 'Should return MTM path');

        // Verify STM is cleared
        assert(!fs.existsSync(stmPath), 'STM file should be removed after consolidation');

        // Verify MTM has the session
        assert(fs.existsSync(result.mtmPath), 'MTM file should exist');
        const mtmData = JSON.parse(fs.readFileSync(result.mtmPath, 'utf8'));
        assert.strictEqual(mtmData.session_id, 'test-session-001', 'MTM should have session data');
      } finally {
        cleanupTestDir();
      }
    });

    it('should add consolidated_at timestamp when moving to MTM', function () {
      setupTestDir();
      try {
        const { consolidateSession } = freshRequire('./memory-tiers.cjs');

        // Create a session in STM
        const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
        const sessionData = {
          session_id: 'test-session-002',
          timestamp: new Date().toISOString(),
          summary: 'Another test session',
        };
        fs.writeFileSync(stmPath, JSON.stringify(sessionData, null, 2));

        const before = new Date();
        consolidateSession('test-session-002', TEST_PROJECT_ROOT);
        const after = new Date();

        // Read the MTM file
        const mtmFiles = fs.readdirSync(path.join(MEMORY_DIR, 'mtm'));
        assert(mtmFiles.length > 0, 'Should have MTM files');

        const mtmData = JSON.parse(
          fs.readFileSync(path.join(MEMORY_DIR, 'mtm', mtmFiles[0]), 'utf8')
        );
        assert(mtmData.consolidated_at, 'Should have consolidated_at timestamp');

        const consolidatedTime = new Date(mtmData.consolidated_at);
        assert(
          consolidatedTime >= before && consolidatedTime <= after,
          'consolidated_at should be recent'
        );
      } finally {
        cleanupTestDir();
      }
    });

    it('should enforce MTM max sessions limit (10)', function () {
      setupTestDir();
      try {
        const { consolidateSession, getMTMSessions } = freshRequire('./memory-tiers.cjs');

        // Create 12 sessions directly in MTM to test limit
        const mtmDir = path.join(MEMORY_DIR, 'mtm');
        for (let i = 1; i <= 12; i++) {
          const sessionData = {
            session_id: `session-${String(i).padStart(3, '0')}`,
            timestamp: new Date(Date.now() - (12 - i) * 3600000).toISOString(), // Older sessions first
            summary: `Session ${i} summary`,
          };
          fs.writeFileSync(
            path.join(mtmDir, `session_${String(i).padStart(3, '0')}.json`),
            JSON.stringify(sessionData, null, 2)
          );
        }

        // Create one more in STM
        const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
        fs.writeFileSync(
          stmPath,
          JSON.stringify(
            {
              session_id: 'session-013',
              timestamp: new Date().toISOString(),
              summary: 'Latest session',
            },
            null,
            2
          )
        );

        // Consolidate - should trigger overflow handling
        consolidateSession('session-013', TEST_PROJECT_ROOT);

        const mtmSessions = getMTMSessions(TEST_PROJECT_ROOT);
        assert(
          mtmSessions.length <= 10,
          `MTM should have at most 10 sessions, got ${mtmSessions.length}`
        );
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 3: LTM Promotion
  describe('promoteToLTM (MTM -> LTM)', function () {
    it('should promote high-value session to LTM', function () {
      setupTestDir();
      try {
        const { promoteToLTM } = freshRequire('./memory-tiers.cjs');

        // Create a session in MTM
        const mtmDir = path.join(MEMORY_DIR, 'mtm');
        const sessionData = {
          session_id: 'important-session-001',
          timestamp: new Date().toISOString(),
          summary: 'Critical architectural decision made',
          decisions_made: ['Use microservices', 'Adopt TDD'],
          patterns_found: ['Event sourcing pattern'],
          high_value: true,
        };
        fs.writeFileSync(
          path.join(mtmDir, 'session_important.json'),
          JSON.stringify(sessionData, null, 2)
        );

        // Promote to LTM
        const result = promoteToLTM('important-session-001', TEST_PROJECT_ROOT);

        assert(result.success, 'Promotion should succeed');
        assert(result.ltmPath, 'Should return LTM path');

        // Verify LTM has the session
        assert(fs.existsSync(result.ltmPath), 'LTM file should exist');
        const ltmData = JSON.parse(fs.readFileSync(result.ltmPath, 'utf8'));
        assert.strictEqual(
          ltmData.session_id,
          'important-session-001',
          'LTM should have session data'
        );
        assert(ltmData.promoted_at, 'LTM entry should have promoted_at timestamp');
      } finally {
        cleanupTestDir();
      }
    });

    it('should remove session from MTM after promotion', function () {
      setupTestDir();
      try {
        const { promoteToLTM } = freshRequire('./memory-tiers.cjs');

        // Create a session in MTM
        const mtmDir = path.join(MEMORY_DIR, 'mtm');
        const mtmPath = path.join(mtmDir, 'session_to_promote.json');
        fs.writeFileSync(
          mtmPath,
          JSON.stringify(
            {
              session_id: 'to-promote-001',
              timestamp: new Date().toISOString(),
              summary: 'Session to be promoted',
            },
            null,
            2
          )
        );

        // Promote
        promoteToLTM('to-promote-001', TEST_PROJECT_ROOT);

        // Verify MTM file is removed
        assert(!fs.existsSync(mtmPath), 'MTM file should be removed after promotion');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 4: Session Summarization for LTM
  describe('summarizeOldSessions (for LTM archive)', function () {
    it('should compress old sessions into summary format', function () {
      setupTestDir();
      try {
        const { summarizeOldSessions } = freshRequire('./memory-tiers.cjs');

        // Create 15 MTM sessions (more than 10 limit)
        const mtmDir = path.join(MEMORY_DIR, 'mtm');
        const now = new Date();
        for (let i = 1; i <= 15; i++) {
          const sessionDate = new Date(now - (15 - i) * 24 * 60 * 60 * 1000); // days ago
          const sessionData = {
            session_id: `old-session-${String(i).padStart(3, '0')}`,
            timestamp: sessionDate.toISOString(),
            summary: `Session ${i} summary`,
            tasks_completed: [`task${i}a`, `task${i}b`],
            discoveries: [`discovery${i}`],
            patterns_found: i % 2 === 0 ? [`pattern${i}`] : [],
            decisions_made: i % 3 === 0 ? [`decision${i}`] : [],
            files_modified: [`file${i}.js`],
          };
          fs.writeFileSync(
            path.join(mtmDir, `session_${String(i).padStart(3, '0')}.json`),
            JSON.stringify(sessionData, null, 2)
          );
        }

        // Summarize old sessions (should move oldest to LTM as summary)
        const result = summarizeOldSessions(TEST_PROJECT_ROOT);

        assert(result.summarized > 0, `Should have summarized sessions, got ${result.summarized}`);
        assert(result.summaryPath, 'Should return summary path');

        // Verify summary file exists in LTM
        const ltmDir = path.join(MEMORY_DIR, 'ltm');
        const ltmFiles = fs.readdirSync(ltmDir);
        assert(ltmFiles.length > 0, 'LTM should have summary files');

        // Verify summary format
        const summaryData = JSON.parse(fs.readFileSync(result.summaryPath, 'utf8'));
        assert(summaryData.type === 'session_summary', 'Should be marked as session_summary');
        assert(summaryData.date_range, 'Should have date_range');
        assert(Array.isArray(summaryData.key_learnings), 'Should have key_learnings array');
        assert(Array.isArray(summaryData.major_decisions), 'Should have major_decisions array');
        assert(
          Array.isArray(summaryData.important_patterns),
          'Should have important_patterns array'
        );
        assert(
          Array.isArray(summaryData.files_frequently_touched),
          'Should have files_frequently_touched array'
        );
      } finally {
        cleanupTestDir();
      }
    });

    it('should not summarize if under 10 sessions in MTM', function () {
      setupTestDir();
      try {
        const { summarizeOldSessions } = freshRequire('./memory-tiers.cjs');

        // Create only 5 MTM sessions
        const mtmDir = path.join(MEMORY_DIR, 'mtm');
        for (let i = 1; i <= 5; i++) {
          fs.writeFileSync(
            path.join(mtmDir, `session_${String(i).padStart(3, '0')}.json`),
            JSON.stringify(
              {
                session_id: `session-${i}`,
                timestamp: new Date().toISOString(),
                summary: `Session ${i}`,
              },
              null,
              2
            )
          );
        }

        const result = summarizeOldSessions(TEST_PROJECT_ROOT);

        assert.strictEqual(result.summarized, 0, 'Should not summarize when under limit');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 5: LTM Summary Format
  describe('LTM Summary Format', function () {
    it('should generate markdown-compatible summary', function () {
      setupTestDir();
      try {
        const { generateSessionSummary } = freshRequire('./memory-tiers.cjs');

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
        const { getTierHealth } = freshRequire('./memory-tiers.cjs');

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
        const { getTierHealth } = freshRequire('./memory-tiers.cjs');

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
        const { writeSTMEntry, readSTMEntry } = freshRequire('./memory-tiers.cjs');

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
        const { readSTMEntry } = freshRequire('./memory-tiers.cjs');

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
        const { getMTMSessions } = freshRequire('./memory-tiers.cjs');

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
        const { consolidateSession } = freshRequire('./memory-tiers.cjs');

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
        const { consolidateSession } = freshRequire('./memory-tiers.cjs');

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
        const { promoteToLTM } = freshRequire('./memory-tiers.cjs');

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
        const { generateSessionSummary } = freshRequire('./memory-tiers.cjs');

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
        const { generateSessionSummary } = freshRequire('./memory-tiers.cjs');

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
        const { getTierPath } = freshRequire('./memory-tiers.cjs');

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
        const { clearSTM } = freshRequire('./memory-tiers.cjs');

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
        const { summarizeOldSessions } = freshRequire('./memory-tiers.cjs');

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
