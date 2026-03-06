# Error Recovery Template

Standardized template for implementing error recovery patterns in hooks, tools, and agents.

## Template Usage

Use this template when implementing error handling in:

- Hook scripts
- CLI tools
- Agent workflows
- Background processes

## Error Recovery Pattern

```javascript
#!/usr/bin/env node
/**
 * [Component Name]
 *
 * [Brief description of what this component does]
 *
 * Error Recovery Strategy: [fail-closed | fail-open | retry]
 */

'use strict';

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Retry configuration
  maxRetries: 3,
  baseBackoffMs: 100,
  maxBackoffMs: 5000,

  // Timeout configuration
  operationTimeoutMs: 30000,

  // Error recovery mode
  // 'fail-closed': Block on error (security-critical)
  // 'fail-open': Allow on error (non-critical)
  // 'retry': Retry with backoff (transient errors)
  recoveryMode: 'fail-closed',

  // Environment override
  recoveryModeEnvVar: 'COMPONENT_RECOVERY_MODE',
};

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Transient error - can be retried
 */
class TransientError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'TransientError';
    this.cause = cause;
    this.retryable = true;
  }
}

/**
 * Permanent error - cannot be retried
 */
class PermanentError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PermanentError';
    this.cause = cause;
    this.retryable = false;
  }
}

/**
 * Security error - must fail closed
 */
class SecurityError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SecurityError';
    this.cause = cause;
    this.retryable = false;
    this.failClosed = true;
  }
}

// =============================================================================
// Retry Logic
// =============================================================================

/**
 * Calculate exponential backoff with jitter
 */
function calculateBackoff(attempt) {
  const exponentialDelay = CONFIG.baseBackoffMs * Math.pow(2, attempt);
  const jitter = Math.random() * CONFIG.baseBackoffMs;
  return Math.min(exponentialDelay + jitter, CONFIG.maxBackoffMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute operation with retry
 */
async function executeWithRetry(operation, context = {}) {
  let lastError;

  for (let attempt = 0; attempt < CONFIG.maxRetries; attempt++) {
    try {
      // Apply backoff on retries
      if (attempt > 0) {
        const backoffMs = calculateBackoff(attempt - 1);
        logDebug(`Retry ${attempt}/${CONFIG.maxRetries}, backoff: ${backoffMs}ms`);
        await sleep(backoffMs);
      }

      return await operation();
    } catch (error) {
      lastError = error;

      // Security errors always fail immediately
      if (error instanceof SecurityError || error.failClosed) {
        logError('Security error - failing closed', error);
        throw error;
      }

      // Permanent errors don't retry
      if (error instanceof PermanentError || error.retryable === false) {
        logError('Permanent error - not retrying', error);
        throw error;
      }

      // Log transient error
      logWarning(`Transient error (attempt ${attempt + 1}/${CONFIG.maxRetries})`, error);
    }
  }

  // All retries exhausted
  throw new PermanentError(`Operation failed after ${CONFIG.maxRetries} retries`, lastError);
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Get recovery mode from environment or config
 */
function getRecoveryMode() {
  const envMode = process.env[CONFIG.recoveryModeEnvVar];
  if (envMode && ['fail-closed', 'fail-open', 'retry'].includes(envMode)) {
    return envMode;
  }
  return CONFIG.recoveryMode;
}

/**
 * Handle error based on recovery mode
 */
function handleError(error, context = {}) {
  const mode = getRecoveryMode();

  // Always log the error
  logError('Error occurred', error, context);

  // Audit log for security
  auditLog('error', {
    error: error.message,
    type: error.name,
    context,
    recoveryMode: mode,
    timestamp: new Date().toISOString(),
  });

  switch (mode) {
    case 'fail-closed':
      // Security-critical: block on any error
      return {
        action: 'block',
        exitCode: 2,
        message: `Blocked due to error: ${error.message}`,
      };

    case 'fail-open':
      // Non-critical: allow on error
      return {
        action: 'allow',
        exitCode: 0,
        message: `Allowed despite error: ${error.message}`,
      };

    case 'retry':
      // Handled by executeWithRetry
      return {
        action: 'retry',
        exitCode: 1,
        message: `Retry exhausted: ${error.message}`,
      };

    default:
      // Unknown mode: fail closed for safety
      return {
        action: 'block',
        exitCode: 2,
        message: `Unknown recovery mode - blocked: ${error.message}`,
      };
  }
}

// =============================================================================
// Logging
// =============================================================================

/**
 * Log debug message (only when DEBUG_HOOKS is set)
 */
function logDebug(message, ...args) {
  if (process.env.DEBUG_HOOKS) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
}

/**
 * Log warning message
 */
function logWarning(message, error) {
  console.error(`[WARN] ${message}: ${error.message}`);
}

/**
 * Log error message
 */
function logError(message, error, context = {}) {
  console.error(`[ERROR] ${message}: ${error.message}`);
  if (process.env.DEBUG_HOOKS) {
    console.error('Stack:', error.stack);
    console.error('Context:', JSON.stringify(context));
  }
}

/**
 * Audit log for security events
 */
function auditLog(event, data) {
  console.error(
    JSON.stringify({
      component: 'component-name',
      event,
      ...data,
    })
  );
}

// =============================================================================
// Main Execution Template
// =============================================================================

/**
 * Main execution function with error recovery
 */
async function main() {
  let exitCode = 0;
  let context = {};

  try {
    // Parse input
    const input = await parseInput();
    context = { input };

    // Validate input
    if (!input) {
      throw new PermanentError('No input provided');
    }

    // Execute main operation
    const result = await executeWithRetry(async () => {
      return await performOperation(input);
    }, context);

    // Handle success
    if (result.success) {
      exitCode = 0;
    } else {
      exitCode = result.blocked ? 2 : 1;
    }
  } catch (error) {
    // Handle error based on recovery mode
    const recovery = handleError(error, context);
    exitCode = recovery.exitCode;

    if (recovery.message) {
      console.log(recovery.message);
    }
  }

  process.exit(exitCode);
}

// =============================================================================
// Input/Output Helpers
// =============================================================================

/**
 * Parse input from stdin or arguments
 */
async function parseInput() {
  // Try command line argument first
  if (process.argv[2]) {
    try {
      return JSON.parse(process.argv[2]);
    } catch (e) {
      // Not valid JSON, try stdin
    }
  }

  // Read from stdin
  return new Promise(resolve => {
    let input = '';
    let hasData = false;

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', chunk => {
      hasData = true;
      input += chunk;
    });

    process.stdin.on('end', () => {
      if (!hasData || !input.trim()) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(input));
      } catch (e) {
        resolve(null);
      }
    });

    process.stdin.on('error', () => resolve(null));

    setTimeout(() => {
      if (!hasData) resolve(null);
    }, 100);

    process.stdin.resume();
  });
}

/**
 * Perform the main operation
 * @param {Object} input - Parsed input
 * @returns {Object} Result with success/blocked flags
 */
async function performOperation(input) {
  // TODO: Implement your operation here
  // Throw TransientError for retryable failures
  // Throw PermanentError for non-retryable failures
  // Throw SecurityError for security-critical failures

  return { success: true };
}

// =============================================================================
// Entry Point
// =============================================================================

if (require.main === module) {
  main();
}

module.exports = {
  TransientError,
  PermanentError,
  SecurityError,
  executeWithRetry,
  handleError,
  CONFIG,
};
```

## Error Types Reference

| Error Type       | Retryable | Fail Behavior      | Use Case                         |
| ---------------- | --------- | ------------------ | -------------------------------- |
| `TransientError` | Yes       | Retry with backoff | Network timeout, file lock       |
| `PermanentError` | No        | Depends on mode    | Invalid input, missing file      |
| `SecurityError`  | No        | Always fail closed | Auth failure, injection detected |

## Recovery Modes

| Mode          | Behavior        | Use Case                |
| ------------- | --------------- | ----------------------- |
| `fail-closed` | Exit 2 on error | Security-critical hooks |
| `fail-open`   | Exit 0 on error | Recording/memory hooks  |
| `retry`       | Retry then fail | Network operations      |

## Environment Variables

| Variable                  | Values                        | Default     | Purpose                |
| ------------------------- | ----------------------------- | ----------- | ---------------------- |
| `COMPONENT_RECOVERY_MODE` | fail-closed, fail-open, retry | fail-closed | Override recovery mode |
| `DEBUG_HOOKS`             | true, false                   | false       | Enable debug logging   |

## Usage Examples

### Security-Critical Hook

```javascript
const CONFIG = {
  recoveryMode: 'fail-closed',
  recoveryModeEnvVar: 'SECURITY_HOOK_RECOVERY_MODE',
};

// Input validation failure
if (!isValidInput(input)) {
  throw new SecurityError('Invalid input detected - possible injection');
}
```

### Recording Hook

```javascript
const CONFIG = {
  recoveryMode: 'fail-open',
  recoveryModeEnvVar: 'RECORDING_HOOK_RECOVERY_MODE',
};

// File write failure - don't block operation
try {
  await writeRecordToFile(record);
} catch (error) {
  logWarning('Failed to write record', error);
  // Continue without blocking
}
```

### Network Operation

```javascript
const CONFIG = {
  recoveryMode: 'retry',
  maxRetries: 5,
  baseBackoffMs: 200,
};

// Network call with retry
const result = await executeWithRetry(async () => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new TransientError(`HTTP ${response.status}`);
  }
  return response.json();
});
```

## Integration with Existing Hooks

To add error recovery to an existing hook:

1. Import the error classes and handlers:

```javascript
const {
  TransientError,
  PermanentError,
  SecurityError,
  handleError,
} = require('../../templates/error-recovery.cjs');
```

1. Wrap main logic in try-catch:

```javascript
try {
  // Existing logic
} catch (error) {
  const recovery = handleError(error);
  process.exit(recovery.exitCode);
}
```

1. Classify errors appropriately:

```javascript
// Security error
if (suspiciousPattern.test(input)) {
  throw new SecurityError('Suspicious pattern detected');
}

// Transient error (retryable)
if (fileIsLocked) {
  throw new TransientError('File is locked');
}

// Permanent error
if (!fileExists) {
  throw new PermanentError('Required file not found');
}
```

## Related Documentation

- **Hook Development Guide**: `.claude/docs/HOOK_DEVELOPMENT_GUIDE.md`
- **Hooks Reference**: `.claude/docs/HOOKS_REFERENCE.md`
- **Security Validators**: `.claude/docs/SECURITY_VALIDATORS.md`
