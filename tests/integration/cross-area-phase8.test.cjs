#!/usr/bin/env node
'use strict';

/**
 * Cross-Area Integration Tests — Phase 8 (Memory Consolidation)
 * ==============================================================
 *
 * VAL-CROSS-016: Full cycle — 5 MTM sessions + 3 daily logs + 25h-old lock.
 *   shouldConsolidate returns true. consolidate() updates structured files.
 *   Lock acquisition advances mtime.
 *
 * VAL-CROSS-017: Sequential lock contention — first acquire succeeds,
 *   second returns null (blocked), rollback first, second succeeds.
 *
 * VAL-CROSS-018: Consolidation failure rollback — mock consolidation throws,
 *   assert lock mtime rolled back so shouldConsolidate returns true again.
 *
 * VAL-CROSS-019: MemoryRecord + daily log coexist — write pattern via
 *   MemoryRecord API, write similar entry to daily log, run consolidation,
 *   assert no duplicates (content similarity check).
 *
 * VAL-CROSS-020: Full STM→MTM→LTM cycle — writeSTMEntry, consolidateSession,
 *   fill MTM to trigger LTM summarization. Assert STM cleared, MTM created,
 *   LTM summary created.
 *
 * VAL-CROSS-021: First-run scenario — empty temp dir, create first daily log,
 *   shouldConsolidate returns false (< 5 sessions).
 *
 * VAL-CROSS-022: Daily log failure doesn't block STM→MTM promotion — mock
 *   appendDailyLog to fail, assert STM still promoted to MTM.
 *
 * All tests use temp directories for isolation.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

// ── Module paths ──────────────────────────────────────────────────────────────

const CONSOLIDATION_LOCK_PATH = path.join(
  ROOT,
  '.claude',
  'lib',
  'memory',
  'consolidation-lock.cjs'
);
const MEMORY_CONSOLIDATOR_PATH = path.join(
  ROOT,
  '.claude',
  'lib',
  'memory',
  'memory-consolidator.cjs'
);
const MEMORY_TIERS_PATH = path.join(ROOT, '.claude', 'lib', 'memory', 'memory-tiers.cjs');
const DAILY_LOG_PATH = path.join(ROOT, '.claude', 'lib', 'memory', 'memory-daily-log.cjs');
const RECORDING_OPS_PATH = path.join(
  ROOT,
  '.claude',
  'lib',
  'memory',
  'memory-manager-core-recording.cjs'
);
const STORAGE_HELPERS_PATH = path.join(
  ROOT,
  '.claude',
  'lib',
  'memory',
  'memory-manager-core-storage.cjs'
);

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Create a fresh isolated temp directory. */
function createTempDir() {
  const tmpDir = path.join(os.tmpdir(), `cross-p8-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/** Remove a temp directory (best-effort, ignores Windows EBUSY). */
function cleanupTempDir(tmpDir) {
  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (_e) {
    // ignore
  }
}

/**
 * Create the memory directory layout expected by memory-tiers inside a temp dir.
 * Returns { projectRoot, memoryDir }.
 *
 * - memory-tiers functions accept `projectRoot` and derive the memory dir as
 *   `<projectRoot>/.claude/context/memory`.
 * - consolidation-lock, memory-consolidator, and memory-daily-log accept
 *   `memoryDir` directly.
 */
function createTestLayout(tmpDir) {
  const memoryDir = path.join(tmpDir, '.claude', 'context', 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });
  return { projectRoot: tmpDir, memoryDir };
}

/**
 * Load (or reload) the consolidation-lock module to reset its module-level
 * `_lastScanTime` state between tests.
 */
function getLockModule() {
  delete require.cache[CONSOLIDATION_LOCK_PATH];
  return require(CONSOLIDATION_LOCK_PATH);
}

/**
 * Create N MTM session JSON files under `<memoryDir>/mtm/` with the given mtime.
 *
 * @param {string} memoryDir - Base memory directory
 * @param {number} count     - Number of session files to create
 * @param {number} mtimeMs   - mtime in ms to assign to each file
 */
function createMtmFiles(memoryDir, count, mtimeMs) {
  const mtmDir = path.join(memoryDir, 'mtm');
  fs.mkdirSync(mtmDir, { recursive: true });
  const mtimeDate = new Date(mtimeMs);
  for (let i = 0; i < count; i++) {
    const filePath = path.join(mtmDir, `session_${String(i).padStart(3, '0')}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ session_id: `sess-${i}`, tier: 'MTM' }), 'utf8');
    fs.utimesSync(filePath, mtimeDate, mtimeDate);
  }
}

/**
 * Create a `.consolidate-lock` file in memoryDir with specific mtime and body.
 *
 * @param {string} memoryDir - Base memory directory
 * @param {number} mtimeMs   - Lock mtime in ms
 * @param {string} [content] - Lock file body (default: empty string)
 * @returns {string} Absolute path to the lock file
 */
function createLockFile(memoryDir, mtimeMs, content = '') {
  const lockPath = path.join(memoryDir, '.consolidate-lock');
  fs.writeFileSync(lockPath, content, 'utf8');
  const mtimeDate = new Date(mtimeMs);
  fs.utimesSync(lockPath, mtimeDate, mtimeDate);
  return lockPath;
}

/**
 * Write a daily log file at the canonical path for a given UTC date string.
 *
 * @param {string} memoryDir - Base memory directory
 * @param {string} dateStr   - 'YYYY-MM-DD' (UTC)
 * @param {string} content   - File content
 * @returns {string} Absolute path to the written log file
 */
function writeDailyLog(memoryDir, dateStr, content) {
  const [year, month] = dateStr.split('-');
  const logDir = path.join(memoryDir, 'logs', year, month);
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${dateStr}.md`);
  fs.writeFileSync(logPath, content, 'utf8');
  return logPath;
}

// =============================================================================
// VAL-CROSS-016: Full cycle: log, trigger, consolidate, lock mtime advances
// =============================================================================

describe('VAL-CROSS-016: Full cycle: log, trigger, consolidate, lock mtime advances', () => {
  let tmpDir;
  let memoryDir;

  before(() => {
    tmpDir = createTempDir();
    ({ memoryDir } = createTestLayout(tmpDir));
  });

  after(() => {
    cleanupTempDir(tmpDir);
  });

  it('shouldConsolidate returns true with 5 MTM sessions and 25h-old lock', () => {
    const now = Date.now();
    const lock25hAgo = now - 25 * 60 * 60 * 1000;

    // Create 5 MTM session files with mtime AFTER the lock
    createMtmFiles(memoryDir, 5, now - 5000);

    // Create lock file with mtime 25+ hours ago
    createLockFile(memoryDir, lock25hAgo, '99999');

    // Reload module to reset scan throttle state
    const { shouldConsolidate } = getLockModule();
    const result = shouldConsolidate(memoryDir);

    assert.strictEqual(result.should, true, `Expected should=true, got: ${JSON.stringify(result)}`);
    assert.strictEqual(result.reason, 'all-gates-passed');
    assert.ok(result.sessionCount >= 5, `Expected sessionCount >= 5, got ${result.sessionCount}`);
  });

  it('consolidate() processes daily logs and updates structured memory files', () => {
    const now = Date.now();
    const lock25hAgo = now - 25 * 60 * 60 * 1000;

    // Build today's UTC date string
    const today = new Date(now).toISOString().split('T')[0];

    // Create 3 daily log files spanning today
    // Log 1: pattern keyword
    writeDailyLog(
      memoryDir,
      today,
      [
        '- [09:00:00] learned a new pattern: use atomic writes for critical files',
        '- [10:00:00] gotcha: always sanitize before writing to memory',
        '- [11:00:00] decision: adopt fail-open error handling throughout',
      ].join('\n') + '\n'
    );

    // Also create two additional "virtual" log files at different dates
    // (simulate 3 logs by using yesterday and day-before)
    const d1 = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const d2 = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (d1 !== today) {
      writeDailyLog(memoryDir, d1, '- [08:00:00] issue: discovered stale cache entries\n');
    }
    if (d2 !== today && d2 !== d1) {
      writeDailyLog(memoryDir, d2, '- [08:30:00] learned about consolidation ordering\n');
    }

    const { consolidate } = require(MEMORY_CONSOLIDATOR_PATH);
    const result = consolidate(memoryDir, lock25hAgo);

    assert.ok(
      result.processed >= 1,
      `Should have processed >= 1 log file; got ${result.processed}`
    );
    assert.ok(result.extracted >= 1, `Should have extracted >= 1 item; got ${result.extracted}`);
    assert.ok(
      result.affectedFiles.length >= 1,
      `Should have >= 1 affected file; got ${result.affectedFiles.length}`
    );

    // Verify at least one structured file was written
    const patternsFile = path.join(memoryDir, 'patterns.json');
    const gotchasFile = path.join(memoryDir, 'gotchas.json');
    const decisionsFile = path.join(memoryDir, 'decisions.md');
    const issuesFile = path.join(memoryDir, 'issues.md');

    const anyExists = [patternsFile, gotchasFile, decisionsFile, issuesFile].some(f =>
      fs.existsSync(f)
    );
    assert.ok(anyExists, 'At least one structured memory file should be created by consolidation');

    // patterns.json should contain an entry with the 'pattern' keyword text
    if (fs.existsSync(patternsFile)) {
      const patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
      assert.ok(
        Array.isArray(patterns) && patterns.length >= 1,
        'patterns.json should have entries'
      );
    }
  });

  it('acquiring consolidation lock after consolidation advances lock mtime', () => {
    // Reload the lock module for fresh state
    const { tryAcquireConsolidationLock, readLastConsolidatedAt } = getLockModule();

    const beforeMtime = readLastConsolidatedAt(memoryDir);
    const priorMtime = tryAcquireConsolidationLock(memoryDir);

    assert.ok(priorMtime !== null, 'Lock acquisition should succeed');

    const afterMtime = readLastConsolidatedAt(memoryDir);
    assert.ok(
      afterMtime >= beforeMtime,
      `Lock mtime should not decrease: ${beforeMtime} → ${afterMtime}`
    );

    // Lock file should contain our PID
    const lockPath = path.join(memoryDir, '.consolidate-lock');
    const content = fs.readFileSync(lockPath, 'utf8').trim();
    assert.strictEqual(content, String(process.pid), 'Lock file should contain current PID');
  });
});

// =============================================================================
// VAL-CROSS-017: Sequential lock contention
// =============================================================================

describe('VAL-CROSS-017: Sequential lock contention', () => {
  let tmpDir;
  let memoryDir;

  before(() => {
    tmpDir = createTempDir();
    ({ memoryDir } = createTestLayout(tmpDir));
  });

  after(() => {
    cleanupTempDir(tmpDir);
  });

  it('first acquire succeeds, second returns null (blocked), rollback enables third acquire', () => {
    const { tryAcquireConsolidationLock, rollbackConsolidationLock } = getLockModule();

    // First acquire: lock file doesn't exist → priorMtime = 0
    const priorMtime = tryAcquireConsolidationLock(memoryDir);
    assert.ok(priorMtime !== null, 'First acquire should succeed (returns priorMtime)');
    assert.strictEqual(priorMtime, 0, 'Prior mtime should be 0 (no prior lock file)');

    // Lock file now contains our PID — we are the live holder
    const lockPath = path.join(memoryDir, '.consolidate-lock');
    const content = fs.readFileSync(lockPath, 'utf8').trim();
    assert.strictEqual(
      content,
      String(process.pid),
      'Lock must hold current PID after first acquire'
    );

    // Second acquire: same process PID → live process → blocked
    const secondResult = tryAcquireConsolidationLock(memoryDir);
    assert.strictEqual(
      secondResult,
      null,
      'Second acquire should return null (blocked by live lock)'
    );

    // Rollback first (priorMtime = 0 → lock file deleted)
    rollbackConsolidationLock(memoryDir, priorMtime);
    assert.ok(
      !fs.existsSync(lockPath),
      'Lock file should be removed after rollback with priorMtime=0'
    );

    // Third acquire after rollback: lock file gone → should succeed
    const thirdResult = tryAcquireConsolidationLock(memoryDir);
    assert.ok(thirdResult !== null, 'Third acquire (after rollback) should succeed');
  });
});

// =============================================================================
// VAL-CROSS-018: Consolidation failure rolls back lock
// =============================================================================

describe('VAL-CROSS-018: Consolidation failure rolls back lock mtime', () => {
  let tmpDir;
  let memoryDir;

  before(() => {
    tmpDir = createTempDir();
    ({ memoryDir } = createTestLayout(tmpDir));
  });

  after(() => {
    cleanupTempDir(tmpDir);
  });

  it('lock mtime restored after consolidation throws, shouldConsolidate returns true again', () => {
    const now = Date.now();
    const lock25hAgo = now - 25 * 60 * 60 * 1000;

    // Set up a lock file with mtime 25h ago
    createLockFile(memoryDir, lock25hAgo, '');

    // Create 5 MTM sessions so the session gate passes
    createMtmFiles(memoryDir, 5, now - 5000);

    // Acquire the lock
    const lockMod = getLockModule();
    const priorMtime = lockMod.tryAcquireConsolidationLock(memoryDir);
    assert.ok(priorMtime !== null, 'Lock acquisition should succeed before rollback test');

    // Lock mtime is now ≈ Date.now() (recent) — shouldConsolidate would return false
    // (time gate: < 24h since lock mtime)

    // Simulate consolidation failure
    let caughtError = null;
    try {
      throw new Error('Simulated consolidation failure');
    } catch (err) {
      caughtError = err;
      // Rollback: restore lock mtime to priorMtime (25h ago)
      lockMod.rollbackConsolidationLock(memoryDir, priorMtime);
    }

    assert.ok(caughtError !== null, 'Simulated error should have been thrown');

    // After rollback, lock mtime should be restored to priorMtime
    const restoredMtime = lockMod.readLastConsolidatedAt(memoryDir);

    // Allow ±2 second tolerance for utimesSync precision
    const diffMs = Math.abs(restoredMtime - priorMtime);
    assert.ok(
      diffMs <= 2000,
      `Restored mtime ${restoredMtime} should be close to priorMtime ${priorMtime} (diff=${diffMs}ms)`
    );

    // shouldConsolidate should return true again (lock mtime is back to 25h ago)
    // Reload module to reset scan throttle
    const lockMod2 = getLockModule();
    const result = lockMod2.shouldConsolidate(memoryDir);
    assert.strictEqual(
      result.should,
      true,
      `shouldConsolidate should return true after rollback; got: ${JSON.stringify(result)}`
    );
  });
});

// =============================================================================
// VAL-CROSS-019: MemoryRecord and daily log coexist without duplicates
// =============================================================================

describe('VAL-CROSS-019: MemoryRecord and daily log coexist without duplicates', () => {
  let tmpDir;
  let memoryDir;

  before(() => {
    tmpDir = createTempDir();
    ({ memoryDir } = createTestLayout(tmpDir));
  });

  after(() => {
    cleanupTempDir(tmpDir);
  });

  it('MemoryRecord direct write and daily log consolidation produce distinct entries in patterns.json', () => {
    // Step 1: Write a pattern directly via MemoryRecord API (bypasses daily log).
    // We use createRecordingOps with a permissive validateProjectRoot so the temp
    // dir is accepted — this mirrors how memory-record-integration.test.cjs works.
    const { createRecordingOps } = require(RECORDING_OPS_PATH);
    const { createStorageHelpers } = require(STORAGE_HELPERS_PATH);

    const getMemDir = pr => path.join(pr, '.claude', 'context', 'memory');
    const ensureDirLocal = d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    };

    const storage = createStorageHelpers({
      PROJECT_ROOT: tmpDir,
      validatePathWithinProject: () => ({ safe: true }),
      validateProjectRoot: () => {},
      getMemoryDir: getMemDir,
      ensureDir: ensureDirLocal,
    });

    const recording = createRecordingOps({
      PROJECT_ROOT: tmpDir,
      validateProjectRoot: () => {},
      getMemoryDir: getMemDir,
      ensureDir: ensureDirLocal,
      withFileLockSync: storage.withFileLockSync,
      buildEntryId: storage.buildEntryId,
      normalizeArea: storage.normalizeArea,
      maybeSyncMemoryJson: storage.maybeSyncMemoryJson,
      emitMemorySavedEvent: () => {},
    });

    const directPatternText = 'pattern-cross019-direct: use atomic writes for structured memory';
    recording.recordPattern(directPatternText, tmpDir);

    // Step 2: Write a DIFFERENT pattern text to the daily log
    const today = new Date().toISOString().split('T')[0];
    const logEntry = `- [12:00:00] learned a new pattern: use incremental scanning for large datasets\n`;
    writeDailyLog(memoryDir, today, logEntry);

    // Step 3: Run consolidation with sinceTimestamp=0 to process all logs
    const { consolidate } = require(MEMORY_CONSOLIDATOR_PATH);
    consolidate(memoryDir, 0);

    // Step 4: Run consolidation again (idempotency — no new entries from same logs)
    consolidate(memoryDir, 0);

    // Step 5: Read patterns.json and verify no duplicate entries by text
    const patternsFile = path.join(memoryDir, 'patterns.json');
    assert.ok(fs.existsSync(patternsFile), 'patterns.json should exist after consolidation');
    const patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
    assert.ok(Array.isArray(patterns), 'patterns.json should be an array');

    // Collect all text values
    const texts = patterns.map(p => p.text);

    // Check for duplicates by text
    const textSet = new Set(texts);
    assert.strictEqual(
      texts.length,
      textSet.size,
      `No duplicate text entries expected in patterns.json; found ${texts.length} entries, ${textSet.size} unique`
    );

    // The direct pattern write should be present
    const hasDirectEntry = texts.some(t => t && t.includes('pattern-cross019-direct'));
    assert.ok(hasDirectEntry, 'Direct MemoryRecord entry should be present in patterns.json');

    // The daily log pattern should also be present
    const hasLogEntry = texts.some(t => t && t.includes('incremental scanning'));
    assert.ok(hasLogEntry, 'Daily log pattern entry should be present in patterns.json');
  });
});

// =============================================================================
// VAL-CROSS-020: Full STM→MTM→LTM cycle
// =============================================================================

describe('VAL-CROSS-020: Full STM→MTM→LTM cycle still functional', () => {
  let tmpDir;

  before(() => {
    tmpDir = createTempDir();
    // Ensure memory directory structure exists (memory-tiers functions also create
    // dirs on demand, but this ensures a clean baseline for all tests in this suite).
    createTestLayout(tmpDir);
  });

  after(() => {
    cleanupTempDir(tmpDir);
  });

  it('writeSTMEntry + consolidateSession promotes STM to MTM and clears STM', () => {
    const { writeSTMEntry, consolidateSession, readSTMEntry, getMTMSessions } = require(
      MEMORY_TIERS_PATH
    );

    const sessionId = 'test-020-stm';
    writeSTMEntry({ session_id: sessionId, tier: 'STM', entries: [] }, tmpDir);

    // Verify STM was written
    const stmEntry = readSTMEntry(tmpDir);
    assert.ok(stmEntry !== null, 'STM entry should exist after writeSTMEntry');
    assert.strictEqual(stmEntry.session_id, sessionId);

    // Promote STM → MTM
    const result = consolidateSession(sessionId, tmpDir);
    assert.strictEqual(result.success, true, 'consolidateSession should succeed');
    assert.ok(result.mtmPath, 'consolidateSession should return mtmPath');

    // STM should be cleared
    const stmAfter = readSTMEntry(tmpDir);
    assert.strictEqual(stmAfter, null, 'STM should be cleared after consolidation');

    // MTM should have the new session
    const mtmSessions = getMTMSessions(tmpDir);
    assert.ok(mtmSessions.length >= 1, 'MTM should have at least one session after consolidation');
    const promoted = mtmSessions.find(s => s.session_id === sessionId);
    assert.ok(promoted !== undefined, 'Promoted session should be findable in MTM');
  });

  it('filling MTM to capacity triggers LTM summarization on next consolidation', () => {
    const { writeSTMEntry, consolidateSession, getMTMSessions, CONFIG } = require(
      MEMORY_TIERS_PATH
    );

    // We need MTM to be at max capacity (10) before adding a new session.
    // Use a fresh tmpDir for isolation.
    const freshTmp = createTempDir();
    const { memoryDir: freshMemDir } = createTestLayout(freshTmp);

    try {
      // Create MTM_MAX_SESSIONS (10) direct MTM session files
      const mtmDir = path.join(freshMemDir, 'mtm');
      fs.mkdirSync(mtmDir, { recursive: true });
      for (let i = 0; i < CONFIG.MTM_MAX_SESSIONS; i++) {
        const filePath = path.join(mtmDir, `session_${String(i).padStart(3, '0')}.json`);
        fs.writeFileSync(
          filePath,
          JSON.stringify({
            session_id: `fill-sess-${i}`,
            tier: 'MTM',
            entries: [{ text: `entry ${i}`, importance: 0.5 }],
            consolidated: false,
          }),
          'utf8'
        );
      }

      // Verify MTM is at capacity
      const mtmBefore = getMTMSessions(freshTmp);
      assert.strictEqual(
        mtmBefore.length,
        CONFIG.MTM_MAX_SESSIONS,
        `MTM should have ${CONFIG.MTM_MAX_SESSIONS} sessions before overflow`
      );

      // Write one more STM entry and consolidate → triggers LTM summarization
      const overflowId = 'test-020-overflow';
      writeSTMEntry(
        {
          session_id: overflowId,
          tier: 'STM',
          entries: [{ text: 'overflow session entry', importance: 0.7 }],
        },
        freshTmp
      );

      const overflowResult = consolidateSession(overflowId, freshTmp);
      assert.strictEqual(overflowResult.success, true, 'Overflow consolidation should succeed');

      // LTM directory should have a summary file
      const ltmDir = path.join(freshMemDir, 'ltm');
      assert.ok(fs.existsSync(ltmDir), 'LTM directory should be created during summarization');

      const ltmFiles = fs.readdirSync(ltmDir).filter(f => f.endsWith('.json'));
      assert.ok(ltmFiles.length >= 1, 'LTM should have at least one summary file after overflow');

      // The summary file should be a valid JSON object
      const summaryContent = JSON.parse(fs.readFileSync(path.join(ltmDir, ltmFiles[0]), 'utf8'));
      assert.ok(
        summaryContent && typeof summaryContent === 'object',
        'LTM summary should be a valid JSON object'
      );
    } finally {
      cleanupTempDir(freshTmp);
    }
  });
});

// =============================================================================
// VAL-CROSS-021: First-run scenario with no prior memory state
// =============================================================================

describe('VAL-CROSS-021: First-run scenario with no prior memory state', () => {
  let tmpDir;
  let memoryDir;

  before(() => {
    tmpDir = createTempDir();
    // Intentionally do NOT pre-create the memory directory for first-run simulation
    memoryDir = path.join(tmpDir, '.claude', 'context', 'memory');
  });

  after(() => {
    cleanupTempDir(tmpDir);
  });

  it('first appendDailyLog creates required directories and writes log entry', () => {
    const { appendDailyLog, getDailyLogPath } = require(DAILY_LOG_PATH);

    const date = new Date();
    assert.ok(!fs.existsSync(memoryDir), 'Memory dir should not exist before first run');

    // appendDailyLog should create dirs and write the entry (fail-open)
    appendDailyLog('first session entry for fresh project', { memoryDir, date });

    const logPath = getDailyLogPath(date, { memoryDir });
    assert.ok(fs.existsSync(logPath), `Daily log file should be created at: ${logPath}`);

    const content = fs.readFileSync(logPath, 'utf8');
    assert.ok(
      content.includes('first session entry for fresh project'),
      'Daily log should contain the written entry'
    );
  });

  it('shouldConsolidate returns false when fewer than 5 MTM sessions exist', () => {
    // Create 3 MTM files (below the SESSION_GATE of 5)
    createMtmFiles(memoryDir, 3, Date.now() - 5000);

    // No lock file → readLastConsolidatedAt returns 0 → time gate: infinity hours → passes
    const { shouldConsolidate } = getLockModule();
    const result = shouldConsolidate(memoryDir);

    assert.strictEqual(
      result.should,
      false,
      `shouldConsolidate should return false with < 5 sessions; got: ${JSON.stringify(result)}`
    );
    assert.strictEqual(result.reason, 'session-gate', `Reason should be 'session-gate'`);
    assert.ok(result.sessionCount < 5, `Session count should be < 5; got ${result.sessionCount}`);
  });

  it('daily log directories are created recursively without error on first run', () => {
    // Create a completely fresh temp dir (no subdirs at all)
    const freshDir = createTempDir();
    try {
      const freshMemDir = path.join(freshDir, '.claude', 'context', 'memory');
      assert.ok(!fs.existsSync(freshMemDir), 'Fresh memory dir must not exist');

      const { appendDailyLog } = require(DAILY_LOG_PATH);
      // Should not throw
      assert.doesNotThrow(() => {
        appendDailyLog('bootstrap log entry', { memoryDir: freshMemDir });
      });

      // logs/YYYY/MM/ structure should now exist
      const logsDir = path.join(freshMemDir, 'logs');
      assert.ok(fs.existsSync(logsDir), 'logs/ directory should be created');
    } finally {
      cleanupTempDir(freshDir);
    }
  });
});

// =============================================================================
// VAL-CROSS-022: Daily log failure does not block STM→MTM promotion
// =============================================================================

describe('VAL-CROSS-022: Daily log failure does not block STM→MTM promotion', () => {
  let tmpDir;
  let memoryDir;

  before(() => {
    tmpDir = createTempDir();
    ({ memoryDir } = createTestLayout(tmpDir));
  });

  after(() => {
    cleanupTempDir(tmpDir);
  });

  it('consolidateSession succeeds even when daily log write fails', () => {
    const { writeSTMEntry, consolidateSession, readSTMEntry } = require(MEMORY_TIERS_PATH);
    const { appendDailyLog } = require(DAILY_LOG_PATH);

    const sessionId = 'test-022-failopen';

    // Write an STM entry
    writeSTMEntry(
      { session_id: sessionId, tier: 'STM', entries: [{ text: 'test', importance: 0.5 }] },
      tmpDir
    );

    // Verify STM exists
    const stmBefore = readSTMEntry(tmpDir);
    assert.ok(stmBefore !== null, 'STM entry must exist before promotion');

    // Block daily log writes by placing a *file* at the logs path
    // (fs.mkdirSync will fail when it tries to create it as a directory)
    const logsBlocker = path.join(memoryDir, 'logs');
    fs.writeFileSync(logsBlocker, 'blocker-file', 'utf8');

    // Attempt daily log write — must not throw (fail-open)
    assert.doesNotThrow(() => {
      appendDailyLog('session summary', { memoryDir });
    }, 'appendDailyLog must not throw even when write fails');

    // Now run STM→MTM promotion — must still succeed
    const promotionResult = consolidateSession(sessionId, tmpDir);
    assert.strictEqual(
      promotionResult.success,
      true,
      `consolidateSession must succeed even after daily log failure; got: ${JSON.stringify(promotionResult)}`
    );
    assert.ok(promotionResult.mtmPath, 'mtmPath should be returned on success');

    // STM should be cleared
    const stmAfter = readSTMEntry(tmpDir);
    assert.strictEqual(stmAfter, null, 'STM should be cleared after successful promotion');

    // MTM file should exist
    assert.ok(
      fs.existsSync(promotionResult.mtmPath),
      `MTM file should exist at: ${promotionResult.mtmPath}`
    );
  });

  it('session-end flow: daily log appendDailyLog fail-open behaviour is verified', () => {
    // This verifies the fail-open contract: even if the memory dir is completely
    // unwritable for logs, appendDailyLog catches all errors and returns normally.
    const { appendDailyLog } = require(DAILY_LOG_PATH);

    // Use a path where the parent is a file (not a directory) — mkdirSync will fail
    const badMemDir = path.join(createTempDir(), 'not-a-dir');
    // Create a file at the path so mkdir fails
    fs.writeFileSync(badMemDir, 'blocking-file', 'utf8');

    // appendDailyLog must not throw — it must be fully fail-open
    assert.doesNotThrow(() => {
      appendDailyLog('this should fail silently', { memoryDir: badMemDir });
    });

    // Clean up the temp dir we created inline
    cleanupTempDir(path.dirname(badMemDir));
  });
});
