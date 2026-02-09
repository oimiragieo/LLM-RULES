'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getPhaseModel,
  getPhaseThinking,
  getPhaseThinkingBudget,
} = require('../../../.claude/lib/config/phase-config.cjs');

test('phase-config returns normalized model', () => {
  const model = getPhaseModel('planning');
  assert.ok(model.startsWith('claude-'));
});

test('phase-config returns thinking level', () => {
  assert.equal(getPhaseThinking('planning'), 'high');
});

test('phase-config returns thinking budget', () => {
  assert.equal(getPhaseThinkingBudget('planning'), 16384);
});
