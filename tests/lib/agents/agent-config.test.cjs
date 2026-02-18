'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(process.cwd(), '.claude', 'config', 'agent-config.json');

const {
  getDefaultTools,
  getDefaultThinkingLevel,
  getThinkingBudget,
  getPhaseForAgent,
  listAgentTypes,
  clearCache,
} = require('../../../.claude/lib/agents/agent-config.cjs');

test('agent-config exposes defaults for known agents', () => {
  const tools = getDefaultTools('planner');
  assert.ok(Array.isArray(tools));
  assert.ok(tools.includes('Read'));
  assert.equal(getDefaultThinkingLevel('planner'), 'medium'); // planner has no thinkingDefault field, falls back to 'medium'
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

test('agent-config cache auto-refreshes when config file changes', () => {
  const originalRaw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(originalRaw);
  const originalMedium = parsed?.thinkingBudgetMap?.medium;
  const nextMedium = Number(originalMedium || 4096) + 123;

  try {
    clearCache();
    const before = getThinkingBudget('medium');
    assert.equal(before, originalMedium);

    parsed.thinkingBudgetMap = { ...(parsed.thinkingBudgetMap || {}), medium: nextMedium };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2) + '\n', 'utf8');

    const after = getThinkingBudget('medium');
    assert.equal(after, nextMedium);
  } finally {
    fs.writeFileSync(CONFIG_PATH, originalRaw, 'utf8');
    clearCache();
  }
});
