'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { INTENT_TO_AGENT } = require('../../../.claude/lib/routing/routing-table-intent-agents.cjs');

test('tdd intent maps to qa agent', () => {
  assert.equal(INTENT_TO_AGENT.tdd, 'qa');
});
