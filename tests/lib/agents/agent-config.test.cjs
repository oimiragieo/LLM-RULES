'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getDefaultTools,
  getDefaultThinkingLevel,
  getThinkingBudget,
  getPhaseForAgent,
  listAgentTypes,
} = require('../../../.claude/lib/agents/agent-config.cjs');

test('agent-config exposes defaults for known agents', () => {
  const tools = getDefaultTools('planner');
  assert.ok(Array.isArray(tools));
  assert.ok(tools.includes('Read'));
  assert.equal(getDefaultThinkingLevel('planner'), 'high');
  assert.equal(getPhaseForAgent('planner'), 'planning');
});

test('agent-config uses safe defaults for unknown agents', () => {
  const tools = getDefaultTools('unknown-agent');
  assert.ok(Array.isArray(tools));
  assert.ok(tools.includes('Read'));
  assert.equal(getDefaultThinkingLevel('unknown-agent'), 'medium');
});

test('agent-config exposes thinking budgets', () => {
  assert.equal(getThinkingBudget('high'), 16384);
  assert.equal(getThinkingBudget('none'), null);
});

test('agent-config lists configured agent types', () => {
  const agents = listAgentTypes();
  assert.ok(agents.includes('planner'));
});
