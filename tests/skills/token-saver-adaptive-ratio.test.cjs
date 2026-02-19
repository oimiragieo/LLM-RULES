#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeAdaptiveRatio,
} = require('../../.claude/skills/token-saver-context-compression/scripts/main.cjs');

test('returns 0.8 for corpus <8K tokens', () => {
  assert.equal(computeAdaptiveRatio(0), 0.8);
  assert.equal(computeAdaptiveRatio(100), 0.8);
  assert.equal(computeAdaptiveRatio(7999), 0.8);
});

test('returns 0.5 for corpus 8-32K tokens', () => {
  assert.equal(computeAdaptiveRatio(8001), 0.5);
  assert.equal(computeAdaptiveRatio(20000), 0.5);
  assert.equal(computeAdaptiveRatio(31999), 0.5);
});

test('returns 0.2 for corpus 32-100K tokens', () => {
  assert.equal(computeAdaptiveRatio(32001), 0.2);
  assert.equal(computeAdaptiveRatio(50000), 0.2);
  assert.equal(computeAdaptiveRatio(99999), 0.2);
});

test('returns 0.1 for corpus >100K tokens', () => {
  assert.equal(computeAdaptiveRatio(100000), 0.1);
  assert.equal(computeAdaptiveRatio(200000), 0.1);
  assert.equal(computeAdaptiveRatio(1000000), 0.1);
});

test('boundary: 8000 tokens returns 0.5', () => {
  assert.equal(computeAdaptiveRatio(8000), 0.5);
});

test('boundary: 32000 tokens returns 0.2', () => {
  assert.equal(computeAdaptiveRatio(32000), 0.2);
});
