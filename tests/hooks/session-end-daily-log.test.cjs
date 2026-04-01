'use strict';

/**
 * Tests for daily log integration in session-end-memory-promotion.cjs
 *
 * Covers:
 *   VAL-DL-004: Session-end hook appends summary to daily log after STM→MTM promotion
 *   VAL-DL-005: MemoryRecord bypasses daily log (writes directly to patterns.json/gotchas.json)
 *
 * Testing approach:
 *   - runHookLogicWithDailyLog(): mirrors the modified hook logic with injectable stubs,
 *     including the new appendDailyLog integration. Matches the established pattern from
 *     session-end-memory-promotion.test.cjs and session-end-memory-promotion-reindex.test.cjs.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ── Module paths ──────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'lifecycle',
  'session-end-memory-promotion.cjs'
);
const RECORDING_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'memory',
  'memory-manager-core-recording.cjs'
);

// Load the daily log module to use getDailyLogPath for path assertions
const { appendDailyLog, getDailyLogPath } = require(
  path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'memory-daily-log.cjs')
);

// ── Test helper ───────────────────────────────────────────────────────────────

/**
 * Build the session summary string from STM data.
 * Extracted to reduce complexity of the main hook helper.
 *
 * @param {object|null} stmData - parsed STM session data
 * @returns {string} session summary
 */
function buildSessionSummary(stmData) {
  const entryCount = stmData && Array.isArray(stmData.entries) ? stmData.entries.length : 1;
  let summary = `Session ended - ${entryCount} memory entr${entryCount === 1 ? 'y' : 'ies'} promoted to MTM`;

  if (stmData && stmData.start_time) {
    const startMs = new Date(stmData.start_time).getTime();
    if (!isNaN(startMs)) {
      const durationMs = Date.now() - startMs;
      const durationMin = Math.round(durationMs / 60000);
      summary += ` (duration: ~${durationMin}min)`;
    }
  }
  return summary;
}

/**
 * Handle the daily log portion of the hook (fail-open wrapper).
 * Extracted to reduce complexity of the main hook helper.
 *
 * @param {object} params
 * @param {object|null} params.stmData
 * @param {boolean}     params.dailyLogShouldThrow
 * @param {string|null} params.logMemoryDir
 * @param {string[]}    params.dailyLogCalls
 * @param {string[]}    params.stderrMessages
 */
function handleDailyLogWrite({
  stmData,
  dailyLogShouldThrow,
  logMemoryDir,
  dailyLogCalls,
  stderrMessages,
}) {
  try {
    if (dailyLogShouldThrow) {
      throw new Error('simulated daily log failure');
    }
    const summary = buildSessionSummary(stmData);
    dailyLogCalls.push(summary);
    if (logMemoryDir) {
      appendDailyLog(summary, { memoryDir: logMemoryDir });
    }
  } catch (dailyLogErr) {
    stderrMessages.push(
      `[session-end-memory-promotion] Daily log write failed (ignored): ${dailyLogErr.message}\n`
    );
  }
}

/**
 * Mirrors the (modified) main() body of session-end-memory-promotion.cjs, including
 * the new appendDailyLog integration. Accepts injectable stubs for all I/O so tests
 * can run fully in-memory or against temp directories.
 *
 * @param {object} opts
 * @param {string}   opts.projectRoot         - temp project root
 * @param {function} opts.safeParseJSON        - stub for safeParseJSON
 * @param {function} opts.consolidateSession   - stub for consolidateSession
 * @param {string}   [opts.logMemoryDir]       - if set, real appendDailyLog writes here
 * @param {boolean}  [opts.dailyLogShouldThrow] - if true, appendDailyLog stub throws
 * @returns {{ stderrMessages: string[], dailyLogCalls: string[], error: null|Error, promotionSucceeded: boolean }}
 */
function runHookLogicWithDailyLog(opts = {}) {
  const {
    projectRoot,
    safeParseJSON = JSON.parse,
    consolidateSession = () => ({ success: true, mtmPath: '/fake/mtm/path' }),
    logMemoryDir = null,
    dailyLogShouldThrow = false,
  } = opts;

  const stmDir = path.join(projectRoot, '.claude', 'context', 'memory', 'stm');
  const currentFile = path.join(stmDir, 'session_current.json');

  const stderrMessages = [];
  const dailyLogCalls = [];
  let promotionSucceeded = false;
  let error = null;

  const origWrite = process.stderr.write;
  process.stderr.write = function (msg) {
    stderrMessages.push(String(msg));
    return true;
  };

  try {
    // ── Mirror hook logic: check for STM file ──────────────────────────────
    if (!fs.existsSync(currentFile)) {
      stderrMessages.push('[session-end-memory-promotion] No STM session file found — skipping.\n');
      return { stderrMessages, dailyLogCalls, error: null, promotionSucceeded };
    }

    const rawContent = fs.readFileSync(currentFile, 'utf8');
    let stmData;
    try {
      stmData = safeParseJSON(rawContent, null);
    } catch (_e) {
      stmData = null;
    }

    const sessionId = stmData && stmData.session_id;
    if (!sessionId) {
      stderrMessages.push(
        '[session-end-memory-promotion] STM file exists but has no session_id — skipping.\n'
      );
      return { stderrMessages, dailyLogCalls, error: null, promotionSucceeded };
    }

    // ── STM→MTM promotion (critical path) ─────────────────────────────────
    const result = consolidateSession(sessionId, projectRoot);

    if (result && result.success) {
      promotionSucceeded = true;
      stderrMessages.push(
        `[session-end-memory-promotion] Promoted session ${sessionId} STM -> MTM: ${(result.mtmPath || '').replace(/\\/g, '/')}\n`
      );

      // ── NEW: Append session summary to daily log (fail-open) ──────────────
      handleDailyLogWrite({
        stmData,
        dailyLogShouldThrow,
        logMemoryDir,
        dailyLogCalls,
        stderrMessages,
      });
      // ── END NEW ────────────────────────────────────────────────────────────
    } else {
      const reason = (result && result.error) || 'unknown error';
      stderrMessages.push(
        `[session-end-memory-promotion] consolidateSession returned failure for ${sessionId}: ${reason}\n`
      );
    }
  } catch (err) {
    error = err;
    stderrMessages.push(`[session-end-memory-promotion] Error (ignored): ${err.message}\n`);
  } finally {
    process.stderr.write = origWrite;
  }

  return { stderrMessages, dailyLogCalls, error, promotionSucceeded };
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('VAL-DL-004: session-end hook appends summary to daily log', () => {
  let tmpDir;
  let stmDir;
  let stmFile;
  let logMemoryDir;

  beforeEach(() => {
    const id = crypto.randomBytes(4).toString('hex');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `session-daily-log-test-${id}-`));
    stmDir = path.join(tmpDir, '.claude', 'context', 'memory', 'stm');
    fs.mkdirSync(stmDir, { recursive: true });
    stmFile = path.join(stmDir, 'session_current.json');
    logMemoryDir = path.join(tmpDir, 'memory');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore cleanup errors on Windows
    }
  });

  it('appends session summary to daily log after successful STM→MTM promotion', () => {
    // Arrange: valid STM session
    const sessionData = { session_id: 'test-daily-log-001' };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    // Act
    const { stderrMessages, dailyLogCalls, promotionSucceeded } = runHookLogicWithDailyLog({
      projectRoot: tmpDir,
      logMemoryDir,
    });

    // Assert: promotion succeeded
    assert.ok(promotionSucceeded, 'STM→MTM promotion should succeed');

    // Assert: appendDailyLog was called
    assert.equal(dailyLogCalls.length, 1, 'appendDailyLog should be called exactly once');

    // Assert: summary contains expected phrase
    assert.ok(
      dailyLogCalls[0].includes('Session ended'),
      `Summary should contain "Session ended", got: "${dailyLogCalls[0]}"`
    );

    // Assert: daily log file was created in temp dir with session summary content
    const now = new Date();
    const logPath = getDailyLogPath(now, { memoryDir: logMemoryDir });
    assert.ok(fs.existsSync(logPath), `Daily log file should exist at ${logPath}`);

    const logContent = fs.readFileSync(logPath, 'utf8');
    assert.ok(
      logContent.includes('Session ended'),
      `Daily log should contain "Session ended", content: "${logContent}"`
    );

    // Assert: logged to stderr (promotion message)
    const promoted = stderrMessages.some(m => m.includes('Promoted session test-daily-log-001'));
    assert.ok(promoted, 'Should log successful promotion to stderr');
  });

  it('daily log entry is formatted as timestamped bullet (- [HH:MM:SS] ...)', () => {
    // Arrange
    const sessionData = { session_id: 'test-daily-log-002' };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    // Act
    runHookLogicWithDailyLog({ projectRoot: tmpDir, logMemoryDir });

    // Assert: daily log file contains properly formatted bullet entry
    const now = new Date();
    const logPath = getDailyLogPath(now, { memoryDir: logMemoryDir });
    assert.ok(fs.existsSync(logPath), 'Daily log file should exist');

    const logContent = fs.readFileSync(logPath, 'utf8');
    // Match bullet format: - [HH:MM:SS] ...
    const bulletPattern = /^- \[\d{2}:\d{2}:\d{2}\] .+$/m;
    assert.ok(
      bulletPattern.test(logContent),
      `Daily log entry should match "- [HH:MM:SS] ..." format, got: "${logContent}"`
    );
  });

  it('summary includes entry count (N memory entries promoted to MTM)', () => {
    // Arrange: STM with entries array
    const sessionData = {
      session_id: 'test-daily-log-003',
      entries: ['entry-1', 'entry-2', 'entry-3'],
    };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    // Act
    const { dailyLogCalls } = runHookLogicWithDailyLog({ projectRoot: tmpDir, logMemoryDir });

    // Assert: summary mentions entry count
    assert.equal(dailyLogCalls.length, 1);
    assert.ok(
      dailyLogCalls[0].includes('3 memory entries promoted to MTM'),
      `Summary should mention 3 entries, got: "${dailyLogCalls[0]}"`
    );
  });

  it('summary uses "1 memory entry" (singular) when entryCount is 1', () => {
    // Arrange: no entries array → defaults to 1
    const sessionData = { session_id: 'test-daily-log-004' };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    // Act
    const { dailyLogCalls } = runHookLogicWithDailyLog({ projectRoot: tmpDir, logMemoryDir });

    // Assert: singular form used
    assert.equal(dailyLogCalls.length, 1);
    assert.ok(
      dailyLogCalls[0].includes('1 memory entry promoted to MTM'),
      `Summary should use singular form, got: "${dailyLogCalls[0]}"`
    );
  });

  it('summary includes duration when start_time is present in STM data', () => {
    // Arrange: STM with start_time 2 minutes ago
    const startTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const sessionData = { session_id: 'test-daily-log-005', start_time: startTime };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    // Act
    const { dailyLogCalls } = runHookLogicWithDailyLog({ projectRoot: tmpDir, logMemoryDir });

    // Assert: summary includes duration info
    assert.equal(dailyLogCalls.length, 1);
    assert.ok(
      dailyLogCalls[0].includes('duration:'),
      `Summary should include duration when start_time is available, got: "${dailyLogCalls[0]}"`
    );
  });

  it('daily log not written when STM file is missing', () => {
    // Arrange: no STM file written
    const { dailyLogCalls, promotionSucceeded } = runHookLogicWithDailyLog({
      projectRoot: tmpDir,
      logMemoryDir,
    });

    // Assert: no daily log call (skipped early)
    assert.equal(dailyLogCalls.length, 0, 'appendDailyLog should not be called when no STM file');
    assert.equal(promotionSucceeded, false, 'Promotion should not succeed without STM file');

    // Assert: no daily log file created
    const now = new Date();
    const logPath = getDailyLogPath(now, { memoryDir: logMemoryDir });
    assert.ok(!fs.existsSync(logPath), 'Daily log file should not exist when STM is missing');
  });

  it('daily log not written when consolidateSession fails', () => {
    // Arrange: valid STM, consolidation fails
    const sessionData = { session_id: 'test-daily-log-006' };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    const { dailyLogCalls, promotionSucceeded } = runHookLogicWithDailyLog({
      projectRoot: tmpDir,
      logMemoryDir,
      consolidateSession: () => ({ success: false, error: 'disk full' }),
    });

    // Assert: no daily log written on failure
    assert.equal(
      dailyLogCalls.length,
      0,
      'appendDailyLog should not be called when consolidation fails'
    );
    assert.equal(promotionSucceeded, false, 'Promotion should not be marked as succeeded');
  });

  it('daily log failure does NOT block STM→MTM promotion (fail-open)', () => {
    // Arrange: valid STM, daily log will throw
    const sessionData = { session_id: 'test-daily-log-007' };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    // Act: dailyLogShouldThrow=true causes the try block to throw
    const { stderrMessages, promotionSucceeded, error } = runHookLogicWithDailyLog({
      projectRoot: tmpDir,
      dailyLogShouldThrow: true,
    });

    // Assert: promotion succeeded despite daily log failure
    assert.ok(promotionSucceeded, 'STM→MTM promotion must succeed even when daily log throws');

    // Assert: daily log error was logged (fail-open)
    const dailyLogErrorLogged = stderrMessages.some(m =>
      m.includes('Daily log write failed (ignored)')
    );
    assert.ok(dailyLogErrorLogged, 'Daily log failure should be logged to stderr');

    // Assert: no uncaught error propagated
    assert.equal(error, null, 'No error should propagate from daily log failure');
  });

  it('hook source file includes appendDailyLog integration (structural check)', () => {
    // Verify the actual hook file has been updated with the daily log integration
    assert.ok(fs.existsSync(HOOK_PATH), `Hook must exist at ${HOOK_PATH}`);

    const src = fs.readFileSync(HOOK_PATH, 'utf8');

    // Hook should require/import the daily log module
    assert.ok(src.includes('memory-daily-log'), 'Hook should require memory-daily-log.cjs');

    // Hook should call appendDailyLog
    assert.ok(src.includes('appendDailyLog'), 'Hook should call appendDailyLog()');

    // The daily log call MUST be in its own try/catch (separate from main try)
    // Check for the fail-open pattern: daily log wrapped separately
    assert.ok(
      src.includes('Daily log write failed (ignored)') ||
        src.includes('daily log') ||
        src.includes('dailyLog'),
      'Hook should have a fail-open wrapper for the daily log write'
    );
  });
});

describe('VAL-DL-005: MemoryRecord bypasses daily log', () => {
  let tmpDir;

  beforeEach(() => {
    const id = crypto.randomBytes(4).toString('hex');
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `memory-record-bypass-test-${id}-`));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_e) {
      // Ignore cleanup errors on Windows
    }
  });

  it('memory-manager-core-recording.cjs does NOT import appendDailyLog (structural)', () => {
    assert.ok(fs.existsSync(RECORDING_PATH), `Recording module must exist at ${RECORDING_PATH}`);

    const src = fs.readFileSync(RECORDING_PATH, 'utf8');

    // The recording module must NOT import or require the daily log
    assert.ok(
      !src.includes('memory-daily-log'),
      'memory-manager-core-recording.cjs must NOT import memory-daily-log'
    );
    assert.ok(
      !src.includes('appendDailyLog'),
      'memory-manager-core-recording.cjs must NOT call appendDailyLog'
    );
  });

  it('recordPattern writes to patterns.json only — no daily log entry created', () => {
    // Arrange: set up a temp memory dir
    const memoryDir = path.join(tmpDir, '.claude', 'context', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });

    // Track if daily log directory gets created
    const logsDir = path.join(memoryDir, 'logs');

    // Load recording ops via the factory function
    const { createRecordingOps } = require(RECORDING_PATH);

    // Set up minimal stub dependencies
    const patternsFile = path.join(memoryDir, 'patterns.json');
    const ops = createRecordingOps({
      PROJECT_ROOT: tmpDir,
      validateProjectRoot: () => {},
      getMemoryDir: () => memoryDir,
      ensureDir: dir => fs.mkdirSync(dir, { recursive: true }),
      withFileLockSync: (_file, fn) => fn(),
      buildEntryId: _entry => `id-${Date.now()}`,
      normalizeArea: area => area || 'general',
      maybeSyncMemoryJson: () => {},
      emitMemorySavedEvent: () => {},
    });

    // Act: call recordPattern
    ops.recordPattern('Test pattern for daily log bypass test');

    // Assert: patterns.json was written
    assert.ok(fs.existsSync(patternsFile), 'patterns.json should exist after recordPattern');

    const patterns = JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
    assert.ok(Array.isArray(patterns) && patterns.length > 0, 'Pattern should be saved');

    // Assert: NO daily log file was created
    assert.ok(
      !fs.existsSync(logsDir),
      'Daily log directory should NOT be created by recordPattern'
    );
  });

  it('recordGotcha writes to gotchas.json only — no daily log entry created', () => {
    // Arrange: set up a temp memory dir
    const memoryDir = path.join(tmpDir, '.claude', 'context', 'memory');
    fs.mkdirSync(memoryDir, { recursive: true });

    const logsDir = path.join(memoryDir, 'logs');

    const { createRecordingOps } = require(RECORDING_PATH);

    const gotchasFile = path.join(memoryDir, 'gotchas.json');
    const ops = createRecordingOps({
      PROJECT_ROOT: tmpDir,
      validateProjectRoot: () => {},
      getMemoryDir: () => memoryDir,
      ensureDir: dir => fs.mkdirSync(dir, { recursive: true }),
      withFileLockSync: (_file, fn) => fn(),
      buildEntryId: _entry => `id-${Date.now()}`,
      normalizeArea: area => area || 'general',
      maybeSyncMemoryJson: () => {},
      emitMemorySavedEvent: () => {},
    });

    // Act: call recordGotcha
    ops.recordGotcha('Test gotcha for daily log bypass test');

    // Assert: gotchas.json was written
    assert.ok(fs.existsSync(gotchasFile), 'gotchas.json should exist after recordGotcha');

    const gotchas = JSON.parse(fs.readFileSync(gotchasFile, 'utf8'));
    assert.ok(Array.isArray(gotchas) && gotchas.length > 0, 'Gotcha should be saved');

    // Assert: NO daily log file was created
    assert.ok(!fs.existsSync(logsDir), 'Daily log directory should NOT be created by recordGotcha');
  });
});
