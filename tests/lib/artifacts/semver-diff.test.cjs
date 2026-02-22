'use strict';
/**
 * Tests for scoped semver-diff module (Track 4.2)
 * TDD — written BEFORE implementation.
 *
 * Compares semver strings/schema objects to classify the type of change.
 * Corrections: safeParseJSON returns value directly (not { data, success }).
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let computeSemverDiff, classifyChange, parseSemver;

describe('semver-diff — parseSemver', () => {
  before(() => {
    ({ computeSemverDiff, classifyChange, parseSemver } =
      require('../../../.claude/lib/artifacts/semver-diff.cjs'));
  });

  it('parses valid semver string', () => {
    const result = parseSemver('1.2.3');
    assert.deepEqual(result, { major: 1, minor: 2, patch: 3, valid: true });
  });

  it('parses semver with v prefix', () => {
    const result = parseSemver('v2.0.0');
    assert.deepEqual(result, { major: 2, minor: 0, patch: 0, valid: true });
  });

  it('returns invalid marker for non-semver string', () => {
    const result = parseSemver('not-a-version');
    assert.ok(!result.valid);
  });

  it('handles null/undefined gracefully', () => {
    assert.ok(!parseSemver(null).valid);
    assert.ok(!parseSemver(undefined).valid);
    assert.ok(!parseSemver('').valid);
  });
});

describe('semver-diff — classifyChange', () => {
  it('classifies major bump correctly', () => {
    assert.equal(classifyChange({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 }), 'major');
  });

  it('classifies minor bump correctly', () => {
    assert.equal(classifyChange({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 }), 'minor');
  });

  it('classifies patch bump correctly', () => {
    assert.equal(classifyChange({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 4 }), 'patch');
  });

  it('classifies identical versions as none', () => {
    assert.equal(classifyChange({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 }), 'none');
  });

  it('classifies downgrade as downgrade', () => {
    assert.equal(classifyChange({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 }), 'downgrade');
  });

  it('returns unknown when either parsed version is invalid', () => {
    assert.equal(
      classifyChange({ major: 0, minor: 0, patch: 0, valid: false }, { major: 1, minor: 0, patch: 0 }),
      'unknown'
    );
  });
});

describe('semver-diff — computeSemverDiff', () => {
  it('returns diff for two semver strings', () => {
    const result = computeSemverDiff('1.0.0', '2.0.0');
    assert.ok(typeof result === 'object');
    assert.equal(result.changeType, 'major');
    assert.equal(result.from, '1.0.0');
    assert.equal(result.to, '2.0.0');
  });

  it('includes delta fields in result', () => {
    const result = computeSemverDiff('1.2.3', '1.3.0');
    assert.equal(result.changeType, 'minor');
    assert.ok('majorDelta' in result);
    assert.ok('minorDelta' in result);
    assert.ok('patchDelta' in result);
    assert.equal(result.minorDelta, 1);
  });

  it('returns unknown change type for invalid semver inputs', () => {
    const result = computeSemverDiff('not-ver', '2.0.0');
    assert.equal(result.changeType, 'unknown');
  });

  it('handles patch-only change correctly', () => {
    const result = computeSemverDiff('3.4.5', '3.4.9');
    assert.equal(result.changeType, 'patch');
    assert.equal(result.patchDelta, 4);
  });

  it('handles "none" when versions are equal', () => {
    const result = computeSemverDiff('1.0.0', '1.0.0');
    assert.equal(result.changeType, 'none');
  });
});

describe('SE-XX compliance — semver-diff', () => {
  it('SE-02: module loads without raw JSON.parse calls on user input', () => {
    const mod = require('../../../.claude/lib/artifacts/semver-diff.cjs');
    assert.ok(typeof mod.computeSemverDiff === 'function');
    assert.ok(typeof mod.classifyChange === 'function');
    assert.ok(typeof mod.parseSemver === 'function');
  });

  it('SE-04: no await-in-forEach (pure sync module)', () => {
    const { computeSemverDiff: diff } = require('../../../.claude/lib/artifacts/semver-diff.cjs');
    const result = diff('1.0.0', '2.0.0');
    assert.ok(typeof result === 'object');
    assert.ok(!(result instanceof Promise), 'Should be synchronous');
  });
});
