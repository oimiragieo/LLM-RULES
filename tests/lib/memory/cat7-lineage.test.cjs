#!/usr/bin/env node
/**
 * CAT7 Lineage Query API Tests — Slice S2
 * =========================================
 * Tests for cat7-lineage.cjs: agent-to-agent lineage chain query API.
 *
 * Covers:
 *   1. recordLineage(recordId, predecessorId) appends to lineage array
 *   2. traceLineage(recordId) walks backward following predecessor chain
 *   3. Circular lineage (A→B→A) is detected and returns an error
 *   4. Missing predecessor → warning (not crash), returns partial chain
 *   5. findDescendants(recordId) scans memory tiers for referencing records
 *   6. Cross-tier lineage (STM record references LTM predecessor) validates
 *
 * Test runner: node --test
 * Run: node --test tests/lib/memory/cat7-lineage.test.cjs
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Paths ──────────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CAT7_LINEAGE = path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'cat7-lineage.cjs');
const CAT7_WRITER = path.join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'cat7-writer.cjs');

// ── Test helpers ───────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

function freshRequire(modPath) {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

/** Create a minimal CAT7 record and write it to a temp dir tier subdirectory. */
function makeRecord(id, lineage, confidence, baseDir) {
  const { createRecord, writeRecord } = freshRequire(CAT7_WRITER);
  const record = createRecord({
    id,
    concept: `concept-${id}`,
    lineage,
    confidence,
    provenance: { source_agent_id: `agent-${id}`, source_session_id: null, trigger: null },
  });
  writeRecord(record, baseDir);
  return record;
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('\nCAT7 Lineage Query API Tests');
console.log('==============================');

// ── Test 1: recordLineage appends predecessor to lineage array ────────────
test('Test 1: recordLineage(recordId, predecessorId) appends to lineage array', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat7-lineage-t1-'));
  try {
    // Arrange: write two records — predecessor A, descendant B (empty lineage)
    makeRecord('record-A', [], 0.9, tmpDir);
    makeRecord('record-B', [], 0.9, tmpDir);

    const { recordLineage } = freshRequire(CAT7_LINEAGE);

    // Act: record B is derived from A
    recordLineage('record-B', 'record-A', tmpDir);

    // Assert: B's lineage now contains A
    const { readRecord } = freshRequire(CAT7_WRITER);
    const tier = 'ltm'; // confidence=0.9 → LTM
    const bPath = path.join(tmpDir, tier, 'record-B.json');
    const updated = readRecord(bPath);
    assert.ok(
      Array.isArray(updated.lineage) && updated.lineage.includes('record-A'),
      `Expected lineage to contain 'record-A', got: ${JSON.stringify(updated.lineage)}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Test 2: traceLineage walks backward following predecessor chain ────────
test('Test 2: traceLineage(recordId) walks backward following predecessor chain', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat7-lineage-t2-'));
  try {
    // Arrange: A ← B ← C (C's lineage: [B], B's lineage: [A])
    makeRecord('lA', [], 0.9, tmpDir);
    makeRecord('lB', ['lA'], 0.9, tmpDir);
    makeRecord('lC', ['lB'], 0.9, tmpDir);

    const { traceLineage } = freshRequire(CAT7_LINEAGE);

    // Act
    const chain = traceLineage('lC', tmpDir);

    // Assert: chain is [lC, lB, lA] (root last) or [lA, lB, lC] (root first) — defined by API
    assert.ok(Array.isArray(chain), 'traceLineage must return an array');
    // All three IDs must appear in the chain
    const ids = chain.map(r => (typeof r === 'string' ? r : r.id));
    assert.ok(ids.includes('lC'), 'Chain must include lC');
    assert.ok(ids.includes('lB'), 'Chain must include lB');
    assert.ok(ids.includes('lA'), 'Chain must include lA');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Test 3: Circular lineage detected and throws ──────────────────────────
test('Test 3: circular lineage (A→B→A) is detected and returns an error', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat7-lineage-t3-'));
  try {
    // Arrange: cA lineage→cB, cB lineage→cA (circular)
    makeRecord('cA', ['cB'], 0.9, tmpDir);
    makeRecord('cB', ['cA'], 0.9, tmpDir);

    const { traceLineage } = freshRequire(CAT7_LINEAGE);

    // Act + Assert: must throw or return an error-bearing object
    let threw = false;
    let errorResult = null;
    try {
      errorResult = traceLineage('cA', tmpDir);
    } catch (err) {
      threw = true;
      assert.ok(
        err.message.toLowerCase().includes('circular') ||
          err.message.toLowerCase().includes('cycle'),
        `Expected 'circular' or 'cycle' in error, got: ${err.message}`
      );
    }

    if (!threw) {
      // Alternative: function returns object with error field instead of throwing
      assert.ok(
        errorResult && (errorResult.error || errorResult.circular),
        'traceLineage must detect circular lineage: no error thrown and no .error/.circular field'
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Test 4: Missing predecessor → warning, returns partial chain ──────────
test('Test 4: missing predecessor → warning (not crash), returns partial chain', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat7-lineage-t4-'));
  try {
    // Arrange: mB references mA, but mA does not exist on disk
    makeRecord('mB', ['mA-missing'], 0.9, tmpDir);

    const { traceLineage } = freshRequire(CAT7_LINEAGE);

    // Act: must NOT throw — should return partial chain
    let result;
    assert.doesNotThrow(() => {
      result = traceLineage('mB', tmpDir);
    }, 'traceLineage must not throw when predecessor is missing');

    // Assert: partial chain (at least the start record) is returned
    assert.ok(Array.isArray(result), 'traceLineage must return an array even for partial chains');
    const ids = result.map(r => (typeof r === 'string' ? r : r.id));
    assert.ok(ids.includes('mB'), 'Partial chain must include the start record mB');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Test 5: findDescendants scans tiers for records that reference a given ID ─
test('Test 5: findDescendants(recordId) scans memory tiers for records referencing this one', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat7-lineage-t5-'));
  try {
    // Arrange: root R; child1 and child2 both list R in their lineage; unrelated U does not
    makeRecord('root-R', [], 0.9, tmpDir); // LTM
    makeRecord('child1', ['root-R'], 0.9, tmpDir); // LTM, references root-R
    makeRecord('child2', ['root-R', 'other'], 0.9, tmpDir); // LTM, references root-R
    makeRecord('unrelated-U', ['some-other'], 0.9, tmpDir); // LTM, no root-R ref

    const { findDescendants } = freshRequire(CAT7_LINEAGE);

    // Act
    const descendants = findDescendants('root-R', tmpDir);

    // Assert
    assert.ok(Array.isArray(descendants), 'findDescendants must return an array');
    const ids = descendants.map(r => (typeof r === 'string' ? r : r.id));
    assert.ok(ids.includes('child1'), 'Descendants must include child1');
    assert.ok(ids.includes('child2'), 'Descendants must include child2');
    assert.ok(!ids.includes('unrelated-U'), 'Descendants must NOT include unrelated-U');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Test 6: Cross-tier lineage (STM → LTM) validates ─────────────────────
test('Test 6: cross-tier lineage (STM record references LTM predecessor) validates', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat7-lineage-t6-'));
  try {
    // Arrange: ltmRoot in LTM (confidence=0.9), stmChild in STM (confidence=0.2),
    //          stmChild references ltmRoot in its lineage
    makeRecord('ltmRoot', [], 0.9, tmpDir); // written to ltm/
    makeRecord('stmChild', ['ltmRoot'], 0.2, tmpDir); // written to stm/

    const { traceLineage } = freshRequire(CAT7_LINEAGE);

    // Act: trace from stmChild — must cross tier boundary to find ltmRoot
    let chain;
    assert.doesNotThrow(() => {
      chain = traceLineage('stmChild', tmpDir);
    }, 'Cross-tier lineage trace must not throw');

    // Assert: ltmRoot is found even though it is in a different tier
    assert.ok(Array.isArray(chain), 'traceLineage must return an array');
    const ids = chain.map(r => (typeof r === 'string' ? r : r.id));
    assert.ok(ids.includes('stmChild'), 'Chain must include stmChild');
    assert.ok(ids.includes('ltmRoot'), 'Chain must cross tier boundary to find ltmRoot');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  process.exit(1);
}
