'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const HOOK_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'session',
  'analysis-paralysis-guard.cjs'
);

// =============================================================================
// Unit Tests: Analysis Paralysis Guard
// =============================================================================

describe('Analysis Paralysis Guard', () => {
  // Verify the hook file exists
  test('hook file should exist at .claude/hooks/session/analysis-paralysis-guard.cjs', () => {
    assert.ok(fs.existsSync(HOOK_PATH), `Expected hook at ${HOOK_PATH}`);
  });

  test('hook should export thresholds for executor agents (warn: 5, block: 8)', () => {
    const guard = require(HOOK_PATH);
    assert.ok(guard.THRESHOLDS, 'Expected THRESHOLDS to be exported');
    assert.strictEqual(guard.THRESHOLDS.executor.warn, 5, 'Executor warn threshold should be 5');
    assert.strictEqual(guard.THRESHOLDS.executor.block, 8, 'Executor block threshold should be 8');
  });

  test('hook should export thresholds for analyst agents (warn: 15, block: 25)', () => {
    const guard = require(HOOK_PATH);
    assert.strictEqual(guard.THRESHOLDS.analyst.warn, 15, 'Analyst warn threshold should be 15');
    assert.strictEqual(guard.THRESHOLDS.analyst.block, 25, 'Analyst block threshold should be 25');
  });

  test('hook should export thresholds for orchestrator agents (warn: 20, block: 30)', () => {
    const guard = require(HOOK_PATH);
    assert.strictEqual(
      guard.THRESHOLDS.orchestrator.warn,
      20,
      'Orchestrator warn threshold should be 20'
    );
    assert.strictEqual(
      guard.THRESHOLDS.orchestrator.block,
      30,
      'Orchestrator block threshold should be 30'
    );
  });

  test('hook should export thresholds for hunter skill override (warn: 25, block: 40)', () => {
    const guard = require(HOOK_PATH);
    assert.strictEqual(guard.THRESHOLDS.hunter.warn, 25, 'Hunter warn threshold should be 25');
    assert.strictEqual(guard.THRESHOLDS.hunter.block, 40, 'Hunter block threshold should be 40');
  });

  test('hook should export getAgentTier function', () => {
    const guard = require(HOOK_PATH);
    assert.ok(typeof guard.getAgentTier === 'function', 'Expected getAgentTier to be a function');
  });

  test('getAgentTier should return executor for developer', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('developer', ''),
      'executor',
      'developer should be executor tier'
    );
  });

  test('getAgentTier should return executor for devops', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(getAgentTier('devops', ''), 'executor', 'devops should be executor tier');
  });

  test('getAgentTier should return executor for code-simplifier', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('code-simplifier', ''),
      'executor',
      'code-simplifier should be executor tier'
    );
  });

  test('getAgentTier should return analyst for researcher', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('researcher', ''),
      'analyst',
      'researcher should be analyst tier'
    );
  });

  test('getAgentTier should return analyst for code-reviewer', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('code-reviewer', ''),
      'analyst',
      'code-reviewer should be analyst tier'
    );
  });

  test('getAgentTier should return analyst for architect', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('architect', ''),
      'analyst',
      'architect should be analyst tier'
    );
  });

  test('getAgentTier should return analyst for security-architect', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('security-architect', ''),
      'analyst',
      'security-architect should be analyst tier'
    );
  });

  test('getAgentTier should return orchestrator for planner', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('planner', ''),
      'orchestrator',
      'planner should be orchestrator tier'
    );
  });

  test('getAgentTier should return orchestrator for master-orchestrator', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('master-orchestrator', ''),
      'orchestrator',
      'master-orchestrator should be orchestrator tier'
    );
  });

  test('getAgentTier should return orchestrator for evolution-orchestrator', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('evolution-orchestrator', ''),
      'orchestrator',
      'evolution-orchestrator should be orchestrator tier'
    );
  });

  test('getAgentTier should return hunter when edge-case-hunter skill is active', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('developer', 'edge-case-hunter'),
      'hunter',
      'edge-case-hunter skill should override to hunter tier'
    );
  });

  test('getAgentTier should default to executor for unknown agent types', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('unknown-agent-xyz', ''),
      'executor',
      'Unknown agent types should default to executor tier'
    );
  });

  test('getAgentTier should default to executor when agent type is empty', () => {
    const { getAgentTier } = require(HOOK_PATH);
    assert.strictEqual(
      getAgentTier('', ''),
      'executor',
      'Empty agent type should default to executor tier'
    );
  });

  test('hook should export shouldReset function', () => {
    const guard = require(HOOK_PATH);
    assert.ok(typeof guard.shouldReset === 'function', 'Expected shouldReset to be a function');
  });

  test('shouldReset should return true for Write tool', () => {
    const { shouldReset } = require(HOOK_PATH);
    assert.ok(shouldReset('Write'), 'Write should reset the counter');
  });

  test('shouldReset should return true for Edit tool', () => {
    const { shouldReset } = require(HOOK_PATH);
    assert.ok(shouldReset('Edit'), 'Edit should reset the counter');
  });

  test('shouldReset should return true for Bash tool', () => {
    const { shouldReset } = require(HOOK_PATH);
    assert.ok(shouldReset('Bash'), 'Bash should reset the counter');
  });

  test('shouldReset should return false for Read tool', () => {
    const { shouldReset } = require(HOOK_PATH);
    assert.ok(!shouldReset('Read'), 'Read should NOT reset the counter');
  });

  test('shouldReset should return false for Glob tool', () => {
    const { shouldReset } = require(HOOK_PATH);
    assert.ok(!shouldReset('Glob'), 'Glob should NOT reset the counter');
  });

  test('hook should be fail-open (exit 0) when processing malformed JSON', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [HOOK_PATH], {
      input: 'not-json',
      encoding: 'utf8',
      timeout: 3000,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // exit 0 = fail-open (advisory hook)
    assert.strictEqual(result.status, 0, 'Hook should fail-open (exit 0) on malformed JSON');
  });

  test('hook module should export AGENT_TIERS configuration', () => {
    const guard = require(HOOK_PATH);
    assert.ok(guard.AGENT_TIERS, 'Expected AGENT_TIERS to be exported');
    assert.ok(
      Array.isArray(guard.AGENT_TIERS.executor),
      'Expected executor tier agents to be an array'
    );
    assert.ok(
      guard.AGENT_TIERS.executor.includes('developer'),
      'Expected developer in executor tier'
    );
    assert.ok(
      guard.AGENT_TIERS.analyst.includes('researcher'),
      'Expected researcher in analyst tier'
    );
    assert.ok(
      guard.AGENT_TIERS.orchestrator.includes('planner'),
      'Expected planner in orchestrator tier'
    );
  });
});
