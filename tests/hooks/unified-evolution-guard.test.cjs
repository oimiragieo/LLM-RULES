#!/usr/bin/env node
/**
 * unified-evolution-guard.test.cjs
 * Tests for the unified evolution guard hook
 *
 * PERF-002: Consolidates 4 evolution checks into a single hook to reduce
 * process spawn overhead from 4 spawns to 1 per Edit/Write operation.
 *
 * Consolidated checks:
 * 1. evolution-state-guard - State machine transitions
 * 2. conflict-detector - Naming conflicts
 * 3. quality-gate-validator - Quality gates in VERIFY phase
 * 4. research-enforcement - Research requirement before artifact creation
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Will fail until we create the module
let unifiedGuard;
try {
  unifiedGuard = require('../../.claude/hooks/evolution/unified-evolution-guard.cjs');
} catch (_e) {
  console.log('Module not found - expected for RED phase');
  process.exit(1);
}

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const _EVOLUTION_STATE_PATH = path.join(PROJECT_ROOT, '.claude', 'context', 'evolution-state.json');

// Test helpers
function createMockHookInput(toolName, filePath, content = '') {
  return {
    tool_name: toolName,
    tool_input: {
      file_path: filePath,
      content: content,
    },
  };
}

// Test Suite
let testsRun = 0;
let testsPassed = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
  }
}

console.log('\n=== unified-evolution-guard.test.cjs ===\n');

// Test 1: Module exports required functions
test('exports main function', () => {
  assert.strictEqual(typeof unifiedGuard.main, 'function');
});

test('exports runAllChecks function', () => {
  assert.strictEqual(typeof unifiedGuard.runAllChecks, 'function');
});

test('exports getEvolutionState function', () => {
  assert.strictEqual(typeof unifiedGuard.getEvolutionState, 'function');
});

test('exports checkEvolutionStateTransition function', () => {
  assert.strictEqual(typeof unifiedGuard.checkEvolutionStateTransition, 'function');
});

test('exports checkConflicts function', () => {
  assert.strictEqual(typeof unifiedGuard.checkConflicts, 'function');
});

test('exports checkQualityGates function', () => {
  assert.strictEqual(typeof unifiedGuard.checkQualityGates, 'function');
});

test('exports checkResearchEnforcement function', () => {
  assert.strictEqual(typeof unifiedGuard.checkResearchEnforcement, 'function');
});

// Test 2: Evolution state check - valid transition
test('checkEvolutionStateTransition allows valid transition idle->evaluating', () => {
  const mockState = { state: 'idle' };
  const mockInput = createMockHookInput(
    'Write',
    '.claude/context/evolution-state.json',
    '{"state": "evaluating"}'
  );
  const result = unifiedGuard.checkEvolutionStateTransition(mockState, mockInput);
  assert.strictEqual(result.block, false);
});

test('checkEvolutionStateTransition blocks invalid transition idle->locking', () => {
  const mockState = { state: 'idle' };
  const mockInput = createMockHookInput(
    'Write',
    '.claude/context/evolution-state.json',
    '{"state": "locking"}'
  );
  const result = unifiedGuard.checkEvolutionStateTransition(mockState, mockInput);
  assert.strictEqual(result.block, true);
  assert.ok(result.message.includes('Invalid state transition'));
});

// Test 3: Conflict detection
test('checkConflicts allows non-artifact files', () => {
  const mockInput = createMockHookInput('Write', 'src/index.js');
  const result = unifiedGuard.checkConflicts(mockInput);
  assert.strictEqual(result.block, false);
});

test('checkConflicts blocks invalid artifact name', () => {
  const mockInput = createMockHookInput('Write', '.claude/agents/core/123-invalid-name.md');
  const result = unifiedGuard.checkConflicts(mockInput);
  assert.strictEqual(result.block, true);
  assert.ok(result.message.includes('NAMING CONVENTION'));
});

// Test 4: Quality gate validation
test('checkQualityGates allows writes when not in VERIFY phase', () => {
  const mockState = { state: 'locking' };
  const mockInput = createMockHookInput(
    'Write',
    '.claude/agents/core/test-agent.md',
    'Short content'
  );
  const result = unifiedGuard.checkQualityGates(mockState, mockInput);
  assert.strictEqual(result.block, false);
});

test('checkQualityGates blocks placeholder content in VERIFY phase', () => {
  const mockState = { state: 'verifying', currentEvolution: { phase: 'verify' } };
  const mockInput = createMockHookInput(
    'Write',
    '.claude/agents/core/test-agent.md',
    'This has TODO: finish this'
  );
  const result = unifiedGuard.checkQualityGates(mockState, mockInput);
  assert.strictEqual(result.block, true);
  assert.ok(result.message.includes('quality gate'));
});

// Test 5: Research enforcement
test('checkResearchEnforcement allows non-artifact paths', () => {
  const mockState = null;
  const mockInput = createMockHookInput('Write', 'src/component.ts');
  const result = unifiedGuard.checkResearchEnforcement(mockState, mockInput);
  assert.strictEqual(result.block, false);
});

test('checkResearchEnforcement blocks artifact creation without research', () => {
  const mockState = { currentEvolution: { research: [] } };
  const mockInput = createMockHookInput('Write', '.claude/agents/core/new-agent.md');
  const result = unifiedGuard.checkResearchEnforcement(mockState, mockInput);
  assert.strictEqual(result.block, true);
  assert.ok(result.message.includes('research'));
});

test('checkResearchEnforcement allows artifact creation with 3+ research entries', () => {
  const mockState = {
    currentEvolution: {
      research: [
        { query: 'q1', sources: [] },
        { query: 'q2', sources: [] },
        { query: 'q3', sources: [] },
      ],
    },
  };
  const mockInput = createMockHookInput('Write', '.claude/agents/core/new-agent.md');
  const result = unifiedGuard.checkResearchEnforcement(mockState, mockInput);
  assert.strictEqual(result.block, false);
});

// Test 6: runAllChecks aggregates all check results
test('runAllChecks returns array (empty when no violations)', () => {
  const mockState = { state: 'idle' };
  // Non-artifact file should pass all checks with empty results array
  const mockInput = createMockHookInput('Write', 'src/index.js');
  const results = unifiedGuard.runAllChecks(mockState, mockInput);
  assert.ok(Array.isArray(results));
  assert.strictEqual(results.length, 0); // No violations for non-artifact files
});

test('runAllChecks returns violations for artifact writes without research', () => {
  const mockState = { state: 'idle', currentEvolution: { research: [] } };
  const mockInput = createMockHookInput('Write', '.claude/agents/core/new-agent.md');
  const results = unifiedGuard.runAllChecks(mockState, mockInput);
  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 1); // Should have research enforcement violation
});

test('runAllChecks stops on first blocking result', () => {
  const mockState = { state: 'idle' };
  // Invalid artifact name should block
  const mockInput = createMockHookInput('Write', '.claude/agents/core/123Invalid.md');
  const results = unifiedGuard.runAllChecks(mockState, mockInput);
  const blockingResults = results.filter(r => r.block);
  assert.ok(blockingResults.length >= 1);
});

// Test 7: Enforcement modes
test('respects UNIFIED_EVOLUTION_GUARD=off mode', () => {
  const originalEnv = process.env.UNIFIED_EVOLUTION_GUARD;
  process.env.UNIFIED_EVOLUTION_GUARD = 'off';
  const mode = unifiedGuard.getEnforcementMode();
  assert.strictEqual(mode, 'off');
  process.env.UNIFIED_EVOLUTION_GUARD = originalEnv;
});

test('defaults to block mode', () => {
  const originalEnv = process.env.UNIFIED_EVOLUTION_GUARD;
  delete process.env.UNIFIED_EVOLUTION_GUARD;
  const mode = unifiedGuard.getEnforcementMode();
  assert.strictEqual(mode, 'block');
  process.env.UNIFIED_EVOLUTION_GUARD = originalEnv;
});

// Summary
console.log(`\n${testsPassed}/${testsRun} tests passed`);
process.exit(testsPassed === testsRun ? 0 : 1);
