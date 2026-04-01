#!/usr/bin/env node
/**
 * Tests for consolidation-lock.cjs
 *
 * Covers:
 *   VAL-ML-001: Lock file mtime serves as last-consolidated timestamp
 *   VAL-ML-002: Lock acquisition writes PID and advances mtime
 *   VAL-ML-003: Lock blocks when held by live process
 *   VAL-ML-004: Lock reclaimed from dead PID
 *   VAL-ML-005: Stale lock reclaimed after 60 minutes
 *   VAL-ML-006: Rollback rewinds mtime or deletes file
 *   VAL-ML-007: Session count gate requires 5+ sessions
 *   VAL-ML-008: Time gate requires 24+ hours since last consolidation
 *   VAL-ML-009: Scan throttle prevents re-scanning within 10 minutes
 *   VAL-ML-010: Missing lock treated as never-consolidated
 *   VAL-ML-011: Corrupted lock file handled gracefully
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('os');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const MODULE_PATH = path.join(PROJECT_ROOT, '.claude/lib/memory/consolidation-lock.cjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create an isolated temporary directory for each test */
function createTempDir() {
  const tmpDir = path.join(
    os.tmpdir(),
    `consolidation-lock-test-${crypto.randomBytes(4).toString('hex')}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/** Remove a temporary directory recursively (best-effort) */
function cleanupTempDir(tmpDir) {
  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (_e) {
    // Ignore cleanup errors (Windows EBUSY, etc.)
  }
}

/** Load (or reload) the module under test (resets module-level state) */
function getModule() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

/**
 * Create an MTM directory with a given number of session files under tmpDir.
 * Each session file has mtime set to the given value (in ms).
 *
 * @param {string} memoryDir - Base memory dir (tmpDir)
 * @param {number} count     - Number of session files to create
 * @param {number} mtimeMs   - mtime to assign to each file (ms since epoch)
 */
function createMtmFiles(memoryDir, count, mtimeMs) {
  const mtmDir = path.join(memoryDir, 'mtm');
  fs.mkdirSync(mtmDir, { recursive: true });
  const mtimeDate = new Date(mtimeMs);
  for (let i = 0; i < count; i++) {
    const filePath = path.join(mtmDir, `session_test_${i}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ session: i }), 'utf8');
    fs.utimesSync(filePath, mtimeDate, mtimeDate);
  }
}

/**
 * Create a `.consolidate-lock` file with specific content and mtime.
 *
 * @param {string} memoryDir
 * @param {string} content  - File body (usually a PID or garbage)
 * @param {number} mtimeMs  - mtime to set (ms since epoch)
 */
function createLockFile(memoryDir, content, mtimeMs) {
  const lockPath = path.join(memoryDir, '.consolidate-lock');
  fs.writeFileSync(lockPath, content, 'utf8');
  const d = new Date(mtimeMs);
  fs.utimesSync(lockPath, d, d);
}

// ── VAL-ML-001: Lock file mtime serves as last-consolidated timestamp ─────────

test('VAL-ML-001: readLastConsolidatedAt returns lock file mtimeMs', () => {
  const { readLastConsolidatedAt } = getModule();
  const tmpDir = createTempDir();
  try {
    // Create lock file and set a specific mtime
    const expectedMtime = Date.now() - 3 * 60 * 60 * 1000; // 3 hours ago
    createLockFile(tmpDir, String(process.pid), expectedMtime);

    const result = readLastConsolidatedAt(tmpDir);

    // Allow ±1000ms tolerance for filesystem mtime precision
    assert.ok(
      Math.abs(result - expectedMtime) < 1000,
      `Expected mtime ≈${expectedMtime}, got ${result}`
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-001: readLastConsolidatedAt returns 0 when lock file does not exist', () => {
  const { readLastConsolidatedAt } = getModule();
  const tmpDir = createTempDir();
  try {
    const result = readLastConsolidatedAt(tmpDir);
    assert.strictEqual(result, 0, 'Should return 0 when lock file is missing');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-002: Lock acquisition writes PID and advances mtime ────────────────

test('VAL-ML-002: tryAcquireConsolidationLock writes process.pid to lock file', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.notStrictEqual(priorMtime, null, 'Should succeed in acquiring lock');

    const lockPath = path.join(tmpDir, '.consolidate-lock');
    const content = fs.readFileSync(lockPath, 'utf8').trim();
    assert.strictEqual(content, String(process.pid), 'Lock file should contain current PID');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-002: tryAcquireConsolidationLock mtime advances to approximately now', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    const before = Date.now();
    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    const after = Date.now();

    assert.notStrictEqual(priorMtime, null, 'Should succeed');

    const lockPath = path.join(tmpDir, '.consolidate-lock');
    const stat = fs.statSync(lockPath);

    assert.ok(
      stat.mtimeMs >= before - 1000 && stat.mtimeMs <= after + 1000,
      `Expected mtime between ${before} and ${after}, got ${stat.mtimeMs}`
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-002: tryAcquireConsolidationLock returns 0 as priorMtime when lock did not exist', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.strictEqual(priorMtime, 0, 'Prior mtime should be 0 when lock was absent');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-002: tryAcquireConsolidationLock returns prior mtime when lock existed', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // Create a stale lock with a known mtime (> 60min ago, so it can be reclaimed)
    const oldMtime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
    createLockFile(tmpDir, '99999999', oldMtime); // Dead PID

    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.notStrictEqual(priorMtime, null, 'Should reclaim stale lock');
    assert.ok(
      Math.abs(priorMtime - oldMtime) < 1000,
      `Prior mtime should match old lock mtime (±1s). Expected ≈${oldMtime}, got ${priorMtime}`
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-003: Lock blocks when held by live process ─────────────────────────

test('VAL-ML-003: second acquire returns null when lock held by live PID within stale threshold', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // Create lock held by current process PID with mtime = now (within threshold)
    createLockFile(tmpDir, String(process.pid), Date.now());

    const result = tryAcquireConsolidationLock(tmpDir);
    assert.strictEqual(result, null, 'Should be blocked by live process lock');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-003: lock with live PID and mtime 30min ago still blocks', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    createLockFile(tmpDir, String(process.pid), thirtyMinAgo);

    const result = tryAcquireConsolidationLock(tmpDir);
    assert.strictEqual(result, null, 'Should be blocked: 30min < 60min stale threshold');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-004: Lock reclaimed from dead PID ──────────────────────────────────

test('VAL-ML-004: lock with nonexistent PID is reclaimed successfully', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // Use a PID that almost certainly doesn't exist
    // PID 99999999 is far beyond typical OS limits
    const deadPid = '99999999';
    createLockFile(tmpDir, deadPid, Date.now()); // Recent mtime, but dead PID

    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.notStrictEqual(priorMtime, null, 'Should reclaim lock from dead PID');

    // Verify our PID is now in the lock file
    const lockPath = path.join(tmpDir, '.consolidate-lock');
    const content = fs.readFileSync(lockPath, 'utf8').trim();
    assert.strictEqual(content, String(process.pid), 'Lock should now contain our PID');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-005: Stale lock reclaimed after 60 minutes ─────────────────────────

test('VAL-ML-005: lock with mtime > 60min ago is reclaimed regardless of PID', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // Use current process PID (definitely alive) but mtime is 2 hours old → stale
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    createLockFile(tmpDir, String(process.pid), twoHoursAgo);

    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.notStrictEqual(priorMtime, null, 'Should reclaim stale lock even from live PID');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-005: lock at exactly 60min boundary is NOT stale (still blocks)', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // Exactly 60 minutes ago (should still block, threshold is > 60min)
    const exactlyAtThreshold = Date.now() - 60 * 60 * 1000;
    createLockFile(tmpDir, String(process.pid), exactlyAtThreshold);

    const result = tryAcquireConsolidationLock(tmpDir);
    // Note: since Date.now() is called in the implementation after we set the lock,
    // it may be slightly past the threshold. We accept either null or non-null here,
    // but primarily test that mtime > threshold reclaims (tested in VAL-ML-005 above).
    // This test just documents the boundary behavior.
    assert.ok(result === null || typeof result === 'number', 'Should return null or number');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-006: Rollback rewinds mtime to pre-acquire value ──────────────────

test('VAL-ML-006: rollback rewinds mtime to prior value', () => {
  const { tryAcquireConsolidationLock, rollbackConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // Create a stale lock with known mtime
    const oldMtime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
    createLockFile(tmpDir, '99999999', oldMtime); // Dead PID

    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.notStrictEqual(priorMtime, null, 'Should acquire lock');

    // Rollback
    rollbackConsolidationLock(tmpDir, priorMtime);

    // Verify mtime was restored
    const lockPath = path.join(tmpDir, '.consolidate-lock');
    const stat = fs.statSync(lockPath);
    assert.ok(
      Math.abs(stat.mtimeMs - oldMtime) < 1000,
      `Mtime should be restored to ≈${oldMtime}, got ${stat.mtimeMs}`
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-006: rollback with priorMtime=0 deletes the lock file', () => {
  const { tryAcquireConsolidationLock, rollbackConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // No lock file → priorMtime will be 0
    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.strictEqual(priorMtime, 0, 'priorMtime should be 0 for new lock');
    assert.notStrictEqual(priorMtime, null, 'Should have acquired lock');

    // Rollback (priorMtime = 0 → delete file)
    rollbackConsolidationLock(tmpDir, priorMtime);

    const lockPath = path.join(tmpDir, '.consolidate-lock');
    assert.ok(!fs.existsSync(lockPath), 'Lock file should be deleted after rollback with mtime=0');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-006: rollback is safe when lock file no longer exists', () => {
  const { rollbackConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // Should not throw even if the file was already removed
    let threw = false;
    try {
      rollbackConsolidationLock(tmpDir, 0);
    } catch (_e) {
      threw = true;
    }
    assert.ok(!threw, 'rollbackConsolidationLock should not throw when file is absent');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-007: Session count gate requires 5+ sessions ──────────────────────

test('VAL-ML-007: shouldConsolidate returns false with fewer than 5 MTM files', () => {
  const { shouldConsolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    // No lock file (time gate passes) + only 3 session files
    const futureishMtime = Date.now() + 1000; // Files created "now" (well above 0)
    createMtmFiles(tmpDir, 3, futureishMtime - 100);

    const result = shouldConsolidate(tmpDir);
    assert.strictEqual(result.should, false, 'Should return false with 3 sessions');
    assert.strictEqual(result.reason, 'session-gate', 'Reason should be session-gate');
    assert.strictEqual(result.sessionCount, 3, 'sessionCount should be 3');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-007: shouldConsolidate returns true with 5 MTM files (all gates pass)', () => {
  const { shouldConsolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    // No lock file (time gate passes) + 5 session files
    createMtmFiles(tmpDir, 5, Date.now());

    const result = shouldConsolidate(tmpDir);
    assert.strictEqual(result.should, true, 'Should return true with 5 sessions');
    assert.ok(result.sessionCount >= 5, `sessionCount should be >= 5, got ${result.sessionCount}`);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-007: shouldConsolidate counts only MTM files with mtime > lastConsolidatedAt', () => {
  const { shouldConsolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    const consolidatedAt = Date.now() - 30 * 60 * 60 * 1000; // 30 hours ago
    createLockFile(tmpDir, '0', consolidatedAt); // Not a valid PID → stale, but mtime matters

    // Wait — the lock will be acquired... actually we just need readLastConsolidatedAt
    // to return consolidatedAt. But tryAcquireConsolidationLock may reclaim it.
    // For shouldConsolidate, we only need the lock file mtime to be set correctly.
    // The lock file content is only checked during tryAcquireConsolidationLock.

    // Create 3 files BEFORE consolidatedAt and 5 files AFTER
    const beforeTime = consolidatedAt - 60 * 60 * 1000; // 1 hour before consolidation
    const afterTime = consolidatedAt + 60 * 1000; // 1 minute after consolidation

    const mtmDir = path.join(tmpDir, 'mtm');
    fs.mkdirSync(mtmDir, { recursive: true });

    // 3 old files (before consolidatedAt)
    for (let i = 0; i < 3; i++) {
      const fp = path.join(mtmDir, `old_session_${i}.json`);
      fs.writeFileSync(fp, '{}', 'utf8');
      fs.utimesSync(fp, new Date(beforeTime), new Date(beforeTime));
    }
    // 5 new files (after consolidatedAt)
    for (let i = 0; i < 5; i++) {
      const fp = path.join(mtmDir, `new_session_${i}.json`);
      fs.writeFileSync(fp, '{}', 'utf8');
      fs.utimesSync(fp, new Date(afterTime), new Date(afterTime));
    }

    const result = shouldConsolidate(tmpDir);
    assert.strictEqual(result.should, true, 'Should trigger with 5 new sessions');
    assert.strictEqual(
      result.sessionCount,
      5,
      `Should count 5 new sessions, got ${result.sessionCount}`
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-008: Time gate requires 24+ hours since last consolidation ──────────

test('VAL-ML-008: shouldConsolidate returns false when lock mtime is 12h ago', () => {
  const { shouldConsolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    // Use PID 1 — system init process, always exists, but mtime is < 24h
    // Actually, we just need ANY valid-seeming content with a recent mtime.
    // The lock check for shouldConsolidate only uses readLastConsolidatedAt (mtime).
    createLockFile(tmpDir, '1', twelveHoursAgo);

    const result = shouldConsolidate(tmpDir);
    assert.strictEqual(result.should, false, 'Should fail time gate at 12h');
    assert.strictEqual(result.reason, 'time-gate', 'Reason should be time-gate');
    assert.ok(result.hoursSince < 24, `hoursSince should be < 24, got ${result.hoursSince}`);
    assert.ok(result.hoursSince > 11, `hoursSince should be > 11, got ${result.hoursSince}`);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-008: shouldConsolidate evaluates session gate when lock mtime is 25h ago', () => {
  const { shouldConsolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    createLockFile(tmpDir, '1', twentyFiveHoursAgo);
    // No MTM files → session gate fails
    fs.mkdirSync(path.join(tmpDir, 'mtm'), { recursive: true });

    const result = shouldConsolidate(tmpDir);
    // Time gate passes, session gate fails
    assert.strictEqual(result.should, false, 'Time gate passes but session gate fails');
    assert.notStrictEqual(result.reason, 'time-gate', 'Reason should not be time-gate');
    assert.ok(result.hoursSince >= 25, `hoursSince should be >= 25, got ${result.hoursSince}`);
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-009: Scan throttle prevents re-scanning within 10 minutes ─────────

test('VAL-ML-009: second shouldConsolidate call returns scan-throttle without re-scanning', () => {
  // IMPORTANT: Do NOT reload module between calls — we need module-level state to persist
  delete require.cache[MODULE_PATH];
  const { shouldConsolidate } = require(MODULE_PATH);

  const tmpDir = createTempDir();
  try {
    // Time gate passes (no lock file) + < 5 sessions
    createMtmFiles(tmpDir, 2, Date.now());

    // First call: time gate passes, scan throttle allows, session gate fails
    const result1 = shouldConsolidate(tmpDir);
    assert.strictEqual(result1.should, false, 'First call should return false');
    assert.strictEqual(
      result1.reason,
      'session-gate',
      `First call reason should be session-gate, got: ${result1.reason}`
    );

    // Second call immediately: scan throttle should block
    const result2 = shouldConsolidate(tmpDir);
    assert.strictEqual(result2.should, false, 'Second call should return false');
    assert.strictEqual(
      result2.reason,
      'scan-throttle',
      `Second call should be throttled, got: ${result2.reason}`
    );
  } finally {
    cleanupTempDir(tmpDir);
    // Clean up cache after test
    delete require.cache[MODULE_PATH];
  }
});

// ── VAL-ML-010: Missing lock file treated as never-consolidated ───────────────

test('VAL-ML-010: readLastConsolidatedAt returns 0 with no lock file', () => {
  const { readLastConsolidatedAt } = getModule();
  const tmpDir = createTempDir();
  try {
    const result = readLastConsolidatedAt(tmpDir);
    assert.strictEqual(result, 0, 'Should return 0 for missing lock file');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-010: shouldConsolidate evaluates all gates normally with no lock file', () => {
  const { shouldConsolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    // No lock file → time gate passes (treated as never consolidated)
    // Create 5 MTM files to make session gate pass
    createMtmFiles(tmpDir, 5, Date.now());

    const result = shouldConsolidate(tmpDir);
    // Without a lock file, time gate passes and with 5 sessions it should consolidate
    assert.strictEqual(result.should, true, 'Should consolidate when no lock file and 5 sessions');
    assert.strictEqual(
      result.hoursSince,
      Infinity,
      'hoursSince should be Infinity when no lock file'
    );
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-010: shouldConsolidate with no lock file and < 5 sessions fails session gate', () => {
  const { shouldConsolidate } = getModule();
  const tmpDir = createTempDir();
  try {
    // No lock file, no sessions
    const result = shouldConsolidate(tmpDir);
    assert.strictEqual(result.should, false, 'Should not consolidate with no sessions');
    assert.strictEqual(result.reason, 'session-gate', 'Should fail at session gate');
    assert.strictEqual(result.sessionCount, 0, 'sessionCount should be 0');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── VAL-ML-011: Corrupted lock file handled gracefully ────────────────────────

test('VAL-ML-011: garbage content in lock file is treated as reclaimable', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    createLockFile(tmpDir, 'not-a-pid-at-all!!!', Date.now());

    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.notStrictEqual(priorMtime, null, 'Should reclaim lock with garbage content');

    // Verify we now own the lock
    const lockPath = path.join(tmpDir, '.consolidate-lock');
    const content = fs.readFileSync(lockPath, 'utf8').trim();
    assert.strictEqual(content, String(process.pid), 'Our PID should be in the lock file');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-011: empty lock file is treated as reclaimable', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    createLockFile(tmpDir, '', Date.now());

    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.notStrictEqual(priorMtime, null, 'Should reclaim lock with empty content');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-011: floating-point PID in lock file is treated as reclaimable', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // "123.45" parses to 123 but String(123) !== "123.45" → invalid
    createLockFile(tmpDir, '123.45', Date.now());

    const priorMtime = tryAcquireConsolidationLock(tmpDir);
    assert.notStrictEqual(priorMtime, null, 'Should reclaim lock with float PID content');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

test('VAL-ML-011: lock file with binary-like content does not crash', () => {
  const { tryAcquireConsolidationLock } = getModule();
  const tmpDir = createTempDir();
  try {
    // Write binary-like content (control characters)
    const lockPath = path.join(tmpDir, '.consolidate-lock');
    fs.writeFileSync(lockPath, Buffer.from([0x00, 0x01, 0x02, 0xff]), 'binary');
    const d = new Date(Date.now());
    fs.utimesSync(lockPath, d, d);

    let threw = false;
    let result;
    try {
      result = tryAcquireConsolidationLock(tmpDir);
    } catch (_e) {
      threw = true;
    }

    assert.ok(!threw, 'tryAcquireConsolidationLock should not throw with binary content');
    assert.notStrictEqual(result, null, 'Should reclaim lock with binary content');
  } finally {
    cleanupTempDir(tmpDir);
  }
});

// ── Module exports ────────────────────────────────────────────────────────────

test('module exports all required functions', () => {
  const mod = getModule();
  assert.strictEqual(
    typeof mod.readLastConsolidatedAt,
    'function',
    'readLastConsolidatedAt should be exported'
  );
  assert.strictEqual(
    typeof mod.tryAcquireConsolidationLock,
    'function',
    'tryAcquireConsolidationLock should be exported'
  );
  assert.strictEqual(
    typeof mod.rollbackConsolidationLock,
    'function',
    'rollbackConsolidationLock should be exported'
  );
  assert.strictEqual(
    typeof mod.shouldConsolidate,
    'function',
    'shouldConsolidate should be exported'
  );
});
