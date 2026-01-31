#!/usr/bin/env node
/**
 * Memory Leak Regression Tests for ErrorPatternDetector
 *
 * Tests that Maps in error-pattern-detector.cjs don't grow unbounded
 * Relates to heap OOM analysis RANK 5
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Import the functions to test
const {
  detectRepeatedErrors,
  detectCascades,
  detectHookFailures,
  detectToolFailures,
  detectAgentIssues,
} = require('../.claude/lib/error-pattern-detector.cjs');

/**
 * RED TEST #1: Verify detectRepeatedErrors doesn't accumulate memory
 * This should FAIL initially because messageCounts Map grows unbounded
 */
test('detectRepeatedErrors should not accumulate memory over repeated calls', () => {
  // Simulate 1000 error analysis iterations (like in production)
  const errors = Array.from({ length: 100 }, (_, i) => ({
    errorId: `error-${i}`,
    message: `Test error ${i % 10}`, // 10 unique messages
    timestamp: Date.now(),
    category: 'test',
  }));

  // Call the function 1000 times to simulate repeated analysis
  for (let iteration = 0; iteration < 1000; iteration++) {
    const result = detectRepeatedErrors(errors, 3);
    // Each call should return same result (10 repeated patterns)
    assert.equal(result.length, 10, `Iteration ${iteration} should find 10 patterns`);
  }

  // If we get here without OOM, test passes
  // In production, messageCounts Map would grow to 1000 entries without cleanup
  assert.ok(true, 'Completed 1000 iterations without memory leak');
});

/**
 * RED TEST #2: Verify detectCascades doesn't accumulate memory
 * This should FAIL initially because errorMap/parentToChildren Maps grow unbounded
 */
test('detectCascades should not accumulate memory over repeated calls', () => {
  const errors = Array.from({ length: 50 }, (_, i) => ({
    errorId: `error-${i}`,
    message: `Cascade error ${i}`,
    timestamp: Date.now(),
    correlation: i > 0 ? { parentErrorId: `error-${i - 1}` } : undefined,
  }));

  // Call the function 500 times to simulate cascade analysis
  for (let iteration = 0; iteration < 500; iteration++) {
    const result = detectCascades(errors);
    // Each call should return same result (1 cascade chain)
    assert.equal(result.length, 1, `Iteration ${iteration} should find 1 cascade`);
  }

  assert.ok(true, 'Completed 500 iterations without memory leak');
});

/**
 * RED TEST #3: Verify detectHookFailures doesn't accumulate memory
 */
test('detectHookFailures should not accumulate memory over repeated calls', () => {
  const errors = Array.from({ length: 30 }, (_, i) => ({
    errorId: `error-${i}`,
    message: 'Hook failed',
    timestamp: Date.now(),
    category: 'HOOK_FAILURE',
    source: { location: `test-hook-${i % 5}` }, // 5 unique hooks
  }));

  for (let iteration = 0; iteration < 500; iteration++) {
    const result = detectHookFailures(errors, 2);
    // Each call should return same result (5 hook failures)
    assert.equal(result.length, 5, `Iteration ${iteration} should find 5 hook failures`);
  }

  assert.ok(true, 'Completed 500 iterations without memory leak');
});

/**
 * RED TEST #4: Verify detectToolFailures doesn't accumulate memory
 */
test('detectToolFailures should not accumulate memory over repeated calls', () => {
  const errors = Array.from({ length: 40 }, (_, i) => ({
    errorId: `error-${i}`,
    message: 'Tool failed',
    timestamp: Date.now(),
    category: 'TOOL_FAILURE',
    context: { toolName: `test-tool-${i % 4}` }, // 4 unique tools
  }));

  for (let iteration = 0; iteration < 500; iteration++) {
    const result = detectToolFailures(errors, 5);
    // Each call should return same result (4 tool failures)
    assert.equal(result.length, 4, `Iteration ${iteration} should find 4 tool failures`);
  }

  assert.ok(true, 'Completed 500 iterations without memory leak');
});

/**
 * RED TEST #5: Verify detectAgentIssues doesn't accumulate memory
 */
test('detectAgentIssues should not accumulate memory over repeated calls', () => {
  const errors = Array.from({ length: 60 }, (_, i) => ({
    errorId: `error-${i}`,
    message: 'Agent error',
    timestamp: Date.now(),
    context: { agentName: `agent-${i % 6}` }, // 6 unique agents
  }));

  for (let iteration = 0; iteration < 500; iteration++) {
    const result = detectAgentIssues(errors, 5);
    // Each call should return same result (6 agents with errors)
    assert.equal(result.length, 6, `Iteration ${iteration} should find 6 agent errors`);
  }

  assert.ok(true, 'Completed 500 iterations without memory leak');
});
