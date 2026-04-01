#!/usr/bin/env node
'use strict';

/**
 * Tests for microcompact detection and circuit breaker in context-window-monitor.cjs
 * (VAL-CM-004, VAL-CM-005, VAL-CM-006, VAL-CM-007, VAL-CM-009, VAL-CROSS-009)
 */

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const HOOK_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'monitoring',
  'context-window-monitor.cjs'
);

// Import module functions for direct (in-process) testing.
// Module-level state persists within the test process — use _resetState() between tests.
const monitor = require('../../.claude/hooks/monitoring/context-window-monitor.cjs');
const { checkMicrocompact, checkCircuitBreaker, _resetState, _setSnapshotPath } = monitor;

// ─── Shared temp directory for snapshot fixtures ──────────────────────────────

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-mon-test-'));
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_err) {
    // best-effort cleanup — Windows may lock files briefly
  }
});

beforeEach(() => {
  // Reset module-level state and point snapshot path to a non-existent file
  // so microcompact tests start with no fresh snapshot.
  _resetState();
  _setSnapshotPath(path.join(tmpDir, 'no-snapshot.json'));
});

// ─── Test 1 (VAL-CM-004): Microcompact detection on silent drop ───────────────

test('detects microcompact when token count drops >10K without recent snapshot', () => {
  // First call: establishes the previous token baseline
  checkMicrocompact(120_000);

  // Second call: drop of 25K — no fresh snapshot — should be detected
  const result = checkMicrocompact(95_000);

  assert.strictEqual(result.detected, true, 'Should detect microcompact on >10K silent drop');
  assert.ok(result.drop > 10_000, `Drop should be > 10K, got ${result.drop}`);
});

// ─── Test 2 (VAL-CM-005): No false positive with recent snapshot ──────────────

test('does not detect microcompact when a recent pre-compact snapshot exists', () => {
  const snapshotPath = path.join(tmpDir, 'fresh-snapshot.json');
  // Write snapshot with current timestamp (< 30s old)
  fs.writeFileSync(snapshotPath, JSON.stringify({ timestamp: new Date().toISOString() }), 'utf8');
  _setSnapshotPath(snapshotPath);

  // First call: establishes baseline
  checkMicrocompact(120_000);

  // Second call: large drop BUT snapshot is fresh — normal compaction, no event
  const result = checkMicrocompact(95_000);

  assert.strictEqual(
    result.detected,
    false,
    'Should NOT detect microcompact when fresh snapshot is present'
  );
});

// ─── Test 3 (VAL-CM-006): Circuit breaker triggers at 3 consecutive turns ─────

test('circuit breaker triggers after 3 consecutive turns at >=93% usage', () => {
  const r1 = checkCircuitBreaker(0.94); // turn 1: counter = 1
  const r2 = checkCircuitBreaker(0.95); // turn 2: counter = 2
  const r3 = checkCircuitBreaker(0.93); // turn 3: counter = 3 → trips

  assert.strictEqual(r1, null, 'Should not trip at turn 1');
  assert.strictEqual(r2, null, 'Should not trip at turn 2');
  assert.ok(r3 !== null, 'Should trip circuit breaker at turn 3');
});

// ─── Test 4 (VAL-CM-007): Circuit breaker resets on usage drop ───────────────

test('circuit breaker counter resets when usage drops below 93%', () => {
  checkCircuitBreaker(0.94); // turn 1: counter = 1
  checkCircuitBreaker(0.95); // turn 2: counter = 2
  checkCircuitBreaker(0.8); // drops below 93%: counter resets to 0
  checkCircuitBreaker(0.94); // turn 1 again: counter = 1
  const r = checkCircuitBreaker(0.95); // turn 2 again: counter = 2, no trip

  assert.strictEqual(r, null, 'Should NOT trip — counter was reset when usage dropped');
});

// ─── Test 5 (VAL-CM-009): Advisory contains session-handoff and context-compressor

test('circuit breaker advisory mentions session-handoff and context-compressor', () => {
  checkCircuitBreaker(0.94);
  checkCircuitBreaker(0.95);
  const advisory = checkCircuitBreaker(0.93);

  assert.ok(advisory !== null, 'Advisory must not be null when circuit breaker trips');
  assert.ok(
    advisory.includes('session-handoff'),
    `Advisory must mention 'session-handoff'. Got: ${advisory}`
  );
  assert.ok(
    advisory.includes('context-compressor'),
    `Advisory must mention 'context-compressor'. Got: ${advisory}`
  );
});

// ─── Test 6 (VAL-CROSS-009): Both threshold warning + advisory in additionalContext

test('threshold warning and circuit breaker advisory both appear in additionalContext', () => {
  // This test runs the real hook binary via subprocess so we can inspect the
  // full JSON output (additionalContext field).

  const sessionId = 'test-cb-concat';
  const budget = 200_000;
  // 94% usage: above CRITICAL threshold (90%) AND circuit breaker threshold (93%)
  const tokensUsed = Math.floor(budget * 0.94);

  const subTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-mon-sub-'));

  try {
    // Set up required fixture files in the temp directory
    fs.writeFileSync(
      path.join(subTmpDir, 'session-id.json'),
      JSON.stringify({ sessionId }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(subTmpDir, 'budget-tracker.json'),
      JSON.stringify({ [sessionId]: { totalTokens: tokensUsed, budget } }),
      'utf8'
    );
    // Simulate 2 consecutive high-usage turns already recorded — this invocation is the 3rd
    fs.writeFileSync(
      path.join(subTmpDir, 'monitor-state.json'),
      JSON.stringify({ previousTokensUsed: tokensUsed, consecutiveHighUsageTurns: 2 }),
      'utf8'
    );

    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: '{}',
      encoding: 'utf8',
      env: {
        ...process.env,
        SESSION_ID_PATH: path.join(subTmpDir, 'session-id.json'),
        BUDGET_TRACKER_PATH: path.join(subTmpDir, 'budget-tracker.json'),
        CONTEXT_MONITOR_STATE_FILE: path.join(subTmpDir, 'monitor-state.json'),
        // Point snapshot at nonexistent file (no recent compaction)
        PRE_COMPACT_SNAPSHOT_FILE: path.join(subTmpDir, 'no-snapshot.json'),
        // Redirect flight recorder to temp file so we don't pollute the real one
        FLIGHT_RECORDER_PATH: path.join(subTmpDir, 'flight-recorder.jsonl'),
      },
    });

    assert.strictEqual(result.status, 0, `Hook must exit 0. stderr: ${result.stderr}`);

    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.allow, true, 'Hook must allow the action');
    assert.ok(
      output.additionalContext,
      'additionalContext must be present when both detectors fire'
    );

    // Threshold warning (CRITICAL at 94%)
    assert.ok(
      output.additionalContext.includes('CRITICAL'),
      `additionalContext must include CRITICAL threshold warning. Got: ${output.additionalContext}`
    );

    // Circuit breaker advisory (session-handoff)
    assert.ok(
      output.additionalContext.includes('session-handoff'),
      `additionalContext must include session-handoff advisory. Got: ${output.additionalContext}`
    );

    // Circuit breaker advisory (context-compressor)
    assert.ok(
      output.additionalContext.includes('context-compressor'),
      `additionalContext must include context-compressor advisory. Got: ${output.additionalContext}`
    );
  } finally {
    try {
      fs.rmSync(subTmpDir, { recursive: true, force: true });
    } catch (_err) {
      // best-effort cleanup
    }
  }
});
