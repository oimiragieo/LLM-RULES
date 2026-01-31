#!/usr/bin/env node
/**
 * Tests for evolution-trigger-detector.cjs
 *
 * Run with: node evolution-trigger-detector.test.cjs
 */

'use strict';

const assert = require('assert');
const {
  isDetectionEnabled,
  detectTriggers,
  extractContext,
  addSuggestion,
  EVOLUTION_TRIGGERS,
} = require('../../.claude/hooks/evolution/evolution-trigger-detector.cjs');

// Store original env
const originalEnv = { ...process.env };

// Test results tracking
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

function cleanup() {
  process.env = { ...originalEnv };
}

// ============ Tests ============

console.log('\n=== evolution-trigger-detector.cjs Tests ===\n');

// --- isDetectionEnabled tests ---

test('isDetectionEnabled returns true by default', () => {
  cleanup();
  delete process.env.EVOLUTION_TRIGGER_DETECTION;
  assert.strictEqual(isDetectionEnabled(), true);
});

test('isDetectionEnabled returns true for "on"', () => {
  process.env.EVOLUTION_TRIGGER_DETECTION = 'on';
  assert.strictEqual(isDetectionEnabled(), true);
  cleanup();
});

test('isDetectionEnabled returns false for "off"', () => {
  process.env.EVOLUTION_TRIGGER_DETECTION = 'off';
  assert.strictEqual(isDetectionEnabled(), false);
  cleanup();
});

// --- detectTriggers tests ---

test('detectTriggers detects "create new agent"', () => {
  const text = 'I need to create a new agent for data analysis';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].type, 'explicit_creation');
  assert.strictEqual(triggers[0].priority, 'high');
});

test('detectTriggers detects "create new skill"', () => {
  const text = 'Please create new skill for code review';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].type, 'explicit_creation');
});

test('detectTriggers detects "need a * agent"', () => {
  const text = 'I need a GraphQL agent for this project';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].type, 'capability_need');
});

test('detectTriggers detects "no matching agent"', () => {
  const text = 'There is no matching agent for mobile UX review';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].type, 'gap_detection');
});

test('detectTriggers detects "no suitable skill"', () => {
  const text = 'Found no suitable skill for performance testing';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].type, 'gap_detection');
});

test('detectTriggers detects "missing capability"', () => {
  const text = 'There is a missing capability for blockchain development';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].type, 'gap_detection');
});

test('detectTriggers detects "self-evolving"', () => {
  const text = 'The framework should be self-evolving';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].type, 'explicit_evolution');
});

test('detectTriggers detects "evolve the system"', () => {
  const text = 'We need to evolve the system to handle new requirements';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 1);
  assert.strictEqual(triggers[0].type, 'explicit_evolution');
});

test('detectTriggers detects multiple triggers', () => {
  const text = 'Create a new agent because there is no matching agent for this task';
  const triggers = detectTriggers(text);
  assert.ok(triggers.length >= 2);
});

test('detectTriggers returns empty for unrelated text', () => {
  const text = 'Please fix the bug in the login component';
  const triggers = detectTriggers(text);
  assert.strictEqual(triggers.length, 0);
});

test('detectTriggers returns empty for empty input', () => {
  assert.strictEqual(detectTriggers('').length, 0);
  assert.strictEqual(detectTriggers(null).length, 0);
  assert.strictEqual(detectTriggers(undefined).length, 0);
});

test('detectTriggers is case insensitive', () => {
  const text1 = 'CREATE NEW AGENT for testing';
  const text2 = 'Create New Agent for testing';
  const text3 = 'create new agent for testing';

  assert.strictEqual(detectTriggers(text1).length, 1);
  assert.strictEqual(detectTriggers(text2).length, 1);
  assert.strictEqual(detectTriggers(text3).length, 1);
});

// --- extractContext tests ---

test('extractContext extracts surrounding text', () => {
  const text = 'This is before. The match is here. This is after.';
  const context = extractContext(text, 20, 15);
  assert.ok(context.includes('match'));
});

test('extractContext adds ellipsis for truncated start', () => {
  const text = 'Long prefix text before the match in the middle';
  const context = extractContext(text, 30, 10);
  assert.ok(context.startsWith('...'));
});

test('extractContext adds ellipsis for truncated end', () => {
  const text = 'Start here and the match with long suffix text after';
  const context = extractContext(text, 5, 10);
  assert.ok(context.endsWith('...'));
});

// --- addSuggestion tests ---

test('addSuggestion adds new suggestion to idle state', () => {
  const state = {
    state: 'idle',
    currentEvolution: null,
    suggestions: [],
  };

  const triggers = [{ type: 'explicit_creation', priority: 'high', match: 'create new agent' }];
  const updated = addSuggestion(state, triggers);

  assert.strictEqual(updated.suggestions.length, 1);
  assert.strictEqual(updated.suggestions[0].status, 'pending');
  assert.ok(updated.suggestions[0].id.startsWith('sug-'));
});

test('addSuggestion does not add when evolution in progress', () => {
  const state = {
    state: 'evaluating',
    currentEvolution: { phase: 'evaluate' },
    suggestions: [],
  };

  const triggers = [{ type: 'explicit_creation', priority: 'high', match: 'create new agent' }];
  const updated = addSuggestion(state, triggers);

  assert.strictEqual(updated.suggestions.length, 0);
});

test('addSuggestion keeps only last 10 suggestions', () => {
  const state = {
    state: 'idle',
    currentEvolution: null,
    suggestions: Array(12)
      .fill(null)
      .map((_, i) => ({
        id: `sug-old-${i}`,
        detectedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago (old)
        triggers: [{ type: 'other', priority: 'low', match: 'old' }],
        status: 'pending',
      })),
  };

  const triggers = [{ type: 'explicit_creation', priority: 'high', match: 'new trigger' }];
  const updated = addSuggestion(state, triggers);

  // Old suggestions (>5min) are filtered, so we should have just the new one
  assert.ok(updated.suggestions.length <= 10);
});

test('addSuggestion avoids duplicate triggers within 5 minutes', () => {
  const recentTime = new Date().toISOString();
  const state = {
    state: 'idle',
    currentEvolution: null,
    suggestions: [
      {
        id: 'sug-recent',
        detectedAt: recentTime,
        triggers: [{ type: 'explicit_creation', priority: 'high', match: 'create new agent' }],
        status: 'pending',
      },
    ],
  };

  const triggers = [{ type: 'explicit_creation', priority: 'high', match: 'create new skill' }];
  const updated = addSuggestion(state, triggers);

  // Should still be 1 because it's a duplicate type
  assert.strictEqual(updated.suggestions.length, 1);
});

// --- EVOLUTION_TRIGGERS structure tests ---

test('EVOLUTION_TRIGGERS has required structure', () => {
  assert.ok(Array.isArray(EVOLUTION_TRIGGERS));
  assert.ok(EVOLUTION_TRIGGERS.length > 0);

  EVOLUTION_TRIGGERS.forEach(trigger => {
    assert.ok(trigger.pattern instanceof RegExp);
    assert.ok(typeof trigger.type === 'string');
    assert.ok(['high', 'medium', 'low'].includes(trigger.priority));
  });
});

// --- Summary ---

console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}

console.log('\nAll tests passed!\n');
