#!/usr/bin/env node
/**
 * Tests for research-enforcement.cjs
 *
 * Tests the research enforcement hook which blocks artifact creation
 * without completing the research phase (minimum 3 research entries).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Test helpers
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function _assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expectedStr}, got ${actualStr}`);
  }
}

console.log('\n=== research-enforcement.cjs tests ===\n');

// Import the module under test
const {
  getEnforcementMode,
  isArtifactPath,
  checkResearchComplete,
  MIN_RESEARCH_ENTRIES,
} = require('../../.claude/hooks/evolution/research-enforcement.cjs');

// Test: Module exports exist
test('exports getEnforcementMode function', () => {
  assertEqual(typeof getEnforcementMode, 'function', 'Should export function');
});

test('exports isArtifactPath function', () => {
  assertEqual(typeof isArtifactPath, 'function', 'Should export function');
});

test('exports checkResearchComplete function', () => {
  assertEqual(typeof checkResearchComplete, 'function', 'Should export function');
});

test('exports MIN_RESEARCH_ENTRIES constant', () => {
  assertEqual(typeof MIN_RESEARCH_ENTRIES, 'number', 'Should export number');
  assertEqual(MIN_RESEARCH_ENTRIES, 3, 'Should be 3');
});

// Test: getEnforcementMode
test('getEnforcementMode returns block by default', () => {
  const originalEnv = process.env.RESEARCH_ENFORCEMENT;
  delete process.env.RESEARCH_ENFORCEMENT;
  assertEqual(getEnforcementMode(), 'block', 'Default should be block');
  process.env.RESEARCH_ENFORCEMENT = originalEnv;
});

test('getEnforcementMode respects RESEARCH_ENFORCEMENT env var', () => {
  const originalEnv = process.env.RESEARCH_ENFORCEMENT;
  process.env.RESEARCH_ENFORCEMENT = 'warn';
  assertEqual(getEnforcementMode(), 'warn', 'Should be warn');
  process.env.RESEARCH_ENFORCEMENT = 'off';
  assertEqual(getEnforcementMode(), 'off', 'Should be off');
  process.env.RESEARCH_ENFORCEMENT = originalEnv;
});

test('getEnforcementMode defaults to block for invalid values', () => {
  const originalEnv = process.env.RESEARCH_ENFORCEMENT;
  process.env.RESEARCH_ENFORCEMENT = 'invalid';
  assertEqual(getEnforcementMode(), 'block', 'Should default to block');
  process.env.RESEARCH_ENFORCEMENT = originalEnv;
});

// Test: isArtifactPath
test('isArtifactPath detects agent files', () => {
  assertEqual(isArtifactPath('.claude/agents/core/new-agent.md'), true, 'Should detect agent');
  assertEqual(
    isArtifactPath('.claude/agents/domain/python-pro.md'),
    true,
    'Should detect domain agent'
  );
});

test('isArtifactPath detects skill files', () => {
  assertEqual(isArtifactPath('.claude/skills/new-skill/SKILL.md'), true, 'Should detect skill');
});

test('isArtifactPath detects workflow files', () => {
  assertEqual(
    isArtifactPath('.claude/workflows/core/new-workflow.md'),
    true,
    'Should detect workflow'
  );
});

test('isArtifactPath does NOT detect non-artifact files', () => {
  assertEqual(
    isArtifactPath('.claude/context/memory/learnings.md'),
    false,
    'Should not detect memory'
  );
  assertEqual(isArtifactPath('.claude/settings.json'), false, 'Should not detect settings');
  assertEqual(isArtifactPath('src/index.ts'), false, 'Should not detect source');
  assertEqual(
    isArtifactPath('.claude/hooks/evolution/hook.cjs'),
    true,
    'Should detect hooks as artifact paths (Gate 4: hook-creator + research-synthesis required)'
  );
});

test('isArtifactPath handles null/undefined', () => {
  assertEqual(isArtifactPath(null), false, 'Should return false for null');
  assertEqual(isArtifactPath(undefined), false, 'Should return false for undefined');
  assertEqual(isArtifactPath(''), false, 'Should return false for empty string');
});

// Test: checkResearchComplete
test('checkResearchComplete returns false with no research entries', () => {
  const state = {
    state: 'locking',
    currentEvolution: {
      research: [],
    },
  };
  const result = checkResearchComplete(state);
  assertEqual(result.complete, false, 'Should be incomplete');
  assertEqual(result.count, 0, 'Should have 0 entries');
});

test('checkResearchComplete returns false with fewer than 3 research entries', () => {
  const state = {
    state: 'locking',
    currentEvolution: {
      research: [
        { query: 'query1', source: 'source1' },
        { query: 'query2', source: 'source2' },
      ],
    },
  };
  const result = checkResearchComplete(state);
  assertEqual(result.complete, false, 'Should be incomplete');
  assertEqual(result.count, 2, 'Should have 2 entries');
});

test('checkResearchComplete returns true with 3+ research entries', () => {
  const state = {
    state: 'locking',
    currentEvolution: {
      research: [
        { query: 'query1', source: 'source1' },
        { query: 'query2', source: 'source2' },
        { query: 'query3', source: 'source3' },
      ],
    },
  };
  const result = checkResearchComplete(state);
  assertEqual(result.complete, true, 'Should be complete');
  assertEqual(result.count, 3, 'Should have 3 entries');
});

test('checkResearchComplete handles missing currentEvolution', () => {
  const state = { state: 'idle' };
  const result = checkResearchComplete(state);
  assertEqual(result.complete, false, 'Should be incomplete');
  assertEqual(result.count, 0, 'Should have 0 entries');
});

test('checkResearchComplete handles null state', () => {
  const result = checkResearchComplete(null);
  assertEqual(result.complete, false, 'Should be incomplete');
  assertEqual(result.count, 0, 'Should have 0 entries');
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
