/**
 * @file tests/validation/skill-provenance.test.cjs
 * @description TDD tests for SKILL.md provenance field validation
 *
 * Validates ArXiv [2504.19951] + [2602.14798] against tool-squatting:
 * - Every SKILL.md must declare its origin (source)
 * - Every SKILL.md must carry a trust score [0,100]
 * - Every SKILL.md must carry a content fingerprint (provenance_sha)
 *
 * Test Coverage:
 * - Test 1: Missing `source` field fails validation
 * - Test 2: Missing `trust_score` field fails validation
 * - Test 3: Missing `provenance_sha` field fails validation
 * - Test 4: trust_score out of range [0,100] fails
 * - Test 5: `source` must be one of builtin|community|plugin|external
 * - Test 6: Happy path — all fields present and valid passes
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateSkillProvenance,
  VALID_SOURCES,
} = require('../../.claude/lib/validation/skill-provenance.cjs');

describe('Skill Provenance Validation', () => {
  // Minimal valid frontmatter object used as a baseline
  const validFrontmatter = {
    name: 'test-skill',
    description: 'A test skill',
    source: 'builtin',
    trust_score: 100,
    provenance_sha: 'a1b2c3d4e5f67890',
  };

  test('Test 1: SKILL.md without source field fails validation', () => {
    const { source: _omitted, ...fm } = validFrontmatter;
    const result = validateSkillProvenance(fm, 'test-skill/SKILL.md');

    assert.strictEqual(result.valid, false, 'Expected validation to fail when source is missing');
    assert.ok(
      result.errors.some(e => e.includes('source')),
      `Expected error mentioning "source", got: ${JSON.stringify(result.errors)}`
    );
  });

  test('Test 2: SKILL.md without trust_score field fails validation', () => {
    const { trust_score: _omitted, ...fm } = validFrontmatter;
    const result = validateSkillProvenance(fm, 'test-skill/SKILL.md');

    assert.strictEqual(
      result.valid,
      false,
      'Expected validation to fail when trust_score is missing'
    );
    assert.ok(
      result.errors.some(e => e.includes('trust_score')),
      `Expected error mentioning "trust_score", got: ${JSON.stringify(result.errors)}`
    );
  });

  test('Test 3: SKILL.md without provenance_sha field fails validation', () => {
    const { provenance_sha: _omitted, ...fm } = validFrontmatter;
    const result = validateSkillProvenance(fm, 'test-skill/SKILL.md');

    assert.strictEqual(
      result.valid,
      false,
      'Expected validation to fail when provenance_sha is missing'
    );
    assert.ok(
      result.errors.some(e => e.includes('provenance_sha')),
      `Expected error mentioning "provenance_sha", got: ${JSON.stringify(result.errors)}`
    );
  });

  test('Test 4: trust_score out of range [0,100] fails validation', () => {
    const tooHigh = { ...validFrontmatter, trust_score: 101 };
    const resultHigh = validateSkillProvenance(tooHigh, 'test-skill/SKILL.md');
    assert.strictEqual(resultHigh.valid, false, 'Expected failure for trust_score > 100');
    assert.ok(
      resultHigh.errors.some(e => e.includes('trust_score')),
      `Expected error mentioning "trust_score" for 101, got: ${JSON.stringify(resultHigh.errors)}`
    );

    const tooLow = { ...validFrontmatter, trust_score: -1 };
    const resultLow = validateSkillProvenance(tooLow, 'test-skill/SKILL.md');
    assert.strictEqual(resultLow.valid, false, 'Expected failure for trust_score < 0');
    assert.ok(
      resultLow.errors.some(e => e.includes('trust_score')),
      `Expected error mentioning "trust_score" for -1, got: ${JSON.stringify(resultLow.errors)}`
    );
  });

  test('Test 5: source must be one of builtin|community|plugin|external', () => {
    const bad = { ...validFrontmatter, source: 'unknown' };
    const result = validateSkillProvenance(bad, 'test-skill/SKILL.md');

    assert.strictEqual(result.valid, false, 'Expected failure for invalid source value');
    assert.ok(
      result.errors.some(e => e.includes('source')),
      `Expected error mentioning "source", got: ${JSON.stringify(result.errors)}`
    );

    // All valid values must pass
    for (const src of VALID_SOURCES) {
      const good = { ...validFrontmatter, source: src };
      const r = validateSkillProvenance(good, 'test-skill/SKILL.md');
      assert.strictEqual(
        r.valid,
        true,
        `Expected valid for source="${src}", got errors: ${JSON.stringify(r.errors)}`
      );
    }
  });

  test('Test 6: happy path — all fields present and valid passes', () => {
    const result = validateSkillProvenance(validFrontmatter, 'test-skill/SKILL.md');

    assert.strictEqual(
      result.valid,
      true,
      `Expected validation to pass, got errors: ${JSON.stringify(result.errors)}`
    );
    assert.deepStrictEqual(result.errors, [], 'Expected zero errors on valid frontmatter');
  });
});
