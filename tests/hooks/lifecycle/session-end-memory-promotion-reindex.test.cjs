'use strict';

/**
 * Tests for the LanceDB re-index trigger in
 * .claude/hooks/lifecycle/session-end-memory-promotion.cjs (M4 re-index branch)
 *
 * The hook calls child_process.spawn to kick off a background
 * generate-embeddings.cjs process ONLY when:
 *   1. consolidateSession() returned { success: true }
 *   2. LANCEDB_EMBEDDING_MODE !== 'off'
 *
 * Because the hook is a standalone script (no exports), we test the
 * re-index branch by reimplementing the critical path with injectable
 * stubs — exactly the same approach used in the sibling test file
 * session-end-memory-promotion.test.cjs.
 *
 * Test cases:
 *   1. Promotion triggers LanceDB re-index after successful consolidateSession()
 *   2. Re-index respects LANCEDB_EMBEDDING_MODE=off (skips when BM25-only)
 *   3. Re-index failure is logged to stderr but does not throw (fire-and-forget safety)
 *   4. Re-index is NOT triggered if consolidateSession() fails
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Helper: run the promotion hook logic with injectable stubs
// ---------------------------------------------------------------------------

/**
 * Mirrors the main() body of session-end-memory-promotion.cjs with
 * injectable stubs for all I/O and child-process operations so we can
 * assert re-index behaviour without touching the real filesystem or
 * spawning real processes.
 *
 * @param {object} opts
 * @param {string}   opts.projectRoot        - temp project root
 * @param {function} opts.safeParseJSON       - stub for safeParseJSON
 * @param {function} opts.consolidateSession  - stub for consolidateSession
 * @param {function} opts.spawn               - stub for child_process.spawn
 * @param {string}   opts.embeddingMode       - value of LANCEDB_EMBEDDING_MODE
 * @returns {{ stderrMessages: string[], spawnCalls: object[], error: null|Error }}
 */
function runHookLogicWithReindex(opts = {}) {
  const {
    projectRoot,
    safeParseJSON = JSON.parse,
    consolidateSession = () => ({ success: true, mtmPath: '/fake/mtm/path' }),
    spawn = () => ({ unref: () => {} }),
    embeddingMode = undefined, // undefined == env var not set
  } = opts;

  const stmDir = path.join(projectRoot, '.claude', 'context', 'memory', 'stm');
  const currentFile = path.join(stmDir, 'session_current.json');

  const stderrMessages = [];
  const spawnCalls = [];

  // Capture stderr
  const origWrite = process.stderr.write;
  process.stderr.write = function (msg) {
    stderrMessages.push(String(msg));
    return true;
  };

  // Capture LANCEDB_EMBEDDING_MODE
  const origEnvValue = process.env.LANCEDB_EMBEDDING_MODE;
  if (embeddingMode !== undefined) {
    process.env.LANCEDB_EMBEDDING_MODE = embeddingMode;
  } else {
    delete process.env.LANCEDB_EMBEDDING_MODE;
  }

  let error = null;

  try {
    // --- replicate main() logic ---

    if (!fs.existsSync(currentFile)) {
      stderrMessages.push('[session-end-memory-promotion] No STM session file found — skipping.\n');
      return { stderrMessages, spawnCalls, error: null };
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
      return { stderrMessages, spawnCalls, error: null };
    }

    const result = consolidateSession(sessionId, projectRoot);

    if (result && result.success) {
      stderrMessages.push(
        `[session-end-memory-promotion] Promoted session ${sessionId} STM -> MTM: ${(result.mtmPath || '').replace(/\\/g, '/')}\n`
      );

      // Re-index branch — mirrors the hook exactly
      if (process.env.LANCEDB_EMBEDDING_MODE !== 'off') {
        const child = spawn(
          'node',
          [
            path.join(projectRoot, '.claude', 'lib', 'code-indexing', 'generate-embeddings.cjs'),
            '--memory-only',
          ],
          { stdio: 'ignore', detached: true, shell: false }
        );
        spawnCalls.push({ cmd: 'node', args: ['generate-embeddings.cjs', '--memory-only'] });
        child.unref();
        stderrMessages.push(
          '[session-end-memory-promotion] Triggered background memory re-index.\n'
        );
      } else {
        stderrMessages.push(
          '[session-end-memory-promotion] Skipping re-index (LANCEDB_EMBEDDING_MODE=off).\n'
        );
      }
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
    // Restore env var
    if (origEnvValue === undefined) {
      delete process.env.LANCEDB_EMBEDDING_MODE;
    } else {
      process.env.LANCEDB_EMBEDDING_MODE = origEnvValue;
    }
  }

  return { stderrMessages, spawnCalls, error };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('session-end-memory-promotion — re-index trigger', () => {
  let tmpDir;
  let stmDir;
  let stmFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-reindex-test-'));
    stmDir = path.join(tmpDir, '.claude', 'context', 'memory', 'stm');
    fs.mkdirSync(stmDir, { recursive: true });
    stmFile = path.join(stmDir, 'session_current.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1: Promotion triggers re-index after successful consolidateSession()
  // -------------------------------------------------------------------------
  it('triggers background re-index after successful consolidateSession()', () => {
    // Arrange
    fs.writeFileSync(stmFile, JSON.stringify({ session_id: 'sess-reindex-001' }));

    const spawnedArgs = [];
    const mockSpawn = (_cmd, args, spawnOpts) => {
      spawnedArgs.push({ args, spawnOpts });
      return { unref: () => {} };
    };

    // Act — embedding mode not set (default = vectors enabled)
    const { stderrMessages, spawnCalls, error } = runHookLogicWithReindex({
      projectRoot: tmpDir,
      spawn: mockSpawn,
      embeddingMode: undefined,
    });

    // Assert: no error
    assert.equal(error, null, 'Hook should not throw');

    // Assert: spawn was called once
    assert.equal(spawnCalls.length, 1, 'spawn should be called exactly once for re-index');

    // Assert: spawn used shell: false (SE-01 compliance)
    assert.equal(
      spawnedArgs[0].spawnOpts.shell,
      false,
      'spawn must use shell: false (SE-01 security)'
    );

    // Assert: stdio: ignore and detached: true (fire-and-forget)
    assert.equal(spawnedArgs[0].spawnOpts.stdio, 'ignore', 'spawn should ignore stdio');
    assert.equal(spawnedArgs[0].spawnOpts.detached, true, 'spawn should be detached');

    // Assert: re-index log emitted
    const reindexLogged = stderrMessages.some(m =>
      m.includes('Triggered background memory re-index')
    );
    assert.ok(reindexLogged, 'Should log re-index trigger message');
  });

  // -------------------------------------------------------------------------
  // Test 2: Re-index skipped when LANCEDB_EMBEDDING_MODE=off (BM25-only mode)
  // -------------------------------------------------------------------------
  it('skips re-index when LANCEDB_EMBEDDING_MODE=off', () => {
    // Arrange
    fs.writeFileSync(stmFile, JSON.stringify({ session_id: 'sess-bm25-002' }));

    let spawnCalled = false;
    const mockSpawn = () => {
      spawnCalled = true;
      return { unref: () => {} };
    };

    // Act — explicitly set BM25-only mode
    const { stderrMessages, error } = runHookLogicWithReindex({
      projectRoot: tmpDir,
      spawn: mockSpawn,
      embeddingMode: 'off',
    });

    // Assert: no error
    assert.equal(error, null, 'Hook should not throw');

    // Assert: spawn NOT called
    assert.equal(spawnCalled, false, 'spawn must not be called when embedding mode is off');

    // Assert: skip log emitted
    const skipLogged = stderrMessages.some(m =>
      m.includes('Skipping re-index (LANCEDB_EMBEDDING_MODE=off)')
    );
    assert.ok(skipLogged, 'Should log that re-index was skipped due to embedding mode');

    // Assert: promotion success still logged
    const promoted = stderrMessages.some(m => m.includes('Promoted session sess-bm25-002'));
    assert.ok(promoted, 'Promotion log should appear even when re-index is skipped');
  });

  // -------------------------------------------------------------------------
  // Test 3: Re-index spawn failure does not throw (fire-and-forget safety)
  // -------------------------------------------------------------------------
  it('re-index spawn failure is handled — hook does not throw', () => {
    // Arrange
    fs.writeFileSync(stmFile, JSON.stringify({ session_id: 'sess-spawn-fail-003' }));

    // spawn throws synchronously (e.g., ENOENT on the node binary)
    const mockSpawn = () => {
      throw new Error('ENOENT: node binary not found');
    };

    let stderrMessages = [];
    let capturedError = null;

    // We need to run the hook with the throwing spawn — the hook body itself
    // should NOT propagate the spawn error because the production code wraps
    // the entire body in try/catch (SE-03 fail-open).
    // Our runHookLogicWithReindex also mirrors this: the try block catches
    // the spawn throw, so error should not propagate out.
    ({ stderrMessages, error: capturedError } = runHookLogicWithReindex({
      projectRoot: tmpDir,
      spawn: mockSpawn,
      embeddingMode: undefined,
    }));

    // Assert: hook catches the error (SE-03 fail-open)
    // The outer try/catch in the hook captures it and logs "Error (ignored)"
    const errorIgnored = stderrMessages.some(m => m.includes('Error (ignored)'));
    assert.ok(
      errorIgnored,
      'Spawn failure should be logged as "Error (ignored)" — hook must not propagate'
    );

    // The returned error field should be the caught exception (not rethrown)
    // but the hook itself should have exited cleanly (exit 0 semantics = no uncaught throw)
    // Our test harness captures the error in the `error` field — verify it was caught
    assert.ok(
      capturedError instanceof Error,
      'Error should be captured but not rethrown from hook logic'
    );
    assert.ok(
      capturedError.message.includes('ENOENT'),
      'Captured error should contain the spawn failure message'
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Re-index NOT triggered when consolidateSession() fails
  // -------------------------------------------------------------------------
  it('does NOT trigger re-index when consolidateSession() returns failure', () => {
    // Arrange
    fs.writeFileSync(stmFile, JSON.stringify({ session_id: 'sess-fail-004' }));

    let spawnCalled = false;
    const mockSpawn = () => {
      spawnCalled = true;
      return { unref: () => {} };
    };

    const mockConsolidateFailing = () => ({
      success: false,
      error: 'MTM directory not writable',
    });

    // Act
    const { stderrMessages, error } = runHookLogicWithReindex({
      projectRoot: tmpDir,
      spawn: mockSpawn,
      consolidateSession: mockConsolidateFailing,
      embeddingMode: undefined,
    });

    // Assert: no throw
    assert.equal(error, null, 'Hook should not throw when consolidate fails');

    // Assert: spawn NOT called — re-index should only fire on success
    assert.equal(spawnCalled, false, 'spawn must NOT be called when consolidateSession() fails');

    // Assert: failure reason logged
    const failMsg = stderrMessages.some(
      m =>
        m.includes('consolidateSession returned failure') &&
        m.includes('MTM directory not writable')
    );
    assert.ok(failMsg, 'Should log the failure reason from consolidateSession');

    // Assert: no re-index log
    const reindexLogged = stderrMessages.some(m =>
      m.includes('Triggered background memory re-index')
    );
    assert.equal(reindexLogged, false, 'Re-index log must NOT appear when consolidation failed');
  });

  // -------------------------------------------------------------------------
  // Structural: verify the actual hook file implements the guard
  // -------------------------------------------------------------------------
  it('hook source implements LANCEDB_EMBEDDING_MODE guard (structural check)', () => {
    const hookPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      '.claude',
      'hooks',
      'lifecycle',
      'session-end-memory-promotion.cjs'
    );
    assert.ok(fs.existsSync(hookPath), `Hook must exist at ${hookPath}`);

    const src = fs.readFileSync(hookPath, 'utf8');

    // Guard: skip re-index when LANCEDB_EMBEDDING_MODE=off
    assert.ok(
      src.includes("LANCEDB_EMBEDDING_MODE !== 'off'") ||
        src.includes("LANCEDB_EMBEDDING_MODE != 'off'"),
      "Hook must guard re-index on LANCEDB_EMBEDDING_MODE !== 'off'"
    );

    // Security: spawn must use shell: false (SE-01)
    assert.ok(
      src.includes('shell: false'),
      'Hook must spawn with shell: false (SE-01 injection prevention)'
    );

    // Fire-and-forget: child must be detached and unref'd
    assert.ok(src.includes('detached: true'), 'Spawn options must include detached: true');
    assert.ok(src.includes('child.unref()'), 'child.unref() must be called to avoid blocking');
  });
});
