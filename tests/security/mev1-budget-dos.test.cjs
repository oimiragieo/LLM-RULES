'use strict';

/**
 * MEv1 B1 — Budget enforcer validation (CWE-400 DoS)
 *
 * Threats:
 * - estimatedTokens caller-supplied + unvalidated → claim 0 tokens to bypass TPM,
 *   or claim a huge value to permanently lock out other callers.
 * - No payload size cap → SQLite bloat / OOM.
 * - No maxRetries cap at dispatcher → retry storms.
 *
 * Mitigations (B1):
 * - Clamp estimatedTokens ∈ [100, 50_000] inside acquireWorkerSlot.
 * - Enforce MAX_PAYLOAD_BYTES = 64 KiB in dispatcher pre-enqueue.
 * - MAX_RETRIES = 3 cap surfaced as a constant from the dispatcher module.
 *
 * Source: .claude/context/reports/security/mev1-phase0-threat-model-2026-04-19.md (B1)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  BudgetEnforcementService,
  ESTIMATED_TOKENS_MIN,
  ESTIMATED_TOKENS_MAX,
} = require('../../.claude/lib/workers/budget-enforcement.cjs');

const dispatcher = require('../../.claude/lib/mission/worker-features-dispatcher.cjs');
const { dispatchFeature, MAX_PAYLOAD_BYTES, MAX_RETRIES } = dispatcher;

test('B1-budget: ESTIMATED_TOKENS_MIN/MAX exported and bounded correctly', () => {
  assert.equal(ESTIMATED_TOKENS_MIN, 100);
  assert.equal(ESTIMATED_TOKENS_MAX, 50_000);
});

test('B1-budget: estimatedTokens=0 is clamped up to MIN', () => {
  const budget = new BudgetEnforcementService({
    maxTokensPerMinute: 1000,
    maxConcurrentWorkers: 10,
  });
  const slot = budget.acquireWorkerSlot(0);
  assert.equal(slot.allowed, true);
  const stats = budget.getStats();
  assert.equal(
    stats.currentMinuteUsage,
    ESTIMATED_TOKENS_MIN,
    'TPM usage must reflect clamped MIN, not 0'
  );
});

test('B1-budget: estimatedTokens=999_999 is clamped down to MAX', () => {
  const budget = new BudgetEnforcementService({
    maxTokensPerMinute: 1_000_000,
    maxConcurrentWorkers: 10,
  });
  const slot = budget.acquireWorkerSlot(999_999);
  assert.equal(slot.allowed, true);
  const stats = budget.getStats();
  assert.equal(
    stats.currentMinuteUsage,
    ESTIMATED_TOKENS_MAX,
    'TPM usage must reflect clamped MAX, not 999_999'
  );
});

test('B1-budget: negative estimatedTokens is clamped to MIN', () => {
  const budget = new BudgetEnforcementService({
    maxTokensPerMinute: 1000,
    maxConcurrentWorkers: 10,
  });
  const slot = budget.acquireWorkerSlot(-50);
  assert.equal(slot.allowed, true);
  const stats = budget.getStats();
  assert.equal(stats.currentMinuteUsage, ESTIMATED_TOKENS_MIN);
});

test('B1-budget: NaN/undefined estimatedTokens defaults to a sane value (>= MIN)', () => {
  const budget = new BudgetEnforcementService({
    maxTokensPerMinute: 1000,
    maxConcurrentWorkers: 10,
  });
  const slot = budget.acquireWorkerSlot(NaN);
  assert.equal(slot.allowed, true);
  const stats = budget.getStats();
  assert.ok(
    stats.currentMinuteUsage >= ESTIMATED_TOKENS_MIN,
    `expected >= ${ESTIMATED_TOKENS_MIN}, got ${stats.currentMinuteUsage}`
  );
});

test('B1-dispatch: MAX_PAYLOAD_BYTES is exported and equals 64 KiB', () => {
  assert.equal(MAX_PAYLOAD_BYTES, 65536);
});

test('B1-dispatch: MAX_RETRIES is exported and equals 3', () => {
  assert.equal(MAX_RETRIES, 3);
});

test('B1-dispatch: payload >64 KiB is rejected pre-enqueue', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-b1-'));
  const featuresPath = path.join(tmpDir, 'features.json');
  const missionPath = path.join(tmpDir, 'mission.md');
  fs.writeFileSync(missionPath, '# Mission\n\n## Objectives\n- test\n');
  // Construct a feature whose persona context (via huge description) blows past 64 KiB
  const huge = 'x'.repeat(70_000);
  fs.writeFileSync(
    featuresPath,
    JSON.stringify({
      version: '1.0.0',
      features: [
        {
          id: 'f1',
          description: huge,
          skillName: 'tdd',
          status: 'pending',
          preconditions: [],
        },
      ],
    })
  );

  let enqueueCalled = false;
  const fakeDb = {
    prepare: () => ({
      run: () => {
        enqueueCalled = true;
        return { changes: 1 };
      },
    }),
  };
  const fakeBudget = {
    acquireWorkerSlot: () => ({ allowed: true, release: () => {} }),
  };

  const result = dispatchFeature({
    db: fakeDb,
    budget: fakeBudget,
    featuresPath,
    missionPath,
  });
  assert.equal(result.dispatched, false);
  assert.equal(result.reason, 'payload_too_large');
  assert.ok(result.payloadBytes > MAX_PAYLOAD_BYTES);
  assert.equal(enqueueCalled, false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('B1-dispatch: small payload still dispatches (regression guard)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mev1-b1-'));
  const featuresPath = path.join(tmpDir, 'features.json');
  const missionPath = path.join(tmpDir, 'mission.md');
  fs.writeFileSync(missionPath, '# Mission\n\n## Objectives\n- test\n');
  fs.writeFileSync(
    featuresPath,
    JSON.stringify({
      version: '1.0.0',
      features: [
        {
          id: 'f1',
          description: 'tiny',
          skillName: 'tdd',
          status: 'pending',
          preconditions: [],
        },
      ],
    })
  );

  let enqueueCalled = false;
  const fakeDb = {
    prepare: () => ({
      run: () => {
        enqueueCalled = true;
        return { changes: 1 };
      },
    }),
  };
  const fakeBudget = {
    acquireWorkerSlot: () => ({ allowed: true, release: () => {} }),
  };

  const result = dispatchFeature({
    db: fakeDb,
    budget: fakeBudget,
    featuresPath,
    missionPath,
  });
  assert.equal(result.dispatched, true, JSON.stringify(result));
  assert.equal(enqueueCalled, true);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
