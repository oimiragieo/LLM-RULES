#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeScoreGate, evaluateScoreGate } = require('../../.claude/skills/agent-updater/scripts/main.cjs');

// ---------------------------------------------------------------------------
// evaluateScoreGate — unit tests with mock inputs (no pnpm test:framework run)
// ---------------------------------------------------------------------------

test('evaluateScoreGate: ALLOW when post count equals pre count', () => {
  const result = evaluateScoreGate(50, 50);
  assert.equal(result.allowed, true);
  assert.equal(result.warning, null);
  assert.equal(result.pre, 50);
  assert.equal(result.post, 50);
});

test('evaluateScoreGate: ALLOW when post count is higher than pre count', () => {
  const result = evaluateScoreGate(40, 45);
  assert.equal(result.allowed, true);
  assert.equal(result.warning, null);
  assert.equal(result.pre, 40);
  assert.equal(result.post, 45);
});

test('evaluateScoreGate: ALLOW with soft warning when count drops by exactly 1', () => {
  const result = evaluateScoreGate(50, 49);
  assert.equal(result.allowed, true);
  assert.ok(result.warning, 'expected a warning string');
  assert.match(result.warning, /WARNING/i);
});

test('evaluateScoreGate: ALLOW with soft warning when count drops by exactly 2', () => {
  const result = evaluateScoreGate(50, 48);
  assert.equal(result.allowed, true);
  assert.ok(result.warning, 'expected a warning string');
  assert.match(result.warning, /WARNING/i);
});

test('evaluateScoreGate: BLOCK when count drops by more than 2', () => {
  const result = evaluateScoreGate(50, 47);
  assert.equal(result.allowed, false);
  assert.ok(result.warning, 'expected a block message');
  assert.match(result.warning, /BLOCKED/i);
  assert.equal(result.pre, 50);
  assert.equal(result.post, 47);
});

test('evaluateScoreGate: BLOCK when count drops by a large margin', () => {
  const result = evaluateScoreGate(100, 80);
  assert.equal(result.allowed, false);
  assert.match(result.warning, /BLOCKED/i);
});

test('evaluateScoreGate: ALLOW and skip gate when pre is -1 (parse failure)', () => {
  const result = evaluateScoreGate(-1, 50);
  assert.equal(result.allowed, true);
  assert.match(result.warning, /skipped/i);
});

test('evaluateScoreGate: ALLOW and skip gate when post is -1 (parse failure)', () => {
  const result = evaluateScoreGate(50, -1);
  assert.equal(result.allowed, true);
  assert.match(result.warning, /skipped/i);
});

test('evaluateScoreGate: ALLOW and skip gate when both counts are -1', () => {
  const result = evaluateScoreGate(-1, -1);
  assert.equal(result.allowed, true);
  assert.match(result.warning, /skipped/i);
});

test('evaluateScoreGate: result includes pre and post counts on block', () => {
  const result = evaluateScoreGate(10, 5);
  assert.equal(result.pre, 10);
  assert.equal(result.post, 5);
  assert.equal(result.allowed, false);
});

// ---------------------------------------------------------------------------
// computeScoreGate — existence and callability (no actual test run)
// ---------------------------------------------------------------------------

test('computeScoreGate: function exists and is callable', () => {
  assert.equal(typeof computeScoreGate, 'function');
});

test('computeScoreGate: returns object with passed and output properties', () => {
  // We do NOT actually invoke pnpm test:framework here.
  // We verify only the shape of the returned value by inspecting the function
  // signature via a tiny stub — the real call would take 2+ minutes.
  // Instead, call it with a fake projectRoot that will fail quickly.
  const result = computeScoreGate('/nonexistent-path-for-test-stub');
  assert.ok(typeof result === 'object' && result !== null, 'result should be an object');
  assert.ok('passed' in result, 'result must have a passed property');
  assert.ok('output' in result, 'result must have an output property');
  // passed is -1 when the test command cannot be parsed (spawn fails or no match)
  assert.equal(typeof result.passed, 'number');
  assert.equal(typeof result.output, 'string');
});
