#!/usr/bin/env node
/**
 * Tests for evolution-audit.cjs
 *
 * Tests the evolution audit hook which logs evolution completions
 * to an audit trail for tracking and verification.
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

console.log('\n=== evolution-audit.cjs tests ===\n');

// Import the module under test
const {
  getEnforcementMode,
  isEvolutionCompletion,
  formatAuditEntry,
  AUDIT_LOG_PATH,
} = require('../../.claude/hooks/evolution/evolution-audit.cjs');

// Test: Module exports exist
test('exports getEnforcementMode function', () => {
  assertEqual(typeof getEnforcementMode, 'function', 'Should export function');
});

test('exports isEvolutionCompletion function', () => {
  assertEqual(typeof isEvolutionCompletion, 'function', 'Should export function');
});

test('exports formatAuditEntry function', () => {
  assertEqual(typeof formatAuditEntry, 'function', 'Should export function');
});

test('exports AUDIT_LOG_PATH constant', () => {
  assertEqual(typeof AUDIT_LOG_PATH, 'string', 'Should export string');
  assertEqual(AUDIT_LOG_PATH.includes('evolution-audit.log'), true, 'Should contain filename');
});

// Test: getEnforcementMode
test('getEnforcementMode returns on by default', () => {
  const originalEnv = process.env.EVOLUTION_AUDIT;
  delete process.env.EVOLUTION_AUDIT;
  assertEqual(getEnforcementMode(), 'on', 'Default should be on');
  process.env.EVOLUTION_AUDIT = originalEnv;
});

test('getEnforcementMode respects EVOLUTION_AUDIT env var', () => {
  const originalEnv = process.env.EVOLUTION_AUDIT;
  process.env.EVOLUTION_AUDIT = 'on';
  assertEqual(getEnforcementMode(), 'on', 'Should be on');
  process.env.EVOLUTION_AUDIT = 'off';
  assertEqual(getEnforcementMode(), 'off', 'Should be off');
  process.env.EVOLUTION_AUDIT = originalEnv;
});

test('getEnforcementMode defaults to on for invalid values', () => {
  const originalEnv = process.env.EVOLUTION_AUDIT;
  process.env.EVOLUTION_AUDIT = 'invalid';
  assertEqual(getEnforcementMode(), 'on', 'Should default to on');
  process.env.EVOLUTION_AUDIT = originalEnv;
});

// Test: isEvolutionCompletion
test('isEvolutionCompletion detects enabling -> idle transition', () => {
  const state = {
    state: 'idle',
    previousState: 'enabling',
    currentEvolution: {
      type: 'agent',
      name: 'test-agent',
      phase: 'enable',
    },
  };
  assertEqual(isEvolutionCompletion(state), true, 'Should detect completion');
});

test('isEvolutionCompletion returns false for other transitions', () => {
  const state1 = {
    state: 'evaluating',
    previousState: 'idle',
  };
  assertEqual(isEvolutionCompletion(state1), false, 'Should not detect for evaluating');

  const state2 = {
    state: 'locking',
    previousState: 'obtaining',
  };
  assertEqual(isEvolutionCompletion(state2), false, 'Should not detect for locking');
});

test('isEvolutionCompletion returns false for missing state', () => {
  assertEqual(isEvolutionCompletion(null), false, 'Should return false for null');
  assertEqual(isEvolutionCompletion({}), false, 'Should return false for empty');
});

test('isEvolutionCompletion returns true for completed evolutions array', () => {
  const state = {
    state: 'idle',
    evolutions: [
      {
        type: 'skill',
        name: 'new-skill',
        completedAt: new Date().toISOString(),
      },
    ],
  };
  assertEqual(isEvolutionCompletion(state), true, 'Should detect from evolutions array');
});

// Test: formatAuditEntry
test('formatAuditEntry formats agent evolution', () => {
  const evolution = {
    type: 'agent',
    name: 'test-agent',
    path: '.claude/agents/domain/test-agent.md',
    completedAt: '2026-01-25T12:00:00.000Z',
    researchReport: '.claude/context/artifacts/research-reports/test-agent-research.md',
  };
  const entry = formatAuditEntry(evolution);
  assertEqual(entry.includes('[EVOLUTION]'), true, 'Should include marker');
  assertEqual(entry.includes('agent'), true, 'Should include type');
  assertEqual(entry.includes('test-agent'), true, 'Should include name');
});

test('formatAuditEntry formats skill evolution', () => {
  const evolution = {
    type: 'skill',
    name: 'new-skill',
    path: '.claude/skills/new-skill/SKILL.md',
    completedAt: '2026-01-25T12:00:00.000Z',
  };
  const entry = formatAuditEntry(evolution);
  assertEqual(entry.includes('[EVOLUTION]'), true, 'Should include marker');
  assertEqual(entry.includes('skill'), true, 'Should include type');
  assertEqual(entry.includes('new-skill'), true, 'Should include name');
});

test('formatAuditEntry handles missing fields gracefully', () => {
  const evolution = {
    type: 'agent',
    name: 'test',
  };
  const entry = formatAuditEntry(evolution);
  assertEqual(typeof entry, 'string', 'Should return string');
  assertEqual(entry.includes('[EVOLUTION]'), true, 'Should include marker');
});

test('formatAuditEntry handles null/undefined', () => {
  const entry1 = formatAuditEntry(null);
  assertEqual(typeof entry1, 'string', 'Should return string for null');

  const entry2 = formatAuditEntry(undefined);
  assertEqual(typeof entry2, 'string', 'Should return string for undefined');
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
