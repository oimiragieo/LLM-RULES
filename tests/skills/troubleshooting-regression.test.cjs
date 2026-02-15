'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeLog,
  buildNextActions,
} = require('../../.claude/skills/troubleshooting-regression/scripts/main.cjs');

test('analyzeLog detects memory/search/task regressions and ignores MCP noise', () => {
  const sample = [
    'MCP auth failed for external connector',
    '[SEARCH-FIRST] Read blocked until search evidence is provided.',
    'Wave 1 agents are working - running in the background',
    '[MEMORY-FIRST] Memory review required before Task spawn.',
    '[ERROR] Hook pretooluse failed: invariant violation',
  ].join('\n');

  const findings = analyzeLog(sample);
  const ids = findings.map(item => item.id);

  assert.ok(ids.includes('search_first'));
  assert.ok(ids.includes('task_stall'));
  assert.ok(ids.includes('memory_first'));
  assert.ok(ids.includes('hook_error'));
  assert.equal(findings.some(item => /mcp auth/i.test(item.message)), false);
});

test('buildNextActions returns stability guidance when no findings exist', () => {
  const actions = buildNextActions([]);
  assert.ok(actions.length >= 2);
  assert.match(actions[0], /no framework regressions detected/i);
});
