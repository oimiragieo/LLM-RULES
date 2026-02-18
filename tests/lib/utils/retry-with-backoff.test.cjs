'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  retryWithBackoff,
  isTransientError,
} = require('../../../.claude/lib/utils/retry-with-backoff.cjs');

// ---------------------------------------------------------------------------
// Bug 1: isTransientError crashes on null/undefined (Bug 2 in task description)
// ---------------------------------------------------------------------------

test('isTransientError returns false for null', () => {
  assert.strictEqual(isTransientError(null), false);
});

test('isTransientError returns false for undefined', () => {
  assert.strictEqual(isTransientError(undefined), false);
});

test('isTransientError still returns true for ECONNRESET error after null guard', () => {
  const err = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
  assert.strictEqual(isTransientError(err), true);
});

test('isTransientError still returns false for TypeError after null guard', () => {
  const err = new TypeError('bad type');
  assert.strictEqual(isTransientError(err), false);
});

// ---------------------------------------------------------------------------
// Bug 2: throw undefined when maxRetries < 0 (Bug 1 in task description)
// ---------------------------------------------------------------------------

test('retryWithBackoff throws RangeError with descriptive message when maxRetries is -1', async () => {
  await assert.rejects(
    () => retryWithBackoff(() => Promise.reject(new Error('fail')), { maxRetries: -1 }),
    err => {
      assert.ok(err instanceof RangeError, `Expected RangeError but got ${err?.constructor?.name}`);
      assert.ok(err.message.includes('-1'), `Expected message to include -1, got: ${err.message}`);
      return true;
    }
  );
});

test('retryWithBackoff throws RangeError with descriptive message when maxRetries is -5', async () => {
  await assert.rejects(
    () => retryWithBackoff(() => Promise.reject(new Error('fail')), { maxRetries: -5 }),
    err => {
      assert.ok(err instanceof RangeError, `Expected RangeError but got ${err?.constructor?.name}`);
      return true;
    }
  );
});

test('retryWithBackoff does NOT throw RangeError when maxRetries is 0', async () => {
  const transientErr = Object.assign(new Error('busy'), { code: 'EBUSY' });
  // With maxRetries=0 and a transient error, it should throw the original error (not undefined, not RangeError)
  await assert.rejects(
    () => retryWithBackoff(() => Promise.reject(transientErr), { maxRetries: 0, baseDelay: 0 }),
    err => {
      assert.ok(!(err instanceof RangeError), 'Should not be a RangeError for maxRetries=0');
      assert.strictEqual(err, transientErr, 'Should throw the original transient error');
      return true;
    }
  );
});

test('retryWithBackoff succeeds normally when operation succeeds', async () => {
  const result = await retryWithBackoff(() => Promise.resolve(42), { maxRetries: 3 });
  assert.strictEqual(result, 42);
});
