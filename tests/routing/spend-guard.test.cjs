#!/usr/bin/env node
'use strict';

/**
 * spend-guard.test.cjs — S4 TDD: auto-downgrade-to-haiku when per-session cost
 * approaches configured ceiling.
 *
 * Test IDs: SG-001 … SG-005
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;
let originalEnv;

function setupTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-test-'));
  originalEnv = { ...process.env };
  return tmpDir;
}

function teardownTmpDir() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_e) {
    // Best-effort cleanup
  }
}

/**
 * Write a fake ccusage-status.txt with the given cost value.
 * @param {number} cost
 * @param {string} dir - base temp dir
 * @returns {string} path to written file
 */
function writeCcusageStatus(cost, dir) {
  const runtimeDir = path.join(dir, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true });
  const filePath = path.join(runtimeDir, 'ccusage-status.txt');
  const formattedCost = cost.toFixed(4);
  const content = `[tokens] 10,000 today (in: 1,000 / out: 9,000) | Cost: $${formattedCost}\n`;
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Lazy-require token-governor to bust cache between tests
// ---------------------------------------------------------------------------

function requireGovernor() {
  const modPath = require.resolve('../../.claude/lib/routing/token-governor.cjs');
  delete require.cache[modPath];
  return require('../../.claude/lib/routing/token-governor.cjs');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpendGuard (checkSpendCeiling)', () => {
  beforeEach(() => {
    setupTmpDir();
  });

  afterEach(() => {
    teardownTmpDir();
  });

  // -------------------------------------------------------------------------
  // SG-001: returns { downgrade: false } when spend < ceiling threshold
  // -------------------------------------------------------------------------
  it('SG-001: returns { downgrade: false } when session cost is below ceiling', () => {
    const statusFile = writeCcusageStatus(2.5, tmpDir);
    process.env.SPEND_GUARD_STATUS_FILE = statusFile;
    delete process.env.SPEND_GUARD_CEILING_USD;

    const { checkSpendCeiling } = requireGovernor();
    const result = checkSpendCeiling('sess-sg001');

    assert.equal(result.downgrade, false, 'Should not downgrade at $2.50 with $5.00 ceiling');
  });

  // -------------------------------------------------------------------------
  // SG-002: returns { downgrade: true, suggestedModel: "haiku" } when spend >= ceiling
  // -------------------------------------------------------------------------
  it('SG-002: returns { downgrade: true, suggestedModel: "haiku" } when spend >= ceiling', () => {
    const statusFile = writeCcusageStatus(5.5, tmpDir);
    process.env.SPEND_GUARD_STATUS_FILE = statusFile;
    delete process.env.SPEND_GUARD_CEILING_USD;

    const { checkSpendCeiling } = requireGovernor();
    const result = checkSpendCeiling('sess-sg002');

    assert.equal(result.downgrade, true, 'Should downgrade at $5.50 with $5.00 ceiling');
    assert.equal(result.suggestedModel, 'haiku', 'Should suggest haiku model');
  });

  // -------------------------------------------------------------------------
  // SG-003: configurable via SPEND_GUARD_CEILING_USD env var
  // -------------------------------------------------------------------------
  it('SG-003: SPEND_GUARD_CEILING_USD configures the ceiling', () => {
    const statusFile = writeCcusageStatus(3.0, tmpDir);
    process.env.SPEND_GUARD_STATUS_FILE = statusFile;
    process.env.SPEND_GUARD_CEILING_USD = '2.0';

    const { checkSpendCeiling } = requireGovernor();
    const result = checkSpendCeiling('sess-sg003');

    assert.equal(result.downgrade, true, 'Should downgrade at $3.00 with custom $2.00 ceiling');
    assert.equal(result.suggestedModel, 'haiku', 'Should suggest haiku when over custom ceiling');

    // Verify default ceiling (5.0) would NOT trigger
    process.env.SPEND_GUARD_CEILING_USD = '10.0';
    const resultHigh = checkSpendCeiling('sess-sg003b');
    assert.equal(resultHigh.downgrade, false, 'Should not downgrade at $3.00 with $10.00 ceiling');
  });

  // -------------------------------------------------------------------------
  // SG-004: fail-open — missing ccusage-status.txt → { downgrade: false }
  // -------------------------------------------------------------------------
  it('SG-004: missing ccusage-status.txt returns { downgrade: false } (fail-open)', () => {
    const nonExistentPath = path.join(tmpDir, 'runtime', 'ccusage-status.txt');
    process.env.SPEND_GUARD_STATUS_FILE = nonExistentPath;
    delete process.env.SPEND_GUARD_CEILING_USD;

    const { checkSpendCeiling } = requireGovernor();
    const result = checkSpendCeiling('sess-sg004');

    assert.equal(result.downgrade, false, 'Missing file should fail-open (no downgrade)');
    assert.ok(!result.suggestedModel, 'No suggestedModel when failing open');
  });

  // -------------------------------------------------------------------------
  // SG-005: writes override hint to spend-guard-override.json when downgrading
  // -------------------------------------------------------------------------
  it('SG-005: writes override hint to spend-guard-override.json when downgrade is true', () => {
    const statusFile = writeCcusageStatus(6.0, tmpDir);
    const runtimeDir = path.join(tmpDir, 'runtime');
    const overridePath = path.join(runtimeDir, 'spend-guard-override.json');

    process.env.SPEND_GUARD_STATUS_FILE = statusFile;
    process.env.SPEND_GUARD_OVERRIDE_FILE = overridePath;
    delete process.env.SPEND_GUARD_CEILING_USD;

    const { checkSpendCeiling } = requireGovernor();
    const result = checkSpendCeiling('sess-sg005');

    assert.equal(result.downgrade, true, 'Should downgrade at $6.00');
    assert.ok(fs.existsSync(overridePath), 'Override file should exist after downgrade');

    const raw = fs.readFileSync(overridePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.suggestedModel, 'haiku', 'Override file must contain suggestedModel');
    assert.ok(typeof parsed.sessionCostUsd === 'number', 'Override file must have sessionCostUsd');
    assert.ok(typeof parsed.ceilingUsd === 'number', 'Override file must have ceilingUsd');
    assert.ok(typeof parsed.timestamp === 'string', 'Override file must have timestamp');
  });
});
