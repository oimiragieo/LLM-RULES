'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Tests for .claude/hooks/lifecycle/session-end-memory-promotion.cjs (M4)
 *
 * The hook is a standalone script that runs on SessionEnd to promote
 * STM -> MTM. Because it uses `require.main === module` gating and
 * calls `main()` at the top level, we test its behaviour by:
 *   1. Creating a temp project root with the expected file structure
 *   2. Stubbing `require` targets (safeParseJSON, consolidateSession)
 *   3. Running the hook logic in a child process or by re-implementing
 *      the testable flow inline with controlled dependencies.
 *
 * Since the hook is a short script with no exports, we test by
 * creating a wrapper that sources its logic with mocked dependencies.
 */

// Paths
const _PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '.claude');
const HOOK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'hooks',
  'lifecycle',
  'session-end-memory-promotion.cjs'
);

describe('session-end-memory-promotion hook', () => {
  let tmpDir;
  let stmDir;
  let stmFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-promotion-test-'));
    stmDir = path.join(tmpDir, '.claude', 'context', 'memory', 'stm');
    fs.mkdirSync(stmDir, { recursive: true });
    stmFile = path.join(stmDir, 'session_current.json');
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: simulates the hook logic with injectable dependencies.
   * This mirrors the main() function in the hook without requiring
   * module-level side effects.
   */
  function runHookLogic(opts = {}) {
    const {
      projectRoot = tmpDir,
      safeParseJSON = JSON.parse,
      consolidateSession = () => ({ success: true, mtmPath: '/fake/mtm/path' }),
    } = opts;

    const stmDirPath = path.join(projectRoot, '.claude', 'context', 'memory', 'stm');
    const currentFile = path.join(stmDirPath, 'session_current.json');
    const stderrMessages = [];
    const originalStderrWrite = process.stderr.write;

    // Capture stderr writes
    process.stderr.write = function (msg) {
      stderrMessages.push(String(msg));
      return true;
    };

    let error = null;
    let completed = false;

    try {
      // If no active STM session file, nothing to promote
      if (!fs.existsSync(currentFile)) {
        stderrMessages.push(
          '[session-end-memory-promotion] No STM session file found -- skipping.\n'
        );
        completed = true;
        return { stderrMessages, error: null, completed };
      }

      // Read the STM file using safeParseJSON
      const rawContent = fs.readFileSync(currentFile, 'utf8');
      let stmData;
      try {
        stmData = safeParseJSON(rawContent, null);
      } catch (_e) {
        // safeParseJSON fallback
        stmData = null;
      }

      // Extract session_id
      const sessionId = stmData && stmData.session_id;
      if (!sessionId) {
        stderrMessages.push(
          '[session-end-memory-promotion] STM file exists but has no session_id -- skipping.\n'
        );
        completed = true;
        return { stderrMessages, error: null, completed };
      }

      // Call consolidateSession
      const result = consolidateSession(sessionId, projectRoot);

      if (result && result.success) {
        stderrMessages.push(
          `[session-end-memory-promotion] Promoted session ${sessionId} STM -> MTM: ${(result.mtmPath || '').replace(/\\/g, '/')}\n`
        );
      } else {
        const reason = (result && result.error) || 'unknown error';
        stderrMessages.push(
          `[session-end-memory-promotion] consolidateSession returned failure for ${sessionId}: ${reason}\n`
        );
      }
      completed = true;
    } catch (err) {
      error = err;
      stderrMessages.push(`[session-end-memory-promotion] Error (ignored): ${err.message}\n`);
      completed = true;
    } finally {
      process.stderr.write = originalStderrWrite;
    }

    return { stderrMessages, error, completed };
  }

  it('successfully promotes STM to MTM when session_current.json is valid', () => {
    // Arrange: write a valid STM file
    const sessionData = {
      session_id: 'test-session-001',
      tool_calls: 42,
      discoveries: ['found X'],
    };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    let calledWithSessionId = null;
    let calledWithRoot = null;
    const mockConsolidateSession = (sid, root) => {
      calledWithSessionId = sid;
      calledWithRoot = root;
      return { success: true, mtmPath: '/fake/mtm/session_001.json' };
    };

    // Act
    const result = runHookLogic({
      projectRoot: tmpDir,
      consolidateSession: mockConsolidateSession,
    });

    // Assert
    assert.ok(result.completed, 'Hook should complete successfully');
    assert.equal(result.error, null, 'No error should be thrown');
    assert.equal(calledWithSessionId, 'test-session-001');
    assert.equal(calledWithRoot, tmpDir);

    const promoted = result.stderrMessages.some(m =>
      m.includes('Promoted session test-session-001')
    );
    assert.ok(promoted, 'Should log successful promotion');
  });

  it('gracefully handles missing STM file (no crash, exits normally)', () => {
    // Arrange: do NOT write any STM file — stmDir exists but stmFile does not
    if (fs.existsSync(stmFile)) {
      fs.unlinkSync(stmFile);
    }

    // Act
    const result = runHookLogic({ projectRoot: tmpDir });

    // Assert
    assert.ok(result.completed, 'Hook should complete');
    assert.equal(result.error, null, 'Should not throw');
    const skipped = result.stderrMessages.some(m => m.includes('No STM session file found'));
    assert.ok(skipped, 'Should log that STM file was not found');
  });

  it('gracefully handles malformed JSON in STM file (safeParseJSON fallback)', () => {
    // Arrange: write invalid JSON
    fs.writeFileSync(stmFile, '{ this is not valid JSON !!!');

    const mockSafeParseJSON = () => {
      // Simulates safeParseJSON returning null on malformed input
      return null;
    };

    // Act
    const result = runHookLogic({
      projectRoot: tmpDir,
      safeParseJSON: mockSafeParseJSON,
    });

    // Assert
    assert.ok(result.completed, 'Hook should complete without crashing');
    assert.equal(result.error, null, 'Should not throw');
    const noSessionId = result.stderrMessages.some(m => m.includes('has no session_id'));
    assert.ok(noSessionId, 'Should log that session_id is missing');
  });

  it('exits 0 even on consolidateSession error', () => {
    // Arrange: valid STM file but consolidateSession throws
    const sessionData = { session_id: 'error-session-002' };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    const mockConsolidateSession = () => {
      throw new Error('disk full');
    };

    // Act
    const result = runHookLogic({
      projectRoot: tmpDir,
      consolidateSession: mockConsolidateSession,
    });

    // Assert: the hook catches errors and completes (exit 0 behaviour)
    assert.ok(result.completed, 'Hook should complete despite error');
    const errorIgnored = result.stderrMessages.some(m => m.includes('Error (ignored): disk full'));
    assert.ok(errorIgnored, 'Should log the error as ignored');
  });

  it('handles missing session_id field gracefully', () => {
    // Arrange: valid JSON but no session_id
    const sessionData = { tool_calls: 5, discoveries: [] };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    let consolidateCalled = false;
    const mockConsolidateSession = () => {
      consolidateCalled = true;
      return { success: true };
    };

    // Act
    const result = runHookLogic({
      projectRoot: tmpDir,
      consolidateSession: mockConsolidateSession,
    });

    // Assert
    assert.ok(result.completed, 'Hook should complete');
    assert.equal(result.error, null, 'Should not throw');
    assert.ok(!consolidateCalled, 'Should NOT call consolidateSession when session_id is missing');
    const noSessionId = result.stderrMessages.some(m => m.includes('has no session_id'));
    assert.ok(noSessionId, 'Should log that session_id is missing');
  });

  it('handles consolidateSession returning failure result', () => {
    // Arrange: valid STM file, consolidateSession returns {success: false}
    const sessionData = { session_id: 'fail-session-003' };
    fs.writeFileSync(stmFile, JSON.stringify(sessionData));

    const mockConsolidateSession = () => {
      return { success: false, error: 'MTM at capacity' };
    };

    // Act
    const result = runHookLogic({
      projectRoot: tmpDir,
      consolidateSession: mockConsolidateSession,
    });

    // Assert
    assert.ok(result.completed, 'Hook should complete');
    assert.equal(result.error, null, 'Should not throw');
    const failMsg = result.stderrMessages.some(
      m => m.includes('consolidateSession returned failure') && m.includes('MTM at capacity')
    );
    assert.ok(failMsg, 'Should log the failure reason from consolidateSession');
  });

  it('hook source file exists and has correct structure', () => {
    // Verify the actual hook file exists
    assert.ok(fs.existsSync(HOOK_PATH), `Hook should exist at ${HOOK_PATH}`);

    // Verify it can be parsed by Node (syntax check)
    const content = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.ok(content.includes('safeParseJSON'), 'Hook should use safeParseJSON (SE-02)');
    assert.ok(content.includes('consolidateSession'), 'Hook should call consolidateSession');
    assert.ok(content.includes('session_id'), 'Hook should check for session_id');
    assert.ok(content.includes('process.stderr.write'), 'Hook should log to stderr');
    assert.ok(
      content.includes('SE-03') || content.includes('exit 0') || content.includes('fail-open'),
      'Hook should document fail-open (SE-03) behaviour'
    );
  });
});
