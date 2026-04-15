'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateScoreGate,
  computeScoreGate,
  validateFixedSections,
  applyPreservingFixedSections,
} = require('../../.claude/skills/agent-updater/scripts/main.cjs');

describe('evaluateScoreGate', () => {
  it('returns ALLOW with no warning when post equals pre', () => {
    const result = evaluateScoreGate(50, 50);
    assert.equal(result.allowed, true);
    assert.equal(result.warning, null);
    assert.equal(result.pre, 50);
    assert.equal(result.post, 50);
  });

  it('returns ALLOW with no warning when post is higher', () => {
    const result = evaluateScoreGate(50, 55);
    assert.equal(result.allowed, true);
    assert.equal(result.warning, null);
  });

  it('returns ALLOW with WARNING when drop is 1-2', () => {
    const r1 = evaluateScoreGate(50, 49);
    assert.equal(r1.allowed, true);
    assert.ok(r1.warning && r1.warning.includes('WARNING'));

    const r2 = evaluateScoreGate(50, 48);
    assert.equal(r2.allowed, true);
    assert.ok(r2.warning && r2.warning.includes('WARNING'));
  });

  it('returns BLOCK when drop exceeds 2', () => {
    const result = evaluateScoreGate(50, 47);
    assert.equal(result.allowed, false);
    assert.ok(result.warning && result.warning.includes('BLOCKED'));
  });

  it('skips gate when pre or post is negative', () => {
    const r1 = evaluateScoreGate(-1, 50);
    assert.equal(r1.allowed, true);
    assert.ok(r1.warning && r1.warning.includes('skipped'));

    const r2 = evaluateScoreGate(50, -1);
    assert.equal(r2.allowed, true);
    assert.ok(r2.warning && r2.warning.includes('skipped'));
  });
});

describe('module exports', () => {
  it('exports computeScoreGate as a function', () => {
    assert.equal(typeof computeScoreGate, 'function');
  });

  it('exports validateFixedSections as a function', () => {
    assert.equal(typeof validateFixedSections, 'function');
  });

  it('exports applyPreservingFixedSections as a function', () => {
    assert.equal(typeof applyPreservingFixedSections, 'function');
  });
});
