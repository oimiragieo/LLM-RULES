#!/usr/bin/env node
/* eslint-disable max-lines */
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

async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

async function it(name, fn) {
  try {
    await fn();
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
  (async () => {
    console.log('Memory Tiers Tests - STM/MTM/LTM Implementation');
    console.log('================================================');

    // Test Suite 1: Memory Tier Definitions
    await describe('MEMORY_TIERS constants', async function () {
      await it('should define STM tier with correct properties', function () {
        setupTestDir();
        try {
          const { MEMORY_TIERS } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

          assert(MEMORY_TIERS.STM, 'STM tier should exist');
          assert.strictEqual(
            MEMORY_TIERS.STM.name,
            'short-term',
            'STM name should be "short-term"'
          );
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

      await it('should define MTM tier with correct properties', function () {
        setupTestDir();
        try {
          const { MEMORY_TIERS } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

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

      await it('should define LTM tier with correct properties', function () {
        setupTestDir();
        try {
          const { MEMORY_TIERS } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

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
    await describe('consolidateSession (STM -> MTM)', async function () {
      await it('should move session from STM to MTM after session ends', async function () {
        setupTestDir();
        try {
          const { consolidateSession } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

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
          const result = await consolidateSession('test-session-001', TEST_PROJECT_ROOT);

          assert(result.success, 'Consolidation should succeed');
          assert(result.mtmPath, 'Should return MTM path');

          // Verify STM is cleared
          assert(!fs.existsSync(stmPath), 'STM file should be removed after consolidation');

          // Verify MTM has the session
          assert(fs.existsSync(result.mtmPath), 'MTM file should exist');
          const mtmData = JSON.parse(fs.readFileSync(result.mtmPath, 'utf8'));
          assert.strictEqual(
            mtmData.session_id,
            'test-session-001',
            'MTM should have session data'
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should write session archive when enabled', async function () {
        setupTestDir();
        const previous = process.env.MEMORY_SESSION_ARCHIVE;
        process.env.MEMORY_SESSION_ARCHIVE = '1';
        try {
          const { consolidateSession } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

          const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
          const sessionData = {
            session_id: 'archive-session-001',
            timestamp: new Date().toISOString(),
            summary: 'Archive session summary',
          };
          fs.writeFileSync(stmPath, JSON.stringify(sessionData, null, 2));

          const result = await consolidateSession('archive-session-001', TEST_PROJECT_ROOT);

          assert(result.success, 'Consolidation should succeed');
          const mtmDir = path.join(MEMORY_DIR, 'mtm');
          const archiveDirs = fs.readdirSync(mtmDir).filter(name => name.startsWith('archive_'));
          assert.strictEqual(archiveDirs.length, 1, 'Should create one archive directory');

          const archivePath = path.join(mtmDir, archiveDirs[0]);
          assert(fs.existsSync(path.join(archivePath, 'session.json')));
          assert(fs.existsSync(path.join(archivePath, '.overview.md')));
          assert(fs.existsSync(path.join(archivePath, '.abstract.md')));
        } finally {
          if (previous === undefined) {
            delete process.env.MEMORY_SESSION_ARCHIVE;
          } else {
            process.env.MEMORY_SESSION_ARCHIVE = previous;
          }
          cleanupTestDir();
        }
      });

      await it('should add consolidated_at timestamp when moving to MTM', async function () {
        setupTestDir();
        try {
          const { consolidateSession } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

          // Create a session in STM
          const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
          const sessionData = {
            session_id: 'test-session-002',
            timestamp: new Date().toISOString(),
            summary: 'Another test session',
          };
          fs.writeFileSync(stmPath, JSON.stringify(sessionData, null, 2));

          const before = new Date();
          await consolidateSession('test-session-002', TEST_PROJECT_ROOT);
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

      await it('should enforce MTM max sessions limit (10)', async function () {
        setupTestDir();
        try {
          const { consolidateSession, getMTMSessions } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

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
          await consolidateSession('session-013', TEST_PROJECT_ROOT);

          const mtmSessions = getMTMSessions(TEST_PROJECT_ROOT);
          assert(
            mtmSessions.length <= 10,
            `MTM should have at most 10 sessions, got ${mtmSessions.length}`
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should summarize when MTM is exactly full before adding a new session', async function () {
        setupTestDir();
        try {
          const { consolidateSession, getMTMSessions } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

          const mtmDir = path.join(MEMORY_DIR, 'mtm');
          for (let i = 1; i <= 10; i++) {
            const sessionData = {
              session_id: `full-session-${String(i).padStart(3, '0')}`,
              timestamp: new Date(Date.now() - (10 - i) * 3600000).toISOString(),
              summary: `Full session ${i} summary`,
            };
            fs.writeFileSync(
              path.join(mtmDir, `session_full_${String(i).padStart(3, '0')}.json`),
              JSON.stringify(sessionData, null, 2)
            );
          }

          const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
          fs.writeFileSync(
            stmPath,
            JSON.stringify(
              {
                session_id: 'full-session-011',
                timestamp: new Date().toISOString(),
                summary: 'Incoming session when MTM is exactly full',
              },
              null,
              2
            )
          );

          const result = await consolidateSession('full-session-011', TEST_PROJECT_ROOT);
          assert(result.success, 'Consolidation should succeed when MTM is exactly full');

          const mtmSessions = getMTMSessions(TEST_PROJECT_ROOT);
          assert(
            mtmSessions.length <= 10,
            `MTM should stay within cap after exact-full consolidation, got ${mtmSessions.length}`
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should emit runtime memory-tier observability events during consolidation', async function () {
        setupTestDir();
        const previous = process.env.MEMORY_TIER_EVENT_LOG;
        try {
          process.env.MEMORY_TIER_EVENT_LOG = 'on';

          const { consolidateSession } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );
          const stmPath = path.join(MEMORY_DIR, 'stm', 'session_current.json');
          fs.writeFileSync(
            stmPath,
            JSON.stringify(
              {
                session_id: 'obs-session-001',
                timestamp: new Date().toISOString(),
                summary: 'Observability consolidation test',
              },
              null,
              2
            )
          );

          const result = await consolidateSession('obs-session-001', TEST_PROJECT_ROOT);
          assert(result.success, 'Consolidation should succeed');

          const eventsPath = path.join(
            TEST_PROJECT_ROOT,
            '.claude',
            'context',
            'runtime',
            'memory-tier-events.jsonl'
          );
          assert(fs.existsSync(eventsPath), 'Observability event file should be created');

          const lines = fs
            .readFileSync(eventsPath, 'utf8')
            .split(/\r?\n/)
            .filter(Boolean)
            .map(line => JSON.parse(line));

          assert(lines.length > 0, 'Event file should contain at least one event');
          assert(
            lines.some(event => event.event === 'consolidated_to_mtm'),
            'Should include consolidated_to_mtm event'
          );
        } finally {
          if (previous === undefined) {
            delete process.env.MEMORY_TIER_EVENT_LOG;
          } else {
            process.env.MEMORY_TIER_EVENT_LOG = previous;
          }
          cleanupTestDir();
        }
      });
    });

    // Test Suite 3: LTM Promotion
    await describe('promoteToLTM (MTM -> LTM)', async function () {
      await it('should promote high-value session to LTM', async function () {
        setupTestDir();
        try {
          const { promoteToLTM } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

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
          const result = await promoteToLTM('important-session-001', TEST_PROJECT_ROOT);

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

      await it('should remove session from MTM after promotion', async function () {
        setupTestDir();
        try {
          const { promoteToLTM } = freshRequire('../../../.claude/lib/memory/memory-tiers.cjs');

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
          await promoteToLTM('to-promote-001', TEST_PROJECT_ROOT);

          // Verify MTM file is removed
          assert(!fs.existsSync(mtmPath), 'MTM file should be removed after promotion');
        } finally {
          cleanupTestDir();
        }
      });
    });

    // Test Suite 4: Session Summarization for LTM
    await describe('summarizeOldSessions (for LTM archive)', async function () {
      await it('should compress old sessions into summary format', async function () {
        setupTestDir();
        try {
          const { summarizeOldSessions } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

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
          const result = await summarizeOldSessions(TEST_PROJECT_ROOT);

          assert(
            result.summarized > 0,
            `Should have summarized sessions, got ${result.summarized}`
          );
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

      await it('should not summarize if under 10 sessions in MTM', async function () {
        setupTestDir();
        try {
          const { summarizeOldSessions } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

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

          const result = await summarizeOldSessions(TEST_PROJECT_ROOT);

          assert.strictEqual(result.summarized, 0, 'Should not summarize when under limit');
        } finally {
          cleanupTestDir();
        }
      });
    });

    // Test Suite 5: Bug fixes
    await describe('Bug 1 — negative slice index in _summarizeOldSessions', async function () {
      await it('should return full sessions array when sessions.length < SUMMARY_MIN_SESSIONS', async function () {
        setupTestDir();
        try {
          const { _summarizeOldSessions } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

          // Create only 1 MTM session (less than SUMMARY_MIN_SESSIONS=5)
          const mtmDir = path.join(MEMORY_DIR, 'mtm');
          const sessionData = {
            session_id: 'solo-session-001',
            timestamp: new Date().toISOString(),
            summary: 'Single session for slice test',
          };
          fs.writeFileSync(
            path.join(mtmDir, 'session_001.json'),
            JSON.stringify(sessionData, null, 2)
          );

          // With 1 session and incomingSessions=0, effectiveCount (1) <= MTM_MAX_SESSIONS (10)
          // so it returns early with summarized=0 — that is correct behaviour.
          // The negative-slice bug manifests only when effectiveCount > MTM_MAX_SESSIONS
          // but sessions.length < SUMMARY_MIN_SESSIONS. Create that scenario:
          // sessions.length=3, incomingSessions=8 → effectiveCount=11 > 10
          // toSummarize = 11-10+5 = 6
          // Math.min(6, 3-5) = Math.min(6, -2) = -2 → slice(0, -2) = [] (wrong!)
          // After fix: Math.max(0, 3-5) = 0 → slice(0, 0) = [] which still triggers
          // insufficient_batch guard (0 < 5). That is the correct safe path.

          // First assert: slice with negative end must not throw and must return []
          // We verify this by calling with 3 sessions + 8 incoming, and asserting
          // that the result is { summarized: 0 } (skipped due to insufficient_batch)
          // rather than a TypeError.
          for (let i = 2; i <= 3; i++) {
            fs.writeFileSync(
              path.join(mtmDir, `session_00${i}.json`),
              JSON.stringify(
                {
                  session_id: `solo-session-00${i}`,
                  timestamp: new Date().toISOString(),
                  summary: `Session ${i}`,
                },
                null,
                2
              )
            );
          }

          // Should not throw; should return summarized:0 (insufficient batch)
          let threw = false;
          let result;
          try {
            result = _summarizeOldSessions(TEST_PROJECT_ROOT, 8);
          } catch (_err) {
            threw = true;
          }
          assert(!threw, 'Should not throw when sessions.length < SUMMARY_MIN_SESSIONS');
          assert.strictEqual(
            result.summarized,
            0,
            'Should return summarized:0 for insufficient batch'
          );
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Bug 2 — unsafe timestamp access in generateSessionSummary', async function () {
      await it('should not throw TypeError when session has no timestamp field', function () {
        setupTestDir();
        try {
          const { generateSessionSummary } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

          // Session objects with no timestamp field
          const sessions = [
            { session_id: 'no-ts-001', summary: 'Session without timestamp' },
            { session_id: 'no-ts-002', summary: 'Another session without timestamp' },
          ];

          let threw = false;
          let result;
          try {
            result = generateSessionSummary(sessions);
          } catch (_err) {
            threw = true;
          }

          assert(!threw, `Should not throw TypeError when no timestamp field; got: ${threw}`);
          assert(result !== null && result !== undefined, 'Should return a summary object');
          assert.strictEqual(result.type, 'session_summary', 'Should return session_summary type');
        } finally {
          cleanupTestDir();
        }
      });

      await it('should handle mixed sessions where some have timestamp and some do not', function () {
        setupTestDir();
        try {
          const { generateSessionSummary } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

          const sessions = [
            {
              session_id: 'ts-001',
              timestamp: '2026-01-15T10:00:00.000Z',
              summary: 'Has timestamp',
            },
            { session_id: 'no-ts-002', summary: 'No timestamp' },
            {
              session_id: 'ts-003',
              timestamp: '2026-01-20T12:00:00.000Z',
              summary: 'Has timestamp',
            },
          ];

          let threw = false;
          let result;
          try {
            result = generateSessionSummary(sessions);
          } catch (_err) {
            threw = true;
          }

          assert(!threw, 'Should not throw with mixed session timestamp fields');
          assert(result !== null, 'Should return a result');
        } finally {
          cleanupTestDir();
        }
      });
    });

    await describe('Bug 3 — LTM eviction deletes non-summary JSON files', async function () {
      await it('should only delete summary_*.json files during eviction, not other .json files', function () {
        setupTestDir();
        try {
          const { evictOldLTMSummaries } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

          const ltmDir = path.join(MEMORY_DIR, 'ltm');

          // Create 25 summary files (exceeds default LTM_MAX_SUMMARIES=20)
          for (let i = 1; i <= 25; i++) {
            const ts = String(i).padStart(3, '0');
            fs.writeFileSync(
              path.join(ltmDir, `summary_${ts}.json`),
              JSON.stringify({ type: 'session_summary', index: i })
            );
          }

          // Create non-summary .json files that must NOT be deleted
          fs.writeFileSync(
            path.join(ltmDir, 'metadata.json'),
            JSON.stringify({ created: '2026-01-01' })
          );
          fs.writeFileSync(path.join(ltmDir, 'index.json'), JSON.stringify({ count: 25 }));
          fs.writeFileSync(
            path.join(ltmDir, 'promoted_session_abc.json'),
            JSON.stringify({ tier: 'LTM', promoted_at: '2026-01-01T00:00:00.000Z' })
          );

          evictOldLTMSummaries(TEST_PROJECT_ROOT);

          const remaining = fs.readdirSync(ltmDir);

          // Non-summary files must be preserved
          assert(remaining.includes('metadata.json'), 'metadata.json must NOT be deleted');
          assert(remaining.includes('index.json'), 'index.json must NOT be deleted');
          assert(
            remaining.includes('promoted_session_abc.json'),
            'promoted_session_abc.json must NOT be deleted'
          );

          // Only summary files should be candidates for eviction
          const summaryFiles = remaining.filter(f => f.startsWith('summary_'));
          assert(
            summaryFiles.length <= 20,
            `At most 20 summary files should remain, got ${summaryFiles.length}`
          );
        } finally {
          cleanupTestDir();
        }
      });

      await it('should only count summary_*.json files against LTM_MAX_SUMMARIES limit', function () {
        setupTestDir();
        try {
          const { evictOldLTMSummaries } = freshRequire(
            '../../../.claude/lib/memory/memory-tiers.cjs'
          );

          const ltmDir = path.join(MEMORY_DIR, 'ltm');

          // Create exactly 20 summary files + several non-summary files
          for (let i = 1; i <= 20; i++) {
            const ts = String(i).padStart(3, '0');
            fs.writeFileSync(
              path.join(ltmDir, `summary_${ts}.json`),
              JSON.stringify({ type: 'session_summary', index: i })
            );
          }
          fs.writeFileSync(path.join(ltmDir, 'extra.json'), JSON.stringify({ extra: true }));
          fs.writeFileSync(
            path.join(ltmDir, 'promoted_x.json'),
            JSON.stringify({ promoted: true })
          );

          const result = evictOldLTMSummaries(TEST_PROJECT_ROOT);

          // 20 summary files is exactly at the limit — no summary eviction should happen
          assert.strictEqual(result.evicted, 0, 'Should not evict when summary count is at limit');

          // Non-summary files must remain
          const remaining = fs.readdirSync(ltmDir);
          assert(remaining.includes('extra.json'), 'extra.json must NOT be deleted');
          assert(remaining.includes('promoted_x.json'), 'promoted_x.json must NOT be deleted');
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
  })();
}
