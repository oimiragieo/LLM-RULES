#!/usr/bin/env node
'use strict';

/**
 * Tests for bypass-audit-hook.cjs
 *
 * TDD tests for Option C bypass audit system:
 * - PreToolUse emits correlation entry to bypass-audit.jsonl
 * - PostToolUse detects bypass when tool succeeds despite prior block verdict
 * - Alert thresholds (WARN@6, ALERT@21, CRITICAL@51) fire at correct counts
 *
 * RED phase: All tests must FAIL before implementation exists.
 * GREEN phase: All tests must PASS after hook-creator produces the hook.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ---------------------------------------------------------------------------
// Lazy load the hook module (will be missing until hook-creator creates it)
// ---------------------------------------------------------------------------

const HOOK_PATH = path.resolve(__dirname, '../../.claude/hooks/safety/bypass-audit-hook.cjs');

let hook;
try {
  hook = require(HOOK_PATH);
} catch (_) {
  hook = null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const _DEFAULT_AUDIT_PATH = path.join(RUNTIME_DIR, 'bypass-audit.jsonl');

/**
 * Create a temp directory for test isolation.
 */
function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bypass-audit-test-'));
}

/**
 * Generate a fresh correlation ID for testing.
 */
function makeCorrelationId(tool = 'Write', filePath = '/test/file.cjs') {
  const epochMs = Date.now();
  const pathHash = crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 10);
  return `${epochMs}-${tool}-${pathHash}`;
}

/**
 * Append a block_verdict record to a JSONL file.
 */
function appendBlockVerdict(jsonlPath, overrides = {}) {
  const ts = new Date().toISOString();
  const correlationId = overrides.correlationId || makeCorrelationId();
  const record = {
    type: 'block_verdict',
    correlationId,
    timestamp: ts,
    hook: overrides.hook || 'unified-creator-guard',
    tool: overrides.tool || 'Write',
    filePath: overrides.filePath || '.claude/hooks/safety/test.cjs',
    verdict: 'block',
    reason: overrides.reason || 'Direct artifact write without creator workflow',
    enforcementMode: overrides.enforcementMode || 'block',
    sessionId: overrides.sessionId || 'test-session-001',
    pid: process.pid,
    ...overrides,
  };
  fs.appendFileSync(jsonlPath, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

/**
 * Append a bypass_confirmed record to a JSONL file.
 */
function _appendBypassConfirmed(jsonlPath, correlationId, count = 1, overrides = {}) {
  const record = {
    type: 'bypass_confirmed',
    correlationId,
    timestamp: new Date().toISOString(),
    hook: 'bypass-audit-post',
    tool: 'Write',
    filePath: '.claude/hooks/safety/test.cjs',
    outcome: 'tool_succeeded_despite_block',
    blockingHook: 'unified-creator-guard',
    bypassMode: true,
    sessionId: 'test-session-001',
    pid: process.pid,
    cumulativeBypassCount: count,
    ...overrides,
  };
  fs.appendFileSync(jsonlPath, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

// ---------------------------------------------------------------------------
// Guard: Skip if hook not yet created (TDD Red phase)
// ---------------------------------------------------------------------------

describe('bypass-audit-hook.cjs', () => {
  describe('module exports', () => {
    test('hook module exists at expected path', () => {
      assert.ok(
        fs.existsSync(HOOK_PATH),
        `Hook file must exist at ${HOOK_PATH}. Run hook-creator to create it.`
      );
    });

    test('exports emitBlockVerdict function', () => {
      assert.ok(hook, 'Hook module must be loadable');
      assert.strictEqual(
        typeof hook.emitBlockVerdict,
        'function',
        'emitBlockVerdict must be exported'
      );
    });

    test('exports detectBypass function', () => {
      assert.ok(hook, 'Hook module must be loadable');
      assert.strictEqual(typeof hook.detectBypass, 'function', 'detectBypass must be exported');
    });

    test('exports getAlertSeverity function', () => {
      assert.ok(hook, 'Hook module must be loadable');
      assert.strictEqual(
        typeof hook.getAlertSeverity,
        'function',
        'getAlertSeverity must be exported'
      );
    });

    test('exports main function', () => {
      assert.ok(hook, 'Hook module must be loadable');
      assert.strictEqual(typeof hook.main, 'function', 'main must be exported');
    });
  });

  // ---------------------------------------------------------------------------
  // emitBlockVerdict: PreToolUse handler
  // ---------------------------------------------------------------------------

  describe('emitBlockVerdict (PreToolUse)', () => {
    let tmpDir;
    let auditPath;
    let origEnv;

    beforeEach(() => {
      tmpDir = makeTmpDir();
      auditPath = path.join(tmpDir, 'bypass-audit.jsonl');
      origEnv = { ...process.env };
      // Point the hook to our temp audit file
      process.env.BYPASS_AUDIT_PATH = auditPath;
      process.env.BYPASS_AUDIT_ENABLED = 'true';
    });

    afterEach(() => {
      // Restore env
      for (const key of Object.keys(process.env)) {
        if (!(key in origEnv)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, origEnv);
      // Cleanup temp dir
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        /* best effort */
      }
    });

    test('PRE-1: emitBlockVerdict appends a block_verdict record to the JSONL file', () => {
      assert.ok(hook, 'Hook module required');
      const correlationId = hook.emitBlockVerdict({
        hook: 'unified-creator-guard',
        tool: 'Write',
        filePath: '.claude/hooks/safety/foo.cjs',
        reason: 'Direct artifact write without creator workflow',
        auditPath,
      });

      assert.ok(typeof correlationId === 'string', 'emitBlockVerdict must return a correlationId');
      assert.ok(correlationId.length > 0, 'correlationId must not be empty');

      assert.ok(fs.existsSync(auditPath), 'bypass-audit.jsonl must be created');
      const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
      assert.strictEqual(lines.length, 1, 'Exactly one record should be written');

      const record = JSON.parse(lines[0]);
      assert.strictEqual(record.type, 'block_verdict');
      assert.strictEqual(record.correlationId, correlationId);
      assert.strictEqual(record.tool, 'Write');
      assert.ok(record.timestamp, 'record must have timestamp');
    });

    test('PRE-2: emitBlockVerdict creates the JSONL file if it does not exist', () => {
      assert.ok(hook, 'Hook module required');
      // The file does not exist yet
      assert.ok(!fs.existsSync(auditPath));

      hook.emitBlockVerdict({
        hook: 'test-hook',
        tool: 'Edit',
        filePath: '.claude/agents/test.md',
        reason: 'test reason',
        auditPath,
      });

      assert.ok(fs.existsSync(auditPath), 'File must be created');
    });

    test('PRE-3: multiple emitBlockVerdict calls append, not overwrite', () => {
      assert.ok(hook, 'Hook module required');
      hook.emitBlockVerdict({
        hook: 'hook-a',
        tool: 'Write',
        filePath: 'path/a.cjs',
        reason: 'reason a',
        auditPath,
      });
      hook.emitBlockVerdict({
        hook: 'hook-b',
        tool: 'Edit',
        filePath: 'path/b.md',
        reason: 'reason b',
        auditPath,
      });

      const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
      assert.strictEqual(lines.length, 2, 'Both records must be appended');
    });

    test('PRE-4: correlationId includes tool name', () => {
      assert.ok(hook, 'Hook module required');
      const correlationId = hook.emitBlockVerdict({
        hook: 'test-hook',
        tool: 'Write',
        filePath: 'test.cjs',
        reason: 'test',
        auditPath,
      });
      assert.ok(correlationId.includes('Write'), 'correlationId must include tool name');
    });

    test('PRE-5: emitBlockVerdict is best-effort and does not throw on invalid path', () => {
      assert.ok(hook, 'Hook module required');
      // Use a path in a non-existent parent directory
      const badPath = path.join(tmpDir, 'does-not-exist', 'subdir', 'audit.jsonl');
      let correlationId;
      assert.doesNotThrow(() => {
        correlationId = hook.emitBlockVerdict({
          hook: 'test-hook',
          tool: 'Write',
          filePath: 'test.cjs',
          reason: 'test',
          auditPath: badPath,
        });
      }, 'emitBlockVerdict must never throw');
      // correlationId should still be returned (even if write failed)
      assert.ok(typeof correlationId === 'string', 'correlationId must still be returned');
    });
  });

  // ---------------------------------------------------------------------------
  // detectBypass: PostToolUse handler
  // ---------------------------------------------------------------------------

  describe('detectBypass (PostToolUse)', () => {
    let tmpDir;
    let auditPath;
    let origEnv;

    beforeEach(() => {
      tmpDir = makeTmpDir();
      auditPath = path.join(tmpDir, 'bypass-audit.jsonl');
      origEnv = { ...process.env };
      process.env.BYPASS_AUDIT_PATH = auditPath;
      process.env.BYPASS_AUDIT_ENABLED = 'true';
      process.env.BYPASS_AUDIT_CORRELATION_WINDOW_MS = '5000';
      process.env.BYPASS_AUDIT_MAX_TAIL_LINES = '100';
    });

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in origEnv)) delete process.env[key];
      }
      Object.assign(process.env, origEnv);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        /* best effort */
      }
    });

    test('POST-1: detectBypass returns null when no block_verdict exists for this tool+path', () => {
      assert.ok(hook, 'Hook module required');
      // Audit file is empty
      fs.writeFileSync(auditPath, '', 'utf8');

      const result = hook.detectBypass({
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        auditPath,
      });
      assert.strictEqual(result, null, 'No bypass should be detected when no block exists');
    });

    test('POST-2: detectBypass returns bypass record when block_verdict exists within window', () => {
      assert.ok(hook, 'Hook module required');

      // Emit a block verdict
      const blockRecord = appendBlockVerdict(auditPath, {
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        timestamp: new Date().toISOString(),
      });

      const result = hook.detectBypass({
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        auditPath,
      });

      assert.ok(result !== null, 'Bypass should be detected');
      assert.strictEqual(result.correlationId, blockRecord.correlationId);
      assert.strictEqual(result.outcome, 'tool_succeeded_despite_block');
    });

    test('POST-3: detectBypass ignores block_verdict records outside the time window', () => {
      assert.ok(hook, 'Hook module required');
      // Set very short correlation window
      process.env.BYPASS_AUDIT_CORRELATION_WINDOW_MS = '1';

      // Create a block verdict with timestamp 10 seconds ago
      const oldTimestamp = new Date(Date.now() - 10000).toISOString();
      appendBlockVerdict(auditPath, {
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        timestamp: oldTimestamp,
      });

      const result = hook.detectBypass({
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        auditPath,
      });

      assert.strictEqual(result, null, 'Bypass should not be detected for out-of-window records');
    });

    test('POST-4: detectBypass ignores block_verdict for different filePath', () => {
      assert.ok(hook, 'Hook module required');

      appendBlockVerdict(auditPath, {
        tool: 'Write',
        filePath: '.claude/hooks/safety/OTHER-file.cjs',
        timestamp: new Date().toISOString(),
      });

      const result = hook.detectBypass({
        tool: 'Write',
        filePath: '.claude/hooks/safety/DIFFERENT-file.cjs',
        auditPath,
      });

      assert.strictEqual(result, null, 'Bypass should not be detected for different file path');
    });

    test('POST-5: detectBypass appends bypass_confirmed record to JSONL when bypass detected', () => {
      assert.ok(hook, 'Hook module required');

      appendBlockVerdict(auditPath, {
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        timestamp: new Date().toISOString(),
      });

      hook.detectBypass({
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        auditPath,
      });

      const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
      assert.ok(lines.length >= 2, 'bypass_confirmed record should be appended');

      const bypassRecord = JSON.parse(lines[lines.length - 1]);
      assert.strictEqual(bypassRecord.type, 'bypass_confirmed');
      assert.strictEqual(bypassRecord.outcome, 'tool_succeeded_despite_block');
    });

    test('POST-6: detectBypass returns null when BYPASS_AUDIT_ENABLED=false', () => {
      assert.ok(hook, 'Hook module required');
      process.env.BYPASS_AUDIT_ENABLED = 'false';

      appendBlockVerdict(auditPath, {
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        timestamp: new Date().toISOString(),
      });

      const result = hook.detectBypass({
        tool: 'Write',
        filePath: '.claude/hooks/safety/test.cjs',
        auditPath,
      });

      assert.strictEqual(result, null, 'detectBypass must be no-op when disabled');
    });

    test('POST-7: detectBypass returns null gracefully when JSONL file does not exist', () => {
      assert.ok(hook, 'Hook module required');
      // Don't create the audit file

      let result;
      assert.doesNotThrow(() => {
        result = hook.detectBypass({
          tool: 'Write',
          filePath: '.claude/hooks/safety/test.cjs',
          auditPath: path.join(tmpDir, 'nonexistent.jsonl'),
        });
      });
      assert.strictEqual(result, null);
    });
  });

  // ---------------------------------------------------------------------------
  // getAlertSeverity: tiered threshold logic
  // ---------------------------------------------------------------------------

  describe('getAlertSeverity (tiered thresholds)', () => {
    let origEnv;

    beforeEach(() => {
      origEnv = { ...process.env };
      // Use default thresholds: WARN@6, ALERT@21, CRITICAL@51
      delete process.env.BYPASS_AUDIT_WARN_THRESHOLD;
      delete process.env.BYPASS_AUDIT_ALERT_THRESHOLD;
      delete process.env.BYPASS_AUDIT_CRITICAL_THRESHOLD;
    });

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in origEnv)) delete process.env[key];
      }
      Object.assign(process.env, origEnv);
    });

    test('THRESH-1: count=1 returns INFO severity', () => {
      assert.ok(hook, 'Hook module required');
      const severity = hook.getAlertSeverity(1);
      assert.strictEqual(severity, 'INFO', `Expected INFO for count 1, got ${severity}`);
    });

    test('THRESH-2: count=5 returns INFO severity (below WARN threshold)', () => {
      assert.ok(hook, 'Hook module required');
      const severity = hook.getAlertSeverity(5);
      assert.strictEqual(severity, 'INFO', `Expected INFO for count 5, got ${severity}`);
    });

    test('THRESH-3: count=6 returns WARN severity (at WARN threshold)', () => {
      assert.ok(hook, 'Hook module required');
      const severity = hook.getAlertSeverity(6);
      assert.strictEqual(severity, 'WARN', `Expected WARN for count 6, got ${severity}`);
    });

    test('THRESH-4: count=20 returns WARN severity (below ALERT threshold)', () => {
      assert.ok(hook, 'Hook module required');
      const severity = hook.getAlertSeverity(20);
      assert.strictEqual(severity, 'WARN', `Expected WARN for count 20, got ${severity}`);
    });

    test('THRESH-5: count=21 returns ALERT severity (at ALERT threshold)', () => {
      assert.ok(hook, 'Hook module required');
      const severity = hook.getAlertSeverity(21);
      assert.strictEqual(severity, 'ALERT', `Expected ALERT for count 21, got ${severity}`);
    });

    test('THRESH-6: count=50 returns ALERT severity (below CRITICAL threshold)', () => {
      assert.ok(hook, 'Hook module required');
      const severity = hook.getAlertSeverity(50);
      assert.strictEqual(severity, 'ALERT', `Expected ALERT for count 50, got ${severity}`);
    });

    test('THRESH-7: count=51 returns CRITICAL severity (at CRITICAL threshold)', () => {
      assert.ok(hook, 'Hook module required');
      const severity = hook.getAlertSeverity(51);
      assert.strictEqual(severity, 'CRITICAL', `Expected CRITICAL for count 51, got ${severity}`);
    });

    test('THRESH-8: count=100 returns CRITICAL severity (above CRITICAL threshold)', () => {
      assert.ok(hook, 'Hook module required');
      const severity = hook.getAlertSeverity(100);
      assert.strictEqual(severity, 'CRITICAL', `Expected CRITICAL for count 100, got ${severity}`);
    });

    test('THRESH-9: custom thresholds from env vars are respected', () => {
      assert.ok(hook, 'Hook module required');
      process.env.BYPASS_AUDIT_WARN_THRESHOLD = '3';
      process.env.BYPASS_AUDIT_ALERT_THRESHOLD = '10';
      process.env.BYPASS_AUDIT_CRITICAL_THRESHOLD = '20';

      assert.strictEqual(hook.getAlertSeverity(2), 'INFO');
      assert.strictEqual(hook.getAlertSeverity(3), 'WARN');
      assert.strictEqual(hook.getAlertSeverity(9), 'WARN');
      assert.strictEqual(hook.getAlertSeverity(10), 'ALERT');
      assert.strictEqual(hook.getAlertSeverity(19), 'ALERT');
      assert.strictEqual(hook.getAlertSeverity(20), 'CRITICAL');
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: full Pre-block then Post-detect cycle
  // ---------------------------------------------------------------------------

  describe('integration: Pre-block -> Post-detect cycle', () => {
    let tmpDir;
    let auditPath;
    let origEnv;

    beforeEach(() => {
      tmpDir = makeTmpDir();
      auditPath = path.join(tmpDir, 'bypass-audit.jsonl');
      origEnv = { ...process.env };
      process.env.BYPASS_AUDIT_PATH = auditPath;
      process.env.BYPASS_AUDIT_ENABLED = 'true';
      process.env.BYPASS_AUDIT_CORRELATION_WINDOW_MS = '5000';
    });

    afterEach(() => {
      for (const key of Object.keys(process.env)) {
        if (!(key in origEnv)) delete process.env[key];
      }
      Object.assign(process.env, origEnv);
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        /* best effort */
      }
    });

    test('INT-1: emitBlockVerdict then detectBypass produces a matching bypass record', () => {
      assert.ok(hook, 'Hook module required');
      const filePath = '.claude/hooks/safety/my-new-hook.cjs';

      // Simulate PreToolUse block
      const correlationId = hook.emitBlockVerdict({
        hook: 'unified-creator-guard',
        tool: 'Write',
        filePath,
        reason: 'Direct artifact write',
        auditPath,
      });

      // Simulate PostToolUse (tool succeeded despite block)
      const bypassResult = hook.detectBypass({
        tool: 'Write',
        filePath,
        auditPath,
      });

      assert.ok(bypassResult !== null, 'Bypass must be detected');
      assert.strictEqual(
        bypassResult.correlationId,
        correlationId,
        'correlationId must match the Pre record'
      );

      // Verify JSONL has both records
      const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
      assert.strictEqual(lines.length, 2, 'Both block_verdict and bypass_confirmed must exist');

      const records = lines.map(l => JSON.parse(l));
      assert.strictEqual(records[0].type, 'block_verdict');
      assert.strictEqual(records[1].type, 'bypass_confirmed');
    });

    test('INT-2: multiple concurrent bypass records do not cross-contaminate', () => {
      assert.ok(hook, 'Hook module required');
      const fileA = '.claude/hooks/safety/file-a.cjs';
      const fileB = '.claude/agents/file-b.md';

      const corrA = hook.emitBlockVerdict({
        hook: 'unified-creator-guard',
        tool: 'Write',
        filePath: fileA,
        reason: 'Direct hook write',
        auditPath,
      });

      // Small delay to ensure different timestamp
      const corrB = hook.emitBlockVerdict({
        hook: 'unified-creator-guard',
        tool: 'Write',
        filePath: fileB,
        reason: 'Direct agent write',
        auditPath,
      });

      // Detect bypass for file A only
      const bypassA = hook.detectBypass({ tool: 'Write', filePath: fileA, auditPath });
      // Detect bypass for file B only
      const bypassB = hook.detectBypass({ tool: 'Write', filePath: fileB, auditPath });

      assert.ok(bypassA !== null, 'Bypass A must be detected');
      assert.ok(bypassB !== null, 'Bypass B must be detected');
      assert.strictEqual(bypassA.correlationId, corrA, 'File A bypass must match corrA');
      assert.strictEqual(bypassB.correlationId, corrB, 'File B bypass must match corrB');
    });
  });
});
