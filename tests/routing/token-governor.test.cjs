#!/usr/bin/env node
'use strict';

/**
 * token-governor.test.cjs — S3 TDD: per-agent token attribution + pre-spawn budget governor
 *
 * Test IDs: TG-001 … TG-005
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ---------------------------------------------------------------------------
// Helpers — temporary trace directory wired to each test
// ---------------------------------------------------------------------------

let tmpDir;
let originalEnv;

function setupTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-test-'));
  originalEnv = { ...process.env };
  return tmpDir;
}

function teardownTmpDir() {
  // Restore env
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  // Clean up tmp dir
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_e) {
    // Best-effort cleanup
  }
}

/**
 * Write a fake trace JSONL file with the given entries.
 * Each entry is merged with sane defaults.
 */
function writeTraceFile(sessionId, entries, dir) {
  const tracesDir = path.join(dir, 'traces');
  fs.mkdirSync(tracesDir, { recursive: true });
  const filePath = path.join(tracesDir, `${sessionId}.jsonl`);
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(filePath, lines, 'utf8');
  return filePath;
}

/**
 * Build a minimal trace entry with token count.
 */
function makeTraceEntry({ agentId = 'developer', sessionId = 'sess-1', totalTokens = 1000 } = {}) {
  return {
    timestamp: new Date().toISOString(),
    'gen_ai.tool.name': 'Read',
    'gen_ai.tool.args_hash': 'abc1234',
    'gen_ai.tool.result_hash': 'def5678',
    'gen_ai.usage.total_tokens': totalTokens,
    duration_ms: 5,
    agent_id: agentId,
    task_id: 'task-1',
    session_id: sessionId,
  };
}

// ---------------------------------------------------------------------------
// Lazy-require token-governor so we can manipulate env before each test
// ---------------------------------------------------------------------------

function requireGovernor() {
  // Node's require cache: bust on each test by deleting the cached module.
  const modPath = require.resolve('../../.claude/lib/routing/token-governor.cjs');
  delete require.cache[modPath];
  return require('../../.claude/lib/routing/token-governor.cjs');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenGovernor', () => {
  beforeEach(() => {
    setupTmpDir();
  });

  afterEach(() => {
    teardownTmpDir();
  });

  // -------------------------------------------------------------------------
  // TG-001: tallyAgentTokens sums total_tokens for the given agent_id
  // -------------------------------------------------------------------------
  it('TG-001: tallyAgentTokens returns total tokens for agent_id X in session', () => {
    const sessionId = 'sess-tg001';
    const agentId = 'developer';

    writeTraceFile(
      sessionId,
      [
        makeTraceEntry({ agentId, sessionId, totalTokens: 3000 }),
        makeTraceEntry({ agentId, sessionId, totalTokens: 2000 }),
        // Different agent — must NOT be counted
        makeTraceEntry({ agentId: 'qa', sessionId, totalTokens: 9999 }),
      ],
      tmpDir
    );

    process.env.TRACE_DIR_OVERRIDE = path.join(tmpDir, 'traces');
    const { tallyAgentTokens } = requireGovernor();
    const total = tallyAgentTokens(agentId, sessionId);
    assert.equal(total, 5000, 'Should sum only entries matching agent_id');
  });

  // -------------------------------------------------------------------------
  // TG-002: checkSpawnBudget returns allowed:true + remaining when under threshold
  // -------------------------------------------------------------------------
  it('TG-002: pre-spawn check at 50K of 100K budget returns allowed:true, remaining:50000', () => {
    const sessionId = 'sess-tg002';
    const agentId = 'developer';

    writeTraceFile(
      sessionId,
      [makeTraceEntry({ agentId, sessionId, totalTokens: 50000 })],
      tmpDir
    );

    process.env.TRACE_DIR_OVERRIDE = path.join(tmpDir, 'traces');
    process.env.TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET = '100000';
    delete process.env.TOKEN_GOVERNOR_HARD;

    const { checkSpawnBudget } = requireGovernor();
    const result = checkSpawnBudget(agentId, sessionId);

    assert.equal(result.allowed, true, 'Should be allowed at 50%');
    assert.equal(result.remaining, 50000, 'Remaining should be 50000');
    assert.ok(!result.warning, 'No warning at 50%');
  });

  // -------------------------------------------------------------------------
  // TG-003: pre-spawn check at 95K returns allowed:true + warning:"approaching_budget"
  // -------------------------------------------------------------------------
  it('TG-003: pre-spawn check at 95K of 100K returns allowed:true, warning:approaching_budget', () => {
    const sessionId = 'sess-tg003';
    const agentId = 'qa';

    writeTraceFile(
      sessionId,
      [makeTraceEntry({ agentId, sessionId, totalTokens: 95000 })],
      tmpDir
    );

    process.env.TRACE_DIR_OVERRIDE = path.join(tmpDir, 'traces');
    process.env.TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET = '100000';
    delete process.env.TOKEN_GOVERNOR_HARD;

    const { checkSpawnBudget } = requireGovernor();
    const result = checkSpawnBudget(agentId, sessionId);

    assert.equal(result.allowed, true, 'Should still be allowed at 95%');
    assert.equal(result.warning, 'approaching_budget', 'Should warn approaching_budget');
  });

  // -------------------------------------------------------------------------
  // TG-004: TOKEN_GOVERNOR_HARD=on blocks at 105K; off allows with warning
  // -------------------------------------------------------------------------
  it('TG-004a: pre-spawn check at 105K with TOKEN_GOVERNOR_HARD=on returns allowed:false', () => {
    const sessionId = 'sess-tg004a';
    const agentId = 'architect';

    writeTraceFile(
      sessionId,
      [makeTraceEntry({ agentId, sessionId, totalTokens: 105000 })],
      tmpDir
    );

    process.env.TRACE_DIR_OVERRIDE = path.join(tmpDir, 'traces');
    process.env.TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET = '100000';
    process.env.TOKEN_GOVERNOR_HARD = 'on';

    const { checkSpawnBudget } = requireGovernor();
    const result = checkSpawnBudget(agentId, sessionId);

    assert.equal(result.allowed, false, 'Hard mode must block when exceeded');
  });

  it('TG-004b: pre-spawn check at 105K without TOKEN_GOVERNOR_HARD returns allowed:true + warning:exceeded', () => {
    const sessionId = 'sess-tg004b';
    const agentId = 'architect';

    writeTraceFile(
      sessionId,
      [makeTraceEntry({ agentId, sessionId, totalTokens: 105000 })],
      tmpDir
    );

    process.env.TRACE_DIR_OVERRIDE = path.join(tmpDir, 'traces');
    process.env.TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET = '100000';
    delete process.env.TOKEN_GOVERNOR_HARD;

    const { checkSpawnBudget } = requireGovernor();
    const result = checkSpawnBudget(agentId, sessionId);

    assert.equal(result.allowed, true, 'Soft mode must allow even when exceeded');
    assert.equal(result.warning, 'exceeded', 'Should warn exceeded in soft mode');
  });

  // -------------------------------------------------------------------------
  // TG-005: Configurable budget via TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET; default 100000
  // -------------------------------------------------------------------------
  it('TG-005: TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET configures budget; default is 100000', () => {
    const sessionId = 'sess-tg005';
    const agentId = 'planner';

    // 60000 tokens with custom budget of 50000 → should exceed
    writeTraceFile(
      sessionId,
      [makeTraceEntry({ agentId, sessionId, totalTokens: 60000 })],
      tmpDir
    );

    process.env.TRACE_DIR_OVERRIDE = path.join(tmpDir, 'traces');
    process.env.TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET = '50000';
    process.env.TOKEN_GOVERNOR_HARD = 'on';

    const { checkSpawnBudget } = requireGovernor();
    const resultCustom = checkSpawnBudget(agentId, sessionId);
    assert.equal(resultCustom.allowed, false, 'Custom budget of 50000 should block 60000 tokens');

    // Now verify default budget = 100000 (60000 tokens should be allowed)
    delete process.env.TOKEN_GOVERNOR_DEFAULT_TASK_BUDGET;

    const governor2 = requireGovernor();
    const resultDefault = governor2.checkSpawnBudget(agentId, sessionId);
    assert.equal(resultDefault.allowed, true, 'Default budget 100000 should allow 60000 tokens');
  });
});
