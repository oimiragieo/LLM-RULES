'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  SEVERITY_LEVELS,
  BUG_CRITERIA,
  Finding,
  validateFinding,
  filterFindings,
} = require('../../.claude/lib/review/severity.cjs');

// ---------------------------------------------------------------------------
// SEVERITY_LEVELS
// ---------------------------------------------------------------------------

describe('SEVERITY_LEVELS', () => {
  it('defines exactly 4 severity levels', () => {
    assert.strictEqual(Object.keys(SEVERITY_LEVELS).length, 4);
  });

  it('P0 maps to critical', () => {
    assert.strictEqual(SEVERITY_LEVELS.P0, 'critical');
  });

  it('P1 maps to urgent', () => {
    assert.strictEqual(SEVERITY_LEVELS.P1, 'urgent');
  });

  it('P2 maps to normal', () => {
    assert.strictEqual(SEVERITY_LEVELS.P2, 'normal');
  });

  it('P3 maps to nice-to-have', () => {
    assert.strictEqual(SEVERITY_LEVELS.P3, 'nice-to-have');
  });
});

// ---------------------------------------------------------------------------
// BUG_CRITERIA
// ---------------------------------------------------------------------------

describe('BUG_CRITERIA', () => {
  it('is an array', () => {
    assert.ok(Array.isArray(BUG_CRITERIA));
  });

  it('contains exactly 8 criteria', () => {
    assert.strictEqual(BUG_CRITERIA.length, 8);
  });

  it('includes meaningful_impact', () => {
    assert.ok(BUG_CRITERIA.includes('meaningful_impact'));
  });

  it('includes discrete_actionable', () => {
    assert.ok(BUG_CRITERIA.includes('discrete_actionable'));
  });

  it('includes appropriate_rigor', () => {
    assert.ok(BUG_CRITERIA.includes('appropriate_rigor'));
  });

  it('includes introduced_in_changes', () => {
    assert.ok(BUG_CRITERIA.includes('introduced_in_changes'));
  });

  it('includes worth_fixing', () => {
    assert.ok(BUG_CRITERIA.includes('worth_fixing'));
  });

  it('includes no_unstated_assumptions', () => {
    assert.ok(BUG_CRITERIA.includes('no_unstated_assumptions'));
  });

  it('includes provably_affected', () => {
    assert.ok(BUG_CRITERIA.includes('provably_affected'));
  });

  it('includes not_intentional', () => {
    assert.ok(BUG_CRITERIA.includes('not_intentional'));
  });
});

// ---------------------------------------------------------------------------
// Finding class
// ---------------------------------------------------------------------------

describe('Finding', () => {
  it('can be instantiated with required fields', () => {
    const f = new Finding({
      title: 'Null pointer dereference',
      explanation: 'The code dereferences a potentially null pointer.',
      file: 'src/foo.js',
      lineStart: 10,
      lineEnd: 12,
      priority: 'P0',
      suggestedFix: 'Add a null check before dereferencing.',
      criteriaResults: {},
    });
    assert.ok(f instanceof Finding);
  });

  it('stores all provided fields', () => {
    const criteriaResults = { meaningful_impact: true };
    const f = new Finding({
      title: 'Off-by-one error',
      explanation: 'Loop runs one iteration too many.',
      file: 'src/loop.js',
      lineStart: 5,
      lineEnd: 5,
      priority: 'P1',
      suggestedFix: 'Change < to <=.',
      criteriaResults,
    });
    assert.strictEqual(f.title, 'Off-by-one error');
    assert.strictEqual(f.explanation, 'Loop runs one iteration too many.');
    assert.strictEqual(f.file, 'src/loop.js');
    assert.strictEqual(f.lineStart, 5);
    assert.strictEqual(f.lineEnd, 5);
    assert.strictEqual(f.priority, 'P1');
    assert.strictEqual(f.suggestedFix, 'Change < to <=.');
    assert.deepEqual(f.criteriaResults, criteriaResults);
  });

  it('defaults criteriaResults to empty object when not provided', () => {
    const f = new Finding({
      title: 'A finding',
      explanation: 'Some explanation',
      file: 'src/a.js',
      lineStart: 1,
      lineEnd: 1,
      priority: 'P2',
    });
    assert.deepEqual(f.criteriaResults, {});
  });
});

// ---------------------------------------------------------------------------
// validateFinding
// ---------------------------------------------------------------------------

describe('validateFinding', () => {
  /** Build a fully-valid finding with all 8 criteria set to true. */
  function makeValidFinding(overrides = {}) {
    const criteriaResults = {};
    for (const c of BUG_CRITERIA) {
      criteriaResults[c] = true;
    }
    return new Finding({
      title: 'Valid finding title',
      explanation: 'A clear explanation.',
      file: 'src/file.js',
      lineStart: 1,
      lineEnd: 2,
      priority: 'P1',
      suggestedFix: 'Fix it.',
      criteriaResults,
      ...overrides,
    });
  }

  it('returns valid:true for a fully-valid finding', () => {
    const result = validateFinding(makeValidFinding());
    assert.strictEqual(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects title longer than 80 characters', () => {
    const f = makeValidFinding({ title: 'A'.repeat(81) });
    const result = validateFinding(f);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('title')));
  });

  it('accepts title of exactly 80 characters', () => {
    const f = makeValidFinding({ title: 'A'.repeat(80) });
    const result = validateFinding(f);
    assert.strictEqual(result.valid, true);
  });

  it('rejects missing title', () => {
    const f = makeValidFinding({ title: '' });
    const result = validateFinding(f);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('title')));
  });

  it('rejects invalid priority', () => {
    const f = makeValidFinding({ priority: 'P9' });
    const result = validateFinding(f);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('priority')));
  });

  it('accepts all valid priorities: P0, P1, P2, P3', () => {
    for (const p of ['P0', 'P1', 'P2', 'P3']) {
      const f = makeValidFinding({ priority: p });
      const result = validateFinding(f);
      assert.strictEqual(result.valid, true, `Priority ${p} should be valid`);
    }
  });

  it('rejects missing priority', () => {
    const f = makeValidFinding({ priority: undefined });
    const result = validateFinding(f);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('priority')));
  });

  it('rejects finding missing a criterion in criteriaResults', () => {
    const criteriaResults = {};
    for (const c of BUG_CRITERIA) {
      criteriaResults[c] = true;
    }
    // Remove one criterion
    delete criteriaResults['meaningful_impact'];
    const f = makeValidFinding({ criteriaResults });
    const result = validateFinding(f);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('meaningful_impact')));
  });

  it('reports all missing criteria when criteriaResults is empty', () => {
    const f = makeValidFinding({ criteriaResults: {} });
    const result = validateFinding(f);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors.length, BUG_CRITERIA.length);
  });

  it('returns errors array even when valid', () => {
    const result = validateFinding(makeValidFinding());
    assert.ok(Array.isArray(result.errors));
  });
});

// ---------------------------------------------------------------------------
// filterFindings
// ---------------------------------------------------------------------------

describe('filterFindings', () => {
  /** Build a Finding with all 8 criteria set to the given boolean value. */
  function makeFinding(allPass, overrideCriteria = {}) {
    const criteriaResults = {};
    for (const c of BUG_CRITERIA) {
      criteriaResults[c] = allPass;
    }
    Object.assign(criteriaResults, overrideCriteria);
    return new Finding({
      title: 'Test finding',
      explanation: 'Explanation.',
      file: 'src/test.js',
      lineStart: 1,
      lineEnd: 1,
      priority: 'P2',
      suggestedFix: 'Fix it.',
      criteriaResults,
    });
  }

  it('returns empty array for empty input', () => {
    assert.deepEqual(filterFindings([]), []);
  });

  it('retains a candidate where all 8 criteria pass', () => {
    const passing = makeFinding(true);
    const result = filterFindings([passing]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], passing);
  });

  it('removes a candidate where any criterion is false', () => {
    const failing = makeFinding(true, { meaningful_impact: false });
    const result = filterFindings([failing]);
    assert.deepEqual(result, []);
  });

  it('removes a candidate where criteriaResults has a missing criterion', () => {
    const criteriaResults = {};
    for (const c of BUG_CRITERIA) {
      criteriaResults[c] = true;
    }
    delete criteriaResults['not_intentional'];
    const incomplete = new Finding({
      title: 'Missing criterion',
      explanation: 'Missing not_intentional.',
      file: 'src/x.js',
      lineStart: 1,
      lineEnd: 1,
      priority: 'P1',
      criteriaResults,
    });
    const result = filterFindings([incomplete]);
    assert.deepEqual(result, []);
  });

  it('filters mixed list: keeps passing, removes failing', () => {
    const passing = makeFinding(true);
    const failing = makeFinding(true, { worth_fixing: false });
    const result = filterFindings([passing, failing]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], passing);
  });

  it('removes candidate with all criteria false', () => {
    const allFalse = makeFinding(false);
    const result = filterFindings([allFalse]);
    assert.deepEqual(result, []);
  });

  it('retains all candidates when all pass', () => {
    const a = makeFinding(true);
    const b = makeFinding(true);
    const result = filterFindings([a, b]);
    assert.strictEqual(result.length, 2);
  });

  it('all 8 criteria must be true — checks every criterion individually', () => {
    // For each criterion, create a candidate that fails only that one
    for (const failingCriterion of BUG_CRITERIA) {
      const overrides = { [failingCriterion]: false };
      const candidate = makeFinding(true, overrides);
      const result = filterFindings([candidate]);
      assert.deepEqual(
        result,
        [],
        `Candidate failing criterion "${failingCriterion}" should be removed`
      );
    }
  });
});
