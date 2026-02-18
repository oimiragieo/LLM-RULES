// .claude/lib/utils/retry-with-backoff.cjs
// Retry utility with exponential backoff (Task #33)

/**
 * Transient error codes that should be retried
 *
 * Transient errors are temporary conditions that may resolve on retry:
 * - EBUSY: Resource busy (file locked, database locked)
 * - EAGAIN: Resource temporarily unavailable
 * - ETIMEDOUT: Operation timed out
 * - ENOTFOUND: DNS lookup failed (network issue)
 * - ECONNRESET: Connection reset by peer
 * - ECONNREFUSED: Connection refused (service temporarily down)
 * - ENETUNREACH: Network unreachable
 * - EHOSTUNREACH: Host unreachable
 */
const TRANSIENT_ERROR_CODES = new Set([
  'EBUSY',
  'EAGAIN',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

/**
 * Permanent error types that should NOT be retried
 *
 * These errors indicate programming errors or permanent conditions:
 * - SyntaxError: Invalid code (won't fix itself)
 * - TypeError: Type mismatch (programming error)
 * - ReferenceError: Undefined variable (programming error)
 */
const PERMANENT_ERROR_TYPES = new Set(['SyntaxError', 'TypeError', 'ReferenceError']);

/**
 * Check if an error is transient (should be retried)
 *
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is transient, false if permanent
 */
function isTransientError(error) {
  // Guard against null/undefined error values
  if (!error) {
    return false;
  }

  // Check for permanent error types first
  if (PERMANENT_ERROR_TYPES.has(error.constructor.name)) {
    return false;
  }

  // Check for transient error codes
  if (error.code && TRANSIENT_ERROR_CODES.has(error.code)) {
    return true;
  }

  // Default: treat as permanent (conservative)
  // This prevents infinite retries on unknown errors
  return false;
}

/**
 * Retry an async operation with exponential backoff
 *
 * Implements exponential backoff: baseDelay * (2 ^ attempt)
 * - Attempt 0: baseDelay (1000ms = 1s)
 * - Attempt 1: baseDelay * 2 (2000ms = 2s)
 * - Attempt 2: baseDelay * 4 (4000ms = 4s)
 * - Attempt 3: baseDelay * 8 (8000ms = 8s)
 * - Attempt 4: baseDelay * 16 (16000ms = 16s)
 *
 * Only retries transient errors (EBUSY, EAGAIN, ETIMEDOUT, etc.)
 * Does NOT retry permanent errors (ENOENT, EACCES, SyntaxError, etc.)
 *
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Options
 * @param {number} options.maxRetries - Maximum number of retries (default: 5)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
 * @param {Function} options.onRetry - Callback when retrying (error, attempt) => void
 * @returns {Promise<*>} Result of operation
 * @throws {Error} Last error if all retries exhausted
 *
 * @example
 * const result = await retryWithBackoff(
 *   async () => await db.query('SELECT * FROM users'),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 */
async function retryWithBackoff(operation, options = {}) {
  const { maxRetries = 5, baseDelay = 1000, onRetry = null } = options;

  if (maxRetries < 0) {
    throw new RangeError(`maxRetries must be >= 0, got: ${maxRetries}`);
  }

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt operation
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry =
        attempt < maxRetries && // Have retries left
        isTransientError(error); // Error is transient

      if (!shouldRetry) {
        // Permanent error or max retries exceeded
        throw error;
      }

      // Calculate delay: baseDelay * (2 ^ attempt)
      const delay = baseDelay * Math.pow(2, attempt);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(error, attempt + 1); // attempt + 1 for human-readable (1-based)
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // Should never reach here, but throw last error if we do
  throw lastError;
}

/**
 * Sleep for specified milliseconds
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  retryWithBackoff,
  isTransientError,
};
