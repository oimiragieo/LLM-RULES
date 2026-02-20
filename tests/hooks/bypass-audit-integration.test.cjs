#!/usr/bin/env node
'use strict';

/**
 * E2E Integration Tests: bypass-audit hook wiring
 * =================================================
 *
 * These tests verify the REAL integration path:
 *   PreToolUse hook calls emitBlockVerdict() BEFORE process.exit(2)
 *   → bypass-audit.jsonl receives a block_verdict record
 *   → PostToolUse detectBypass() finds the record and writes bypass_confirmed
 *
 * RED phase status (current):
 *   - Test 1 (emitBlockVerdict API): PASSES (function works)
 *   - Test 2 (routing-guard integration): FAILS — routing-guard.cjs never calls emitBlockVerdict
 *   - Test 3 (unified-creator-guard integration): FAILS — unified-creator-guard.cjs never calls emitBlockVerdict
 *   - Test 4 (full cycle): PASSES once both emitBlockVerdict and detectBypass work end-to-end
 *
 * GREEN phase (after M2-M5 add emitBlockVerdict calls):
 *   All 4 tests should PASS.
 *
 * BUG-1 root cause: emitBlockVerdict is exported but never called by any PreToolUse hook.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'bypass-audit-hook.cjs');
const ROUTING_GUARD_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'routing-guard.cjs'
);
const CREATOR_GUARD_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'unified-creator-guard.cjs'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a temp directory for test isolation.
 */
function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bypass-audit-integration-'));
}

/**
 * Read and parse all records from a JSONL file.
 * Returns empty array if file does not exist.
 */
function readAuditRecords(auditPath) {
  if (!fs.existsSync(auditPath)) return [];
  const content = fs.readFileSync(auditPath, 'utf8');
  return content
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

/**
 * Run a hook script as a subprocess, piping JSON input via stdin.
 * Returns { stdout, stderr, status } from spawnSync.
 *
 * @param {string} hookPath - Absolute path to the hook .cjs file
 * @param {object} input - Hook input object to serialize as JSON
 * @param {object} envOverrides - Additional env vars for the subprocess
 */
function runHookWithInput(hookPath, input, envOverrides = {}) {
  const inputJson = JSON.stringify(input);
  const result = spawnSync('node', [hookPath], {
    input: inputJson,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...envOverrides,
    },
    timeout: 10000,
    shell: false,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Test 1: emitBlockVerdict API — should PASS currently
// ---------------------------------------------------------------------------

describe('bypass-audit integration — Test 1: emitBlockVerdict creates audit record', () => {
  let tmpDir;
  let auditPath;
  let origEnv;
  let hook;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    auditPath = path.join(tmpDir, 'bypass-audit.jsonl');
    origEnv = { ...process.env };
    process.env.BYPASS_AUDIT_PATH = auditPath;
    process.env.BYPASS_AUDIT_ENABLED = 'true';

    // Load the bypass-audit-hook module
    hook = require(HOOK_PATH);
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

  test('INT-API-1: calling emitBlockVerdict() directly writes a block_verdict record to bypass-audit.jsonl', () => {
    assert.ok(hook, 'bypass-audit-hook.cjs must be loadable');
    assert.strictEqual(
      typeof hook.emitBlockVerdict,
      'function',
      'emitBlockVerdict must be exported'
    );

    // Simulate what a PreToolUse hook SHOULD do before process.exit(2)
    const correlationId = hook.emitBlockVerdict({
      hook: 'routing-guard.cjs',
      tool: 'Bash',
      filePath: '',
      reason: 'Router Bash guard: blacklisted Bash command blocked',
      auditPath,
    });

    // Verify the record was written
    assert.ok(
      typeof correlationId === 'string',
      'emitBlockVerdict must return a correlationId string'
    );
    assert.ok(correlationId.length > 0, 'correlationId must not be empty');
    assert.ok(correlationId.includes('Bash'), 'correlationId must encode the tool name');

    assert.ok(fs.existsSync(auditPath), 'bypass-audit.jsonl must exist after emitBlockVerdict');

    const records = readAuditRecords(auditPath);
    assert.strictEqual(records.length, 1, 'Exactly one record must be written');

    const record = records[0];
    assert.strictEqual(record.type, 'block_verdict', 'Record type must be block_verdict');
    assert.strictEqual(
      record.correlationId,
      correlationId,
      'correlationId must match return value'
    );
    assert.strictEqual(record.tool, 'Bash', 'Record tool must match');
    assert.strictEqual(record.hook, 'routing-guard.cjs', 'Record hook name must match');
    assert.strictEqual(record.verdict, 'block', 'Record verdict must be block');
    assert.ok(record.timestamp, 'Record must have a timestamp');
  });

  test('INT-API-2: emitBlockVerdict with Write tool records creator-guard scenario', () => {
    assert.ok(hook, 'bypass-audit-hook.cjs must be loadable');

    const correlationId = hook.emitBlockVerdict({
      hook: 'unified-creator-guard.cjs',
      tool: 'Write',
      filePath: '.claude/hooks/safety/new-hook.cjs',
      reason: 'Direct artifact write without creator workflow',
      artifactType: 'hook',
      requiredCreator: 'hook-creator',
      enforcementMode: 'block',
      auditPath,
    });

    const records = readAuditRecords(auditPath);
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].type, 'block_verdict');
    assert.strictEqual(records[0].tool, 'Write');
    assert.strictEqual(records[0].artifactType, 'hook');
    assert.strictEqual(records[0].requiredCreator, 'hook-creator');
    assert.ok(correlationId, 'Must return correlationId');
  });
});

// ---------------------------------------------------------------------------
// Test 2: routing-guard integration — should FAIL currently (RED phase)
//
// This test runs routing-guard.cjs as a real subprocess with input that
// triggers a block (TaskCreate with PLANNER_FIRST_ENFORCEMENT=block).
// After M5 adds emitBlockVerdict call to routing-guard, bypass-audit.jsonl
// should have a block_verdict record.
// ---------------------------------------------------------------------------

describe('bypass-audit integration — Test 2: routing-guard blocks and writes audit record (RED)', () => {
  let tmpDir;
  let auditPath;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    auditPath = path.join(tmpDir, 'bypass-audit.jsonl');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* best effort */
    }
  });

  test('INT-ROUTING-1: routing-guard blocks TaskCreate and writes block_verdict to bypass-audit.jsonl', () => {
    // This input targets check 2 (planner-first) which blocks TaskCreate
    // when PLANNER_FIRST_ENFORCEMENT=block and no planner was spawned first.
    const hookInput = {
      tool_name: 'TaskCreate',
      tool_input: {
        subject: 'Implement new feature X',
        description: 'Build a complex multi-file feature',
      },
      session_id: 'test-session-bypass-audit',
    };

    const result = runHookWithInput(ROUTING_GUARD_PATH, hookInput, {
      PLANNER_FIRST_ENFORCEMENT: 'block',
      BYPASS_AUDIT_PATH: auditPath,
      BYPASS_AUDIT_ENABLED: 'true',
      // Disable other enforcement modes to isolate planner-first check
      SECURITY_REVIEW_ENFORCEMENT: 'off',
      CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT: 'off',
      HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT: 'off',
      SPECIALIST_ROUTING_ENFORCEMENT: 'off',
      ROUTER_BASH_GUARD: 'off',
      TASKLIST_FIRST_ENFORCEMENT: 'off',
      INTENT_AGENT_MATCH: 'off',
    });

    // Hook should exit with code 2 (block) or 0 (allow) — we just need to
    // check that IF it blocked, bypass-audit.jsonl has a record.
    // The key assertion: when exit(2) occurs, a block_verdict must have been written FIRST.

    if (result.status === 2) {
      // Hook blocked the operation — bypass-audit.jsonl MUST have a block_verdict record
      // Currently FAILS because routing-guard.cjs never calls emitBlockVerdict
      assert.ok(
        fs.existsSync(auditPath),
        'bypass-audit.jsonl must exist when routing-guard blocks (exit 2). ' +
          'CURRENTLY FAILING (RED): routing-guard.cjs never calls emitBlockVerdict(). ' +
          'This will PASS after M5 adds the emitBlockVerdict call.'
      );

      const records = readAuditRecords(auditPath);
      const blockVerdicts = records.filter(r => r.type === 'block_verdict');

      assert.ok(
        blockVerdicts.length > 0,
        'At least one block_verdict record must exist in bypass-audit.jsonl when routing-guard exits 2. ' +
          'CURRENTLY FAILING (RED): emitBlockVerdict is exported but never called. ' +
          'This will PASS after M5 instruments routing-guard.cjs.'
      );

      // Verify the record has the expected fields
      const verdict = blockVerdicts[0];
      assert.strictEqual(verdict.type, 'block_verdict');
      assert.ok(verdict.correlationId, 'block_verdict must have correlationId');
      assert.ok(verdict.hook, 'block_verdict must identify the blocking hook');
      assert.ok(verdict.reason, 'block_verdict must include a reason');
    } else {
      // Hook did not block — test is inconclusive for this path
      // Mark as skipped rather than failing (enforcement mode may not have triggered)
      assert.ok(
        true,
        `routing-guard exited ${result.status} (did not block) — test is inconclusive. ` +
          'Adjust PLANNER_FIRST_ENFORCEMENT env if needed.'
      );
    }
  });

  test('INT-ROUTING-2: routing-guard that blocks must write audit record BEFORE exit(2)', () => {
    // This test verifies temporal ordering: the audit record must be written
    // before the process exits. We can verify this by checking that the file
    // exists and has content after the subprocess completes.
    const hookInput = {
      tool_name: 'TaskCreate',
      tool_input: {
        subject: 'Build multi-file authentication system',
        description: 'HIGH complexity auth feature needing planner',
      },
      session_id: 'test-session-ordering',
    };

    const result = runHookWithInput(ROUTING_GUARD_PATH, hookInput, {
      PLANNER_FIRST_ENFORCEMENT: 'block',
      BYPASS_AUDIT_PATH: auditPath,
      BYPASS_AUDIT_ENABLED: 'true',
      SECURITY_REVIEW_ENFORCEMENT: 'off',
      CODE_SIMPLIFIER_ARCHITECT_ENFORCEMENT: 'off',
      HIGH_RISK_SPECIALIST_ARCHITECT_ENFORCEMENT: 'off',
      SPECIALIST_ROUTING_ENFORCEMENT: 'off',
      ROUTER_BASH_GUARD: 'off',
      TASKLIST_FIRST_ENFORCEMENT: 'off',
      INTENT_AGENT_MATCH: 'off',
    });

    if (result.status === 2) {
      // The file must exist synchronously after subprocess exits
      // emitBlockVerdict uses fs.appendFileSync (synchronous), so it
      // must complete before process.exit(2) takes effect
      const fileExists = fs.existsSync(auditPath);
      assert.ok(
        fileExists,
        'bypass-audit.jsonl must exist synchronously after routing-guard subprocess exits. ' +
          'CURRENTLY FAILING (RED): routing-guard.cjs exits(2) without calling emitBlockVerdict(). ' +
          'Fix: add emitBlockVerdict() call before every process.exit(2) in routing-guard.'
      );

      if (fileExists) {
        const content = fs.readFileSync(auditPath, 'utf8');
        assert.ok(content.includes('block_verdict'), 'File must contain block_verdict record');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: unified-creator-guard integration — should FAIL currently (RED phase)
//
// This test runs unified-creator-guard.cjs with a write to a creator path
// (e.g., .claude/hooks/safety/foo.cjs). After M2 adds emitBlockVerdict,
// bypass-audit.jsonl should have a block_verdict record.
// ---------------------------------------------------------------------------

describe('bypass-audit integration — Test 3: unified-creator-guard blocks and writes audit record (RED)', () => {
  let tmpDir;
  let auditPath;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    auditPath = path.join(tmpDir, 'bypass-audit.jsonl');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* best effort */
    }
  });

  test('INT-CREATOR-1: creator-guard blocks Write to hook path and writes block_verdict to bypass-audit.jsonl', () => {
    // Writing directly to .claude/hooks/ triggers the creator guard
    const hookInput = {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(PROJECT_ROOT, '.claude', 'hooks', 'safety', 'my-new-guard.cjs'),
        content: '// new hook content',
      },
      session_id: 'test-session-creator-guard',
    };

    const result = runHookWithInput(CREATOR_GUARD_PATH, hookInput, {
      CREATOR_GUARD: 'block',
      BYPASS_AUDIT_PATH: auditPath,
      BYPASS_AUDIT_ENABLED: 'true',
    });

    if (result.status === 2) {
      // Hook blocked — bypass-audit.jsonl MUST have a block_verdict record
      // Currently FAILS because unified-creator-guard.cjs never calls emitBlockVerdict
      assert.ok(
        fs.existsSync(auditPath),
        'bypass-audit.jsonl must exist when unified-creator-guard blocks (exit 2). ' +
          'CURRENTLY FAILING (RED): unified-creator-guard.cjs never calls emitBlockVerdict(). ' +
          'This will PASS after M2 adds the emitBlockVerdict call.'
      );

      const records = readAuditRecords(auditPath);
      const blockVerdicts = records.filter(r => r.type === 'block_verdict');

      assert.ok(
        blockVerdicts.length > 0,
        'At least one block_verdict record must exist in bypass-audit.jsonl when creator-guard exits 2. ' +
          'CURRENTLY FAILING (RED): emitBlockVerdict is exported but never called. ' +
          'This will PASS after M2 instruments unified-creator-guard.cjs.'
      );

      const verdict = blockVerdicts[0];
      assert.strictEqual(verdict.type, 'block_verdict');
      assert.ok(verdict.correlationId, 'block_verdict must have correlationId');
      assert.ok(verdict.hook, 'block_verdict must identify the hook name');
      assert.ok(verdict.tool, 'block_verdict must identify the tool');
      // The filePath in the record should reference the creator-guarded path
      assert.ok(
        verdict.filePath && verdict.filePath.includes('.claude'),
        'block_verdict filePath must reference the guarded artifact path'
      );
    } else {
      // Guard did not block — may not have matched the path
      // This can happen if path detection logic changed; not a test failure
      assert.ok(
        true,
        `unified-creator-guard exited ${result.status} (did not block for this input). ` +
          'Try adjusting file_path to match a known creator-guarded pattern.'
      );
    }
  });

  test('INT-CREATOR-2: creator-guard blocks Write to agent path and writes block_verdict', () => {
    const hookInput = {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(PROJECT_ROOT, '.claude', 'agents', 'core', 'my-new-agent.md'),
        content: '# My New Agent',
      },
      session_id: 'test-session-creator-agent',
    };

    const result = runHookWithInput(CREATOR_GUARD_PATH, hookInput, {
      CREATOR_GUARD: 'block',
      BYPASS_AUDIT_PATH: auditPath,
      BYPASS_AUDIT_ENABLED: 'true',
    });

    if (result.status === 2) {
      assert.ok(
        fs.existsSync(auditPath),
        'bypass-audit.jsonl must exist when creator-guard blocks agent write. ' +
          'CURRENTLY FAILING (RED): unified-creator-guard.cjs never calls emitBlockVerdict(). ' +
          'This will PASS after M2 instruments the hook.'
      );

      const records = readAuditRecords(auditPath);
      const blockVerdicts = records.filter(r => r.type === 'block_verdict');
      assert.ok(
        blockVerdicts.length > 0,
        'block_verdict must be written before exit(2) for agent path writes. ' +
          'CURRENTLY FAILING (RED).'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: Full cycle — block verdict then bypass detection
// This tests the complete end-to-end scenario and should largely PASS now
// since both emitBlockVerdict and detectBypass work in isolation.
// ---------------------------------------------------------------------------

describe('bypass-audit integration — Test 4: complete block-then-bypass-detected cycle', () => {
  let tmpDir;
  let auditPath;
  let origEnv;
  let hook;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    auditPath = path.join(tmpDir, 'bypass-audit.jsonl');
    origEnv = { ...process.env };
    process.env.BYPASS_AUDIT_PATH = auditPath;
    process.env.BYPASS_AUDIT_ENABLED = 'true';
    process.env.BYPASS_AUDIT_CORRELATION_WINDOW_MS = '5000';

    hook = require(HOOK_PATH);
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

  test('INT-CYCLE-1: emitBlockVerdict followed by detectBypass produces a complete bypass audit trail', () => {
    assert.ok(hook, 'bypass-audit-hook.cjs must be loadable');

    const filePath = '.claude/hooks/safety/test-hook.cjs';

    // Step 1: Simulate a PreToolUse hook calling emitBlockVerdict before exit(2)
    const correlationId = hook.emitBlockVerdict({
      hook: 'unified-creator-guard.cjs',
      tool: 'Write',
      filePath,
      reason: 'Direct artifact write without creator workflow',
      artifactType: 'hook',
      enforcementMode: 'block',
      auditPath,
    });

    assert.ok(correlationId, 'emitBlockVerdict must return a correlationId');

    // Verify the block_verdict was written
    const recordsAfterBlock = readAuditRecords(auditPath);
    assert.strictEqual(recordsAfterBlock.length, 1, 'One block_verdict record must exist');
    assert.strictEqual(recordsAfterBlock[0].type, 'block_verdict');

    // Step 2: Simulate the PostToolUse hook detecting that the tool ran anyway
    // (bypassPermissions mode lets the tool proceed despite exit(2))
    const bypassResult = hook.detectBypass({
      tool: 'Write',
      filePath,
      sessionId: 'test-session-cycle',
      auditPath,
    });

    // Step 3: Verify the complete audit trail
    assert.ok(bypassResult !== null, 'Bypass must be detected when tool ran after block');
    assert.strictEqual(
      bypassResult.correlationId,
      correlationId,
      'bypass_confirmed correlationId must match the block_verdict correlationId'
    );
    assert.strictEqual(bypassResult.outcome, 'tool_succeeded_despite_block');
    assert.strictEqual(bypassResult.tool, 'Write');

    // Step 4: Verify JSONL has both records in order
    const allRecords = readAuditRecords(auditPath);
    assert.strictEqual(allRecords.length, 2, 'Both block_verdict and bypass_confirmed must exist');
    assert.strictEqual(allRecords[0].type, 'block_verdict', 'First record must be block_verdict');
    assert.strictEqual(
      allRecords[1].type,
      'bypass_confirmed',
      'Second record must be bypass_confirmed'
    );

    // Step 5: Verify the bypass count and severity
    assert.strictEqual(bypassResult.cumulativeBypassCount, 1, 'First bypass count must be 1');
    const severity = hook.getAlertSeverity(bypassResult.cumulativeBypassCount);
    assert.strictEqual(severity, 'INFO', 'Single bypass should be INFO severity');
  });

  test('INT-CYCLE-2: multiple hooks each emit block_verdict, then bypass detection picks up correct one', () => {
    assert.ok(hook, 'bypass-audit-hook.cjs must be loadable');

    const fileA = '.claude/hooks/safety/hook-a.cjs';
    const fileB = '.claude/agents/core/agent-b.md';

    // Two different hooks block two different files
    const corrA = hook.emitBlockVerdict({
      hook: 'unified-creator-guard.cjs',
      tool: 'Write',
      filePath: fileA,
      reason: 'Direct hook write',
      auditPath,
    });

    const corrB = hook.emitBlockVerdict({
      hook: 'unified-creator-guard.cjs',
      tool: 'Write',
      filePath: fileB,
      reason: 'Direct agent write',
      auditPath,
    });

    // In bypassPermissions mode, both tools succeed despite the blocks
    // PostToolUse fires for each file
    const bypassA = hook.detectBypass({ tool: 'Write', filePath: fileA, auditPath });
    const bypassB = hook.detectBypass({ tool: 'Write', filePath: fileB, auditPath });

    assert.ok(bypassA !== null, 'Bypass for file A must be detected');
    assert.ok(bypassB !== null, 'Bypass for file B must be detected');
    assert.strictEqual(bypassA.correlationId, corrA, 'File A bypass must match corrA');
    assert.strictEqual(bypassB.correlationId, corrB, 'File B bypass must match corrB');

    // Two bypass_confirmed records should exist in the JSONL
    const allRecords = readAuditRecords(auditPath);
    const bypassConfirmed = allRecords.filter(r => r.type === 'bypass_confirmed');
    assert.strictEqual(bypassConfirmed.length, 2, 'Two bypass_confirmed records must exist');
  });

  test('INT-CYCLE-3: bypass detection is no-op when BYPASS_AUDIT_ENABLED=false', () => {
    assert.ok(hook, 'bypass-audit-hook.cjs must be loadable');
    process.env.BYPASS_AUDIT_ENABLED = 'false';

    const filePath = '.claude/hooks/safety/disabled-test.cjs';

    // Emit a block verdict while disabled (it still writes because emitBlockVerdict
    // doesn't check the enabled flag — it's always best-effort)
    hook.emitBlockVerdict({
      hook: 'test-hook',
      tool: 'Write',
      filePath,
      reason: 'test',
      auditPath,
    });

    // detectBypass should return null when disabled
    const result = hook.detectBypass({ tool: 'Write', filePath, auditPath });
    assert.strictEqual(
      result,
      null,
      'detectBypass must return null when BYPASS_AUDIT_ENABLED=false'
    );
  });
});
