'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateCompression,
  validateEvidence,
  COMPRESSION_RATIO_MIN,
  COMPRESSION_RATIO_MAX,
  EVIDENCE_THRESHOLD,
} = require('../../.claude/lib/metrics/distillator-validator.cjs');

// ─── Constants ──────────────────────────────────────────────────────────────

describe('constants', () => {
  it('COMPRESSION_RATIO_MIN is 0.1 (10% minimum reduction)', () => {
    assert.equal(COMPRESSION_RATIO_MIN, 0.1);
  });

  it('COMPRESSION_RATIO_MAX is 0.95 (95% maximum reduction)', () => {
    assert.equal(COMPRESSION_RATIO_MAX, 0.95);
  });

  it('EVIDENCE_THRESHOLD is 0.6', () => {
    assert.equal(EVIDENCE_THRESHOLD, 0.6);
  });
});

// ─── validateCompression ────────────────────────────────────────────────────

describe('validateCompression', () => {
  it('passes for valid compression within bounds', () => {
    const original = 'a'.repeat(1000);
    const compressed = 'a'.repeat(300); // 70% reduction
    const result = validateCompression(original, compressed);
    assert.equal(result.valid, true);
    assert.ok(result.ratio > 0 && result.ratio < 1);
  });

  it('fails when compressed is larger than original', () => {
    const original = 'short';
    const compressed = 'much longer output than original input';
    const result = validateCompression(original, compressed);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('larger'));
  });

  it('fails when compression ratio below minimum (too little reduction)', () => {
    const original = 'a'.repeat(100);
    const compressed = 'a'.repeat(95); // only 5% reduction
    const result = validateCompression(original, compressed);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('ratio'));
  });

  it('fails when compression ratio above maximum (too much reduction)', () => {
    const original = 'a'.repeat(1000);
    const compressed = 'a'; // 99.9% reduction
    const result = validateCompression(original, compressed);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes('ratio'));
  });

  it('returns ratio in result', () => {
    const original = 'a'.repeat(1000);
    const compressed = 'a'.repeat(500);
    const result = validateCompression(original, compressed);
    assert.ok(Math.abs(result.ratio - 0.5) < 0.01);
  });

  it('handles empty original gracefully', () => {
    const result = validateCompression('', 'something');
    assert.equal(result.valid, false);
  });

  it('handles empty compressed gracefully', () => {
    const result = validateCompression('some content', '');
    assert.equal(result.valid, false);
  });

  it('handles null/undefined inputs', () => {
    assert.equal(validateCompression(null, 'x').valid, false);
    assert.equal(validateCompression('x', null).valid, false);
    assert.equal(validateCompression(null, null).valid, false);
  });
});

// ─── validateEvidence ───────────────────────────────────────────────────────

describe('validateEvidence', () => {
  it('passes when key terms are preserved', () => {
    const original = 'The JWT authentication middleware validates tokens using RSA256';
    const compressed = 'JWT authentication middleware: RSA256 token validation';
    const query = 'authentication JWT RSA256';
    const result = validateEvidence(original, compressed, query);
    assert.equal(result.valid, true);
  });

  it('fails when key terms are lost', () => {
    const original =
      'The JWT authentication middleware validates tokens using RSA256. Redis stores the blocklist.';
    const compressed = 'Some generic summary without any specific terms';
    const query = 'JWT authentication RSA256 Redis';
    const result = validateEvidence(original, compressed, query);
    assert.equal(result.valid, false);
  });

  it('returns preservedTerms and missingTerms', () => {
    const original = 'React component uses useState and useEffect hooks';
    const compressed = 'React component with useState hook';
    const query = 'React useState useEffect';
    const result = validateEvidence(original, compressed, query);
    assert.ok(Array.isArray(result.preservedTerms));
    assert.ok(Array.isArray(result.missingTerms));
  });

  it('handles empty query gracefully', () => {
    const result = validateEvidence('original', 'compressed', '');
    assert.equal(result.valid, true); // no terms to check
  });

  it('handles null inputs', () => {
    assert.equal(validateEvidence(null, 'x', 'q').valid, false);
    assert.equal(validateEvidence('x', null, 'q').valid, false);
  });

  it('case-insensitive term matching', () => {
    const original = 'JWT Token Validation';
    const compressed = 'jwt token validation';
    const query = 'JWT token';
    const result = validateEvidence(original, compressed, query);
    assert.equal(result.valid, true);
  });

  it('returns score between 0 and 1', () => {
    const result = validateEvidence(
      'original text with terms',
      'compressed text with some terms',
      'terms text'
    );
    assert.ok(result.score >= 0 && result.score <= 1);
  });
});
