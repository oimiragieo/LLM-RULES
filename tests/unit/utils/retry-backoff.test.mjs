// tests/unit/utils/retry-backoff.test.mjs
// Unit tests for retry logic with exponential backoff (Task #33)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import retry utility
const {
  retryWithBackoff,
  isTransientError,
} = require('../../../.claude/lib/utils/retry-with-backoff.cjs');

describe('Retry with Exponential Backoff', () => {
  describe('retryWithBackoff()', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        return 'success';
      };

      const result = await retryWithBackoff(operation);

      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 1, 'Should only call operation once');
    });

    it('should retry on transient error and eventually succeed', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Resource busy');
          error.code = 'EBUSY';
          throw error;
        }
        return 'success';
      };

      const result = await retryWithBackoff(operation);

      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 3, 'Should retry until success');
    });

    it('should use exponential backoff delays: 1s, 2s, 4s, 8s, 16s', async () => {
      let attempts = 0;

      const operation = async () => {
        attempts++;
        if (attempts < 4) {
          const error = new Error('EAGAIN');
          error.code = 'EAGAIN';
          throw error;
        }
        return 'success';
      };

      const startTime = Date.now();
      await retryWithBackoff(operation, {
        baseDelay: 100, // Use 100ms for fast tests
        maxRetries: 5,
      });
      const totalTime = Date.now() - startTime;

      // With baseDelay 100ms: 100 + 200 + 400 = 700ms minimum
      assert.ok(totalTime >= 700, `Total time ${totalTime}ms should be >= 700ms`);
      assert.strictEqual(attempts, 4, 'Should have 4 attempts (1 + 3 retries)');
    });

    it('should stop retrying after maxRetries', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        const error = new Error('Always fails');
        error.code = 'EBUSY';
        throw error;
      };

      await assert.rejects(
        async () => {
          await retryWithBackoff(operation, { maxRetries: 3 });
        },
        {
          message: 'Always fails',
        }
      );

      assert.strictEqual(attempts, 4, 'Should attempt 4 times (1 + 3 retries)');
    });

    it('should not retry on permanent errors', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        const error = new Error('File not found');
        error.code = 'ENOENT';
        throw error;
      };

      await assert.rejects(
        async () => {
          await retryWithBackoff(operation);
        },
        {
          message: 'File not found',
        }
      );

      assert.strictEqual(attempts, 1, 'Should not retry on permanent error');
    });

    it('should not retry on invalid syntax errors', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new SyntaxError('Unexpected token');
      };

      await assert.rejects(async () => {
        await retryWithBackoff(operation);
      }, SyntaxError);

      assert.strictEqual(attempts, 1, 'Should not retry on syntax error');
    });

    it('should respect custom maxRetries option', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        const error = new Error('EAGAIN');
        error.code = 'EAGAIN';
        throw error;
      };

      await assert.rejects(
        async () => {
          await retryWithBackoff(operation, { maxRetries: 2 });
        },
        {
          message: 'EAGAIN',
        }
      );

      assert.strictEqual(attempts, 3, 'Should attempt 3 times (1 + 2 retries)');
    });

    it('should respect custom baseDelay option', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('EBUSY');
          error.code = 'EBUSY';
          throw error;
        }
        return 'success';
      };

      const startTime = Date.now();
      await retryWithBackoff(operation, {
        baseDelay: 50, // 50ms base
        maxRetries: 5,
      });
      const totalTime = Date.now() - startTime;

      // With baseDelay 50ms: 50 + 100 = 150ms minimum
      assert.ok(totalTime >= 150, `Total time ${totalTime}ms should be >= 150ms`);
    });

    it('should call onRetry callback when retrying', async () => {
      const retryAttempts = [];
      let attempts = 0;

      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('EBUSY');
          error.code = 'EBUSY';
          throw error;
        }
        return 'success';
      };

      const onRetry = (error, attempt) => {
        retryAttempts.push({ error: error.message, attempt });
      };

      await retryWithBackoff(operation, { onRetry });

      assert.strictEqual(retryAttempts.length, 2, 'Should call onRetry twice');
      assert.deepStrictEqual(
        retryAttempts.map(r => r.attempt),
        [1, 2],
        'Should have correct attempt numbers'
      );
    });
  });

  describe('isTransientError()', () => {
    it('should identify EBUSY as transient', () => {
      const error = new Error('Resource busy');
      error.code = 'EBUSY';
      assert.strictEqual(isTransientError(error), true);
    });

    it('should identify EAGAIN as transient', () => {
      const error = new Error('Try again');
      error.code = 'EAGAIN';
      assert.strictEqual(isTransientError(error), true);
    });

    it('should identify ETIMEDOUT as transient', () => {
      const error = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      assert.strictEqual(isTransientError(error), true);
    });

    it('should identify ENOTFOUND as transient (network)', () => {
      const error = new Error('Not found');
      error.code = 'ENOTFOUND';
      assert.strictEqual(isTransientError(error), true);
    });

    it('should identify ECONNRESET as transient', () => {
      const error = new Error('Connection reset');
      error.code = 'ECONNRESET';
      assert.strictEqual(isTransientError(error), true);
    });

    it('should identify ENOENT as permanent', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      assert.strictEqual(isTransientError(error), false);
    });

    it('should identify EACCES as permanent', () => {
      const error = new Error('Access denied');
      error.code = 'EACCES';
      assert.strictEqual(isTransientError(error), false);
    });

    it('should identify EPERM as permanent', () => {
      const error = new Error('Permission denied');
      error.code = 'EPERM';
      assert.strictEqual(isTransientError(error), false);
    });

    it('should identify SyntaxError as permanent', () => {
      const error = new SyntaxError('Unexpected token');
      assert.strictEqual(isTransientError(error), false);
    });

    it('should identify TypeError as permanent', () => {
      const error = new TypeError('Invalid type');
      assert.strictEqual(isTransientError(error), false);
    });

    it('should identify unknown errors as permanent (conservative)', () => {
      const error = new Error('Unknown error');
      // No error.code set
      assert.strictEqual(isTransientError(error), false);
    });
  });
});
