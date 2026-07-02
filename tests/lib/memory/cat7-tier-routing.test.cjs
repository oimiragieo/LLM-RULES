#!/usr/bin/env node
/**
 * CAT7 Memory Schema + Tier Routing Tests
 * =========================================
 * Covers:
 *   1. Minimal valid CAT7 record validates
 *   2. Missing required field (concept) fails
 *   3. confidence out of [0,1] fails
 *   4. lineage as array of string IDs validates
 *   5. Tier routing — STM/MTM/LTM based on confidence
 *   6. Round-trip write→read preserves all 7 fields
 *   7. invalid temporality (valid_until < valid_from) fails
 *
 * Test runner: node --test
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Paths ──────────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
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

// ── Fixtures ───────────────────────────────────────────────────────────────

function minimalRecord(overrides = {}) {
  const base = {
    id: 'test-id-001',
    concept: 'unit test concept',
    attributes: { source: 'test' },
    temporality: {
      created_at: '2026-04-20T00:00:00.000Z',
      valid_from: '2026-04-20T00:00:00.000Z',
      valid_until: null,
      last_accessed: null,
    },
    provenance: {
      source_agent_id: 'test-agent',
      source_session_id: 'sess-001',
      trigger: 'manual',
    },
    confidence: 0.85,
    lineage: [],
    embedding_refs: null,
  };
  return Object.assign({}, base, overrides);
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('\nCAT7 Memory Schema + Tier Routing Tests');
console.log('=========================================');

// ── Test 1: Minimal valid CAT7 record validates ────────────────────────────
test('Test 1: minimal valid CAT7 record validates', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const record = minimalRecord();
  const result = validateRecord(record);
  assert.strictEqual(
    result.valid,
    true,
    `Expected valid=true, got: ${JSON.stringify(result.errors)}`
  );
});

// ── Test 2: Missing required field (concept) fails ────────────────────────
test('Test 2: missing required field (concept) fails', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const record = minimalRecord();
  delete record.concept;
  const result = validateRecord(record);
  assert.strictEqual(result.valid, false, 'Expected valid=false when concept is missing');
  const hasConceptError = result.errors.some(e => e.includes('concept') || e.includes('required'));
  assert.ok(
    hasConceptError,
    `Expected error mentioning 'concept', got: ${JSON.stringify(result.errors)}`
  );
});

// ── Test 3: confidence out of [0,1] fails ─────────────────────────────────
test('Test 3: confidence out of [0,1] fails (negative)', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const record = minimalRecord({ confidence: -0.1 });
  const result = validateRecord(record);
  assert.strictEqual(result.valid, false, 'Expected valid=false for confidence < 0');
});

test('Test 3b: confidence out of [0,1] fails (>1)', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const record = minimalRecord({ confidence: 1.01 });
  const result = validateRecord(record);
  assert.strictEqual(result.valid, false, 'Expected valid=false for confidence > 1');
});

test('Test 3c: confidence at boundaries 0 and 1 is valid', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const r0 = minimalRecord({ confidence: 0 });
  const r1 = minimalRecord({ confidence: 1 });
  assert.strictEqual(validateRecord(r0).valid, true, 'confidence=0 should be valid');
  assert.strictEqual(validateRecord(r1).valid, true, 'confidence=1 should be valid');
});

// ── Test 4: lineage as array of string IDs validates ─────────────────────
test('Test 4: lineage as array of string IDs validates', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const record = minimalRecord({ lineage: ['parent-id-001', 'parent-id-002'] });
  const result = validateRecord(record);
  assert.strictEqual(
    result.valid,
    true,
    `lineage array should be valid: ${JSON.stringify(result.errors)}`
  );
});

test('Test 4b: lineage with non-string element fails', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const record = minimalRecord({ lineage: [123, 'valid-id'] });
  const result = validateRecord(record);
  assert.strictEqual(result.valid, false, 'lineage with numeric element should fail');
});

// ── Test 5: Tier routing ───────────────────────────────────────────────────
test('Test 5a: tier routing — confidence < 0.4 → STM', () => {
  const { routeToTier } = freshRequire(CAT7_WRITER);
  const record = minimalRecord({ confidence: 0.3 });
  const tier = routeToTier(record);
  assert.strictEqual(tier, 'stm', `Expected stm for confidence=0.3, got ${tier}`);
});

test('Test 5b: tier routing — confidence 0.4–0.79 → MTM', () => {
  const { routeToTier } = freshRequire(CAT7_WRITER);
  const r1 = minimalRecord({ confidence: 0.4 });
  const r2 = minimalRecord({ confidence: 0.79 });
  assert.strictEqual(routeToTier(r1), 'mtm', `Expected mtm for 0.4, got ${routeToTier(r1)}`);
  assert.strictEqual(routeToTier(r2), 'mtm', `Expected mtm for 0.79, got ${routeToTier(r2)}`);
});

test('Test 5c: tier routing — confidence >= 0.8 → LTM', () => {
  const { routeToTier } = freshRequire(CAT7_WRITER);
  const r1 = minimalRecord({ confidence: 0.8 });
  const r2 = minimalRecord({ confidence: 1.0 });
  assert.strictEqual(routeToTier(r1), 'ltm', `Expected ltm for 0.8, got ${routeToTier(r1)}`);
  assert.strictEqual(routeToTier(r2), 'ltm', `Expected ltm for 1.0, got ${routeToTier(r2)}`);
});

test('Test 5d: tier routing — missing/NaN confidence defaults to STM (not LTM)', () => {
  const { routeToTier } = freshRequire(CAT7_WRITER);
  const missing = minimalRecord();
  delete missing.confidence;
  assert.strictEqual(routeToTier(missing), 'stm', 'missing confidence must default to stm');
  assert.strictEqual(
    routeToTier(minimalRecord({ confidence: NaN })),
    'stm',
    'NaN confidence must default to stm'
  );
  assert.strictEqual(
    routeToTier(minimalRecord({ confidence: 'oops' })),
    'stm',
    'non-numeric confidence must default to stm'
  );
});

// ── Test 6: Round-trip write→read preserves all 7 fields ─────────────────
test('Test 6: round-trip write→read preserves all 7 fields', () => {
  const { writeRecord, readRecord } = freshRequire(CAT7_WRITER);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat7-test-'));
  try {
    const record = minimalRecord({
      id: 'roundtrip-001',
      concept: 'roundtrip concept',
      attributes: { key: 'value', num: 42 },
      lineage: ['ancestor-001'],
      embedding_refs: {
        model_name: 'all-minilm-l6-v2',
        vector_id: 'vec-001',
        checksum: 'abc123',
      },
    });

    const writePath = writeRecord(record, tmpDir);
    assert.ok(fs.existsSync(writePath), `Written file should exist at ${writePath}`);

    const loaded = readRecord(writePath);

    // Verify all 7 fields are preserved
    assert.strictEqual(loaded.concept, record.concept, 'concept preserved');
    assert.deepStrictEqual(loaded.attributes, record.attributes, 'attributes preserved');
    assert.deepStrictEqual(loaded.temporality, record.temporality, 'temporality preserved');
    assert.deepStrictEqual(loaded.provenance, record.provenance, 'provenance preserved');
    assert.strictEqual(loaded.confidence, record.confidence, 'confidence preserved');
    assert.deepStrictEqual(loaded.lineage, record.lineage, 'lineage preserved');
    assert.deepStrictEqual(
      loaded.embedding_refs,
      record.embedding_refs,
      'embedding_refs preserved'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Test 7: invalid temporality (valid_until < valid_from) fails ──────────
test('Test 7: invalid temporality (valid_until < valid_from) fails', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const record = minimalRecord();
  record.temporality.valid_from = '2026-04-20T12:00:00.000Z';
  record.temporality.valid_until = '2026-04-20T10:00:00.000Z'; // before valid_from
  const result = validateRecord(record);
  assert.strictEqual(result.valid, false, 'Expected valid=false when valid_until < valid_from');
});

// ── Test 8: embedding_refs accepts null ───────────────────────────────────
test('Test 8: embedding_refs accepts null without schema error', () => {
  const { validateRecord } = freshRequire(CAT7_WRITER);
  const record = minimalRecord({ embedding_refs: null });
  const result = validateRecord(record);
  assert.strictEqual(
    result.valid,
    true,
    `embedding_refs=null should be valid: ${JSON.stringify(result.errors)}`
  );
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\nResults: ${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  process.exit(1);
}
