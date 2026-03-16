'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { scoreImportance } = require('../../../.claude/lib/memory/importance-scorer.cjs');

describe('scoreImportance — security/vulnerability domain', () => {
  it('scores "authentication bypass vulnerability" in security area >= 0.8', () => {
    const score = scoreImportance('authentication bypass vulnerability', 'security');
    assert.ok(score >= 0.8, `Expected >= 0.8, got ${score}`);
  });

  it('scores XSS injection attack text high', () => {
    const score = scoreImportance('XSS injection attack vector found in form handler', 'security');
    assert.ok(score >= 0.7, `Expected >= 0.7, got ${score}`);
  });

  it('security area booster raises score', () => {
    const withArea = scoreImportance('some vulnerability found here', 'security');
    const withoutArea = scoreImportance('some vulnerability found here');
    assert.ok(withArea >= withoutArea, 'Security area should boost score');
  });
});

describe('scoreImportance — architecture/ADR domain', () => {
  it('scores "ADR-120 architecture decision" in architecture area >= 0.8', () => {
    const score = scoreImportance('ADR-120 architecture decision', 'architecture');
    assert.ok(score >= 0.8, `Expected >= 0.8, got ${score}`);
  });

  it('architecture area booster raises score', () => {
    const withArea = scoreImportance('breaking-change introduced in API', 'architecture');
    const withoutArea = scoreImportance('breaking-change introduced in API');
    assert.ok(withArea >= withoutArea, 'Architecture area should boost score');
  });
});

describe('scoreImportance — mid-range general text', () => {
  it('scores "learned about file paths" in general area between 0.4 and 0.7', () => {
    const score = scoreImportance('learned about file paths', 'general');
    assert.ok(score >= 0.4 && score <= 0.7, `Expected 0.4-0.7, got ${score}`);
  });

  it('scores neutral informational text around 0.5', () => {
    const score = scoreImportance('The function returns a boolean value when called');
    assert.ok(score >= 0.3 && score <= 0.7, `Expected 0.3-0.7, got ${score}`);
  });
});

describe('scoreImportance — low importance style/formatting text', () => {
  it('scores "fix whitespace formatting" in style area between 0.1 and 0.3', () => {
    const score = scoreImportance('fix whitespace formatting', 'style');
    assert.ok(score >= 0.1 && score <= 0.3, `Expected 0.1-0.3, got ${score}`);
  });

  it('scores pure formatting/cosmetic text low', () => {
    const score = scoreImportance('fixed indentation and spacing in the file');
    assert.ok(score <= 0.5, `Expected <= 0.5, got ${score}`);
  });

  it('style area does not boost score', () => {
    const withStyle = scoreImportance('whitespace typo cosmetic', 'style');
    assert.ok(withStyle <= 0.5, `Style area text should stay low, got ${withStyle}`);
  });
});

describe('scoreImportance — defaults and edge cases', () => {
  it('returns 0.5 for random unclassifiable text with no area', () => {
    const score = scoreImportance('random unclassifiable text');
    // Base score without any keyword matches is 0.5
    assert.equal(score, 0.5);
  });

  it('returns 0.5 for empty string', () => {
    const score = scoreImportance('');
    assert.equal(score, 0.5);
  });

  it('clamps result to minimum 0.1', () => {
    // Pile up low keywords
    const score = scoreImportance('whitespace formatting style typo cosmetic indentation spacing');
    assert.ok(score >= 0.1, `Score must be >= 0.1, got ${score}`);
  });

  it('clamps result to maximum 1.0', () => {
    // Pile up high keywords
    const score = scoreImportance(
      'security authentication XSS injection ADR architecture breaking-change critical vulnerability exploit'
    );
    assert.ok(score <= 1.0, `Score must be <= 1.0, got ${score}`);
  });

  it('completes in under 5ms (performance gate)', () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      scoreImportance('authentication bypass vulnerability critical security exploit', 'security');
    }
    const elapsed = Date.now() - start;
    // 100 iterations in <500ms means each call is <5ms
    assert.ok(elapsed < 500, `100 calls took ${elapsed}ms (should be <500ms for <5ms each)`);
  });

  it('returns a number between 0.0 and 1.0', () => {
    const score = scoreImportance('some text about something', 'general');
    assert.ok(typeof score === 'number', 'score must be a number');
    assert.ok(score >= 0.0 && score <= 1.0, `score must be in [0,1], got ${score}`);
  });

  it('is case-insensitive for keyword matching', () => {
    const lower = scoreImportance('authentication vulnerability found');
    const upper = scoreImportance('AUTHENTICATION VULNERABILITY FOUND');
    assert.equal(lower, upper, 'Keyword matching should be case-insensitive');
  });
});
