'use strict';

/**
 * Tests for session-audit CLI (v2.4.0 S2)
 * Verifies per-component token burn table rendering from OTel trace JSONL.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  parseArgs,
  loadTraceRecords,
  aggregateByAgent,
  renderTable,
  renderJson,
} = require('../../../.claude/tools/cli/session-audit.cjs');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    'gen_ai.tool.name': overrides['gen_ai.tool.name'] ?? 'Read',
    'gen_ai.tool.args_hash': 'abcd1234abcd1234',
    'gen_ai.tool.result_hash': 'efgh5678efgh5678',
    duration_ms: overrides.duration_ms ?? 50,
    agent_id: overrides.agent_id ?? 'developer',
    task_id: overrides.task_id ?? 'task-1',
    session_id: overrides.session_id ?? 'session-abc',
    span_type: overrides.span_type ?? 'tool-call',
    parent_span_id: overrides.parent_span_id ?? 'task-1',
    ...overrides,
  };
}

function writeFixture(dir, sessionId, records) {
  const tracesDir = path.join(dir, '.claude', 'context', 'runtime', 'traces');
  fs.mkdirSync(tracesDir, { recursive: true });
  const filePath = path.join(tracesDir, `${sessionId}.jsonl`);
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Test 1: 3 tool calls by same agent → single table row with total tokens
// ---------------------------------------------------------------------------

test('aggregates 3 tool calls by same agent into one table row with token total', () => {
  const records = [
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Read', 'gen_ai.usage.total_tokens': 100 }),
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Read', 'gen_ai.usage.total_tokens': 200 }),
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Read', 'gen_ai.usage.total_tokens': 300 }),
  ];

  const agg = aggregateByAgent(records, {});
  assert.ok(agg['developer'], 'expected developer key');

  const devAgg = agg['developer'];
  assert.equal(devAgg.totalTokens, 600, 'sum of tokens should be 600');
  assert.equal(devAgg.totalCalls, 3, 'should have 3 calls');

  const table = renderTable(agg);
  assert.ok(table.includes('developer'), 'table should include agent name');
  assert.ok(table.includes('600'), 'table should include total tokens');
});

// ---------------------------------------------------------------------------
// Test 2: Mixed agents → grouped output per agent + per tool
// ---------------------------------------------------------------------------

test('groups output per agent and per tool when multiple agents present', () => {
  const records = [
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Read', 'gen_ai.usage.total_tokens': 100 }),
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Write', 'gen_ai.usage.total_tokens': 150 }),
    makeRecord({ agent_id: 'planner', 'gen_ai.tool.name': 'Task', 'gen_ai.usage.total_tokens': 200 }),
  ];

  const agg = aggregateByAgent(records, {});
  assert.ok(agg['developer'], 'expected developer');
  assert.ok(agg['planner'], 'expected planner');

  // Developer should have 2 tool buckets
  assert.ok(agg['developer'].tools['Read'], 'developer should have Read tool');
  assert.ok(agg['developer'].tools['Write'], 'developer should have Write tool');
  assert.equal(agg['developer'].tools['Read'].tokens, 100);
  assert.equal(agg['developer'].tools['Write'].tokens, 150);

  // Planner should have 1 tool bucket
  assert.ok(agg['planner'].tools['Task'], 'planner should have Task tool');
  assert.equal(agg['planner'].tools['Task'].tokens, 200);

  const table = renderTable(agg);
  assert.ok(table.includes('developer'), 'table includes developer');
  assert.ok(table.includes('planner'), 'table includes planner');
  assert.ok(table.includes('Read'), 'table includes Read tool');
  assert.ok(table.includes('Write'), 'table includes Write tool');
  assert.ok(table.includes('Task'), 'table includes Task tool');
});

// ---------------------------------------------------------------------------
// Test 3: Missing gen_ai.usage.total_tokens → displays "—" for that row
// ---------------------------------------------------------------------------

test('displays dash for rows with missing token data without crashing', () => {
  const records = [
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Bash' }),
    // No gen_ai.usage.total_tokens field
  ];
  // Ensure the field is absent
  delete records[0]['gen_ai.usage.total_tokens'];

  const agg = aggregateByAgent(records, {});
  assert.ok(agg['developer'], 'expected developer');
  assert.equal(agg['developer'].totalTokens, 0, 'no tokens should sum to 0');

  const table = renderTable(agg);
  // Should contain the dash character (in ANSI-stripped form or directly)
  const stripped = table.replace(/\x1b\[[0-9;]*m/g, '');
  assert.ok(stripped.includes('—'), 'table should show — for missing tokens');
});

// ---------------------------------------------------------------------------
// Test 4: parseArgs - missing session id → flagged in parsed result
// ---------------------------------------------------------------------------

test('parseArgs returns error flag when session id is missing', () => {
  const result = parseArgs(['node', 'session-audit.cjs']);
  assert.equal(result.sessionId, null, 'sessionId should be null');
  assert.equal(result.error, 'missing-session-id', 'should signal missing session id error');
});

// ---------------------------------------------------------------------------
// Test 5: --agent filter limits output to specified agent
// ---------------------------------------------------------------------------

test('--agent filter limits aggregation output to specified agent', () => {
  const records = [
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Read', 'gen_ai.usage.total_tokens': 100 }),
    makeRecord({ agent_id: 'planner', 'gen_ai.tool.name': 'Task', 'gen_ai.usage.total_tokens': 200 }),
    makeRecord({ agent_id: 'qa', 'gen_ai.tool.name': 'Bash', 'gen_ai.usage.total_tokens': 50 }),
  ];

  const agg = aggregateByAgent(records, { agentFilter: 'developer' });
  assert.ok(agg['developer'], 'developer should be present');
  assert.equal(Object.keys(agg).length, 1, 'only developer should be in output');
  assert.equal(agg['developer'].totalTokens, 100);
});

// ---------------------------------------------------------------------------
// Test 6: --format json emits JSON; default is text table
// ---------------------------------------------------------------------------

test('renderJson emits valid JSON with agent and token data', () => {
  const records = [
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Read', 'gen_ai.usage.total_tokens': 500 }),
    makeRecord({ agent_id: 'developer', 'gen_ai.tool.name': 'Write', 'gen_ai.usage.total_tokens': 300 }),
  ];

  const agg = aggregateByAgent(records, {});
  const jsonOutput = renderJson(agg);

  // Must be valid JSON
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(jsonOutput);
  }, 'renderJson must emit valid JSON');

  assert.ok(parsed.agents, 'JSON output must have agents key');
  assert.ok(parsed.agents['developer'], 'developer should be in JSON output');
  assert.equal(parsed.agents['developer'].totalTokens, 800);
  assert.ok(parsed.agents['developer'].tools, 'tools should be present');
});

test('loadTraceRecords reads a jsonl file and returns parsed records', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-audit-'));
  try {
    const sessionId = 'test-session-xyz';
    const records = [
      makeRecord({ session_id: sessionId, agent_id: 'developer', 'gen_ai.usage.total_tokens': 100 }),
      makeRecord({ session_id: sessionId, agent_id: 'planner', 'gen_ai.usage.total_tokens': 200 }),
    ];
    writeFixture(tmpDir, sessionId, records);

    const tracePath = path.join(
      tmpDir,
      '.claude',
      'context',
      'runtime',
      'traces',
      `${sessionId}.jsonl`
    );
    const loaded = loadTraceRecords(tracePath);
    assert.equal(loaded.length, 2, 'should load 2 records');
    assert.equal(loaded[0].agent_id, 'developer');
    assert.equal(loaded[1].agent_id, 'planner');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
