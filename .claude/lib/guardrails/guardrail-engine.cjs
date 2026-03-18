'use strict';

const VALID_STATUSES = ['success', 'partial', 'failure'];
const CIRCUIT_BREAKER_THRESHOLD = 2;

// In-memory circuit breaker state per agent
const circuitState = new Map();
// Track last error signature per agent for identical-error detection
const lastErrors = new Map();

function validateTaskOutput(metadata, options = {}) {
  const agentType = options.agentType || 'unknown';
  const checks = [];

  // Handle null/undefined input
  if (!metadata || typeof metadata !== 'object') {
    checks.push({
      name: 'input-validity',
      passed: false,
      message: 'Task output metadata is null, undefined, or not an object',
    });
    recordFailure(agentType, 'null-input');
    return buildResult(checks, agentType);
  }

  // Check 1: summary required
  if (!metadata.summary || typeof metadata.summary !== 'string' || metadata.summary.length === 0) {
    checks.push({
      name: 'summary-present',
      passed: false,
      message: 'Required field "summary" is missing or empty',
    });
  } else {
    checks.push({
      name: 'summary-present',
      passed: true,
      message: 'summary field present',
    });
  }

  // Check 2: status required and valid enum
  if (!metadata.status || !VALID_STATUSES.includes(metadata.status)) {
    checks.push({
      name: 'status-valid',
      passed: false,
      message: `Required field "status" is missing or invalid (must be one of: ${VALID_STATUSES.join(', ')})`,
    });
  } else {
    checks.push({
      name: 'status-valid',
      passed: true,
      message: 'status field valid',
    });
  }

  // Check 3: filesModified required and array
  if (!Array.isArray(metadata.filesModified)) {
    checks.push({
      name: 'filesModified-valid',
      passed: false,
      message: 'Required field "filesModified" is missing or not an array',
    });
  } else {
    checks.push({
      name: 'filesModified-valid',
      passed: true,
      message: 'filesModified field valid',
    });
  }

  const allPassed = checks.every((c) => c.passed);

  if (!allPassed) {
    const errorSig = checks
      .filter((c) => !c.passed)
      .map((c) => c.name)
      .sort()
      .join(',');
    recordFailure(agentType, errorSig);
  } else {
    // Reset error tracking on success
    lastErrors.delete(agentType);
    if (circuitState.get(agentType) === 'open') {
      // Half-open success: close circuit
      circuitState.set(agentType, 'closed');
    }
  }

  return buildResult(checks, agentType);
}

function recordFailure(agentType, errorSignature) {
  const prev = lastErrors.get(agentType);
  if (prev && prev.signature === errorSignature) {
    prev.count += 1;
    if (prev.count >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitState.set(agentType, 'open');
    }
  } else {
    lastErrors.set(agentType, { signature: errorSignature, count: 1 });
  }
}

function buildResult(checks, agentType) {
  const passed = checks.every((c) => c.passed);
  const isOpen = circuitState.get(agentType) === 'open';

  return {
    passed,
    checks,
    circuitBreakerTripped: isOpen,
    retryCount: 0,
    escalated: false,
  };
}

function getCircuitState(agentType) {
  return circuitState.get(agentType) || 'closed';
}

function resetCircuit(agentType) {
  circuitState.delete(agentType);
  lastErrors.delete(agentType);
}

module.exports = {
  validateTaskOutput,
  getCircuitState,
  resetCircuit,
};
