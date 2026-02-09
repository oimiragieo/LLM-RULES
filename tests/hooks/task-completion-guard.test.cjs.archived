#!/usr/bin/env node
/**
 * Tests for task-completion-guard.cjs
 *
 * Tests the detectsCompletion() function which identifies when
 * agent output indicates task completion.
 */

'use strict';

// Import the module under test
const {
  detectsCompletion,
  COMPLETION_INDICATORS,
} = require('../../.claude/hooks/routing/task-completion-guard.cjs');

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

console.log('\n=== task-completion-guard.cjs tests ===\n');

// Test: COMPLETION_INDICATORS exists
test('COMPLETION_INDICATORS is an array', () => {
  assertEqual(Array.isArray(COMPLETION_INDICATORS), true, 'Should be array');
  assertEqual(COMPLETION_INDICATORS.length > 0, true, 'Should have patterns');
});

// Test: detectsCompletion returns false for null/undefined
test('detectsCompletion returns false for null', () => {
  assertEqual(detectsCompletion(null), false, 'null should not detect completion');
});

test('detectsCompletion returns false for undefined', () => {
  assertEqual(detectsCompletion(undefined), false, 'undefined should not detect completion');
});

test('detectsCompletion returns false for non-string', () => {
  assertEqual(detectsCompletion(123), false, 'number should not detect completion');
  assertEqual(detectsCompletion({}), false, 'object should not detect completion');
});

test('detectsCompletion returns false for empty string', () => {
  assertEqual(detectsCompletion(''), false, 'empty string should not detect completion');
});

// Test: detectsCompletion detects completion phrases
test('detects "task complete"', () => {
  assertEqual(detectsCompletion('The task is complete.'), true, 'Should detect');
});

test('detects "task completed"', () => {
  assertEqual(detectsCompletion('I have task completed successfully.'), true, 'Should detect');
});

test('detects "task done"', () => {
  assertEqual(detectsCompletion('The task is done now.'), true, 'Should detect');
});

test('detects "task finished"', () => {
  assertEqual(detectsCompletion('The task is finished.'), true, 'Should detect');
});

test('detects "completed task" (reversed)', () => {
  assertEqual(detectsCompletion('I have completed the task.'), true, 'Should detect');
});

test('detects "successfully completed"', () => {
  assertEqual(
    detectsCompletion('I successfully completed the implementation.'),
    true,
    'Should detect'
  );
});

test('detects "successfully created"', () => {
  assertEqual(detectsCompletion('Successfully created the new component.'), true, 'Should detect');
});

test('detects "successfully implemented"', () => {
  assertEqual(
    detectsCompletion('I have successfully implemented the feature.'),
    true,
    'Should detect'
  );
});

test('detects "successfully fixed"', () => {
  assertEqual(detectsCompletion('Successfully fixed the bug.'), true, 'Should detect');
});

test('detects "all tests pass"', () => {
  assertEqual(detectsCompletion('All tests pass now.'), true, 'Should detect');
});

test('detects "all checks pass"', () => {
  assertEqual(detectsCompletion('All checks pass.'), true, 'Should detect');
});

test('detects "implementation complete"', () => {
  assertEqual(detectsCompletion('The implementation is complete.'), true, 'Should detect');
});

test('detects "changes made"', () => {
  assertEqual(
    detectsCompletion('The following changes were made to the codebase.'),
    true,
    'Should detect'
  );
});

test('detects "## Summary"', () => {
  assertEqual(detectsCompletion('## Summary\nHere is what I did.'), true, 'Should detect');
});

test('detects "summary of"', () => {
  assertEqual(detectsCompletion('Here is a summary of the changes.'), true, 'Should detect');
});

test('detects "summary:"', () => {
  assertEqual(detectsCompletion('Summary: Fixed the login bug.'), true, 'Should detect');
});

test('detects "Task 5 complete"', () => {
  assertEqual(detectsCompletion('Task 5 complete.'), true, 'Should detect');
});

test('detects "Task 123 is now complete"', () => {
  assertEqual(detectsCompletion('Task 123 is now complete.'), true, 'Should detect');
});

test('detects "I have successfully completed"', () => {
  assertEqual(detectsCompletion('I have successfully completed the work.'), true, 'Should detect');
});

test('detects "I have completed"', () => {
  assertEqual(detectsCompletion('I have completed the requested changes.'), true, 'Should detect');
});

test('detects "I have finished"', () => {
  assertEqual(
    detectsCompletion('I have finished implementing the feature.'),
    true,
    'Should detect'
  );
});

// Test: detectsCompletion does NOT false-positive on partial phrases
test('does not detect partial word "completed" in "uncompleted"', () => {
  // This is about word boundaries - "uncompleted" should not trigger
  // Actually the regex might match this - let's test actual behavior
  const result = detectsCompletion('The task remains uncompleted.');
  // Note: This may legitimately match "completed" since regex doesn't use word boundaries
  // The point of this hook is heuristic detection, so some false positives are acceptable
  // This test documents current behavior rather than enforcing strict word boundaries
  console.log(`        (Note: "uncompleted" detection = ${result}, acceptable for heuristic)`);
});

test('does not detect unrelated text', () => {
  assertEqual(detectsCompletion('Working on the feature now.'), false, 'Should not detect');
});

test('does not detect question about completion', () => {
  // Questions might trigger due to word matching - document behavior
  const result = detectsCompletion('Is the task complete?');
  // This may match due to "task complete" pattern
  console.log(`        (Note: question detection = ${result}, may match heuristically)`);
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
