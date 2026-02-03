const test = require('node:test');
const assert = require('node:assert/strict');

const routingTable = require('../.claude/lib/routing/routing-table.cjs');

test('routing table exports expected structures', () => {
  assert.ok(routingTable);
  assert.ok(routingTable.ROUTING_TABLE);
  assert.ok(routingTable.INTENT_KEYWORDS);
  assert.ok(routingTable.INTENT_TO_AGENT);
  assert.ok(routingTable.DISAMBIGUATION_RULES);
});

test('routing table contains core mappings', () => {
  assert.equal(routingTable.ROUTING_TABLE.bug, 'developer');
  assert.equal(routingTable.INTENT_TO_AGENT.architect, 'architect');
  assert.ok(Array.isArray(routingTable.INTENT_KEYWORDS.planner));
});
