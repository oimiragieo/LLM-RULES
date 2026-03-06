'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const hook = require('../../.claude/hooks/validation/pre-completion-validation.cjs');

// ---------------------------------------------------------------------------
// isValidSummary — unit tests
// ---------------------------------------------------------------------------

test('isValidSummary returns false for null', () => {
  assert.equal(hook.isValidSummary(null), false);
});

test('isValidSummary returns false for undefined', () => {
  assert.equal(hook.isValidSummary(undefined), false);
});

test('isValidSummary returns false for empty string', () => {
  assert.equal(hook.isValidSummary(''), false);
});

test('isValidSummary returns false for summary shorter than 50 chars', () => {
  assert.equal(hook.isValidSummary('Short summary'), false);
});

test('isValidSummary returns false for 49-char summary', () => {
  // Exactly 49 characters — must fail
  assert.equal(hook.isValidSummary('a'.repeat(49)), false);
});

test('isValidSummary returns true for 50-char summary', () => {
  assert.equal(hook.isValidSummary('a'.repeat(50)), true);
});

test('isValidSummary returns true for a substantive summary', () => {
  assert.equal(
    hook.isValidSummary(
      'Added SUMMARY_REQUIRED_ENFORCEMENT block mode to pre-completion-validation hook'
    ),
    true
  );
});

test('isValidSummary returns false for fallback string "Task 2 completed without summary metadata"', () => {
  assert.equal(hook.isValidSummary('Task 2 completed without summary metadata'), false);
});

test('isValidSummary returns false for fallback string with different task number', () => {
  assert.equal(hook.isValidSummary('Task 17 completed without summary metadata'), false);
});

test('isValidSummary returns false for "done"', () => {
  assert.equal(hook.isValidSummary('done'), false);
});

test('isValidSummary returns false for "finished"', () => {
  assert.equal(hook.isValidSummary('finished'), false);
});

test('isValidSummary returns false for "Completed task 5"', () => {
  assert.equal(hook.isValidSummary('Completed task 5'), false);
});

test('isValidSummary rejects summary that is 50+ chars but contains fallback pattern', () => {
  // Pad the fallback string to 50+ chars to verify pattern check fires regardless of length
  const padded = 'Task 3 completed without summary metadata (padded extra text here for length)';
  assert.equal(hook.isValidSummary(padded), false);
});

// ---------------------------------------------------------------------------
// isFallbackSummary — unit tests
// ---------------------------------------------------------------------------

test('isFallbackSummary returns true for canonical fallback "Task 2 completed without summary metadata"', () => {
  assert.equal(hook.isFallbackSummary('Task 2 completed without summary metadata'), true);
});

test('isFallbackSummary returns true for any task number in fallback pattern', () => {
  assert.equal(hook.isFallbackSummary('Task 99 completed without summary metadata'), true);
});

test('isFallbackSummary is case-insensitive', () => {
  assert.equal(hook.isFallbackSummary('TASK 5 COMPLETED WITHOUT SUMMARY METADATA'), true);
});

test('isFallbackSummary returns false for a real summary', () => {
  assert.equal(
    hook.isFallbackSummary(
      'Upgraded pre-completion-validation hook to block mode for missing summaries'
    ),
    false
  );
});

test('isFallbackSummary returns false for null', () => {
  assert.equal(hook.isFallbackSummary(null), false);
});

test('isFallbackSummary returns false for empty string', () => {
  assert.equal(hook.isFallbackSummary(''), false);
});

test('isFallbackSummary matches fallback embedded in longer string', () => {
  // The regex is not anchored — it should match anywhere in the string
  const embedded = 'prefix Task 4 completed without summary metadata suffix';
  assert.equal(hook.isFallbackSummary(embedded), true);
});
