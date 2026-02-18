/**
 * Path Validation Utility (Pattern 2 from Security Mitigation Design)
 *
 * Enhanced path validation with context-specific allowlists
 * Security Controls: SEC-002, SEC-KB-003, SEC-PATH-001 through SEC-PATH-007
 */

const path = require('path');
const fs = require('fs');

// Project root detection
function getProjectRoot() {
  return process.env.PROJECT_ROOT || process.cwd();
}

// Allowed path prefixes for different contexts
const PATH_CONTEXTS = {
  SIDECAR: {
    allowedPrefixes: ['.claude/memory/agents/'],
    description: 'Agent sidecar memory',
  },
  SHARED_MEMORY: {
    allowedPrefixes: ['.claude/context/memory/'],
    description: 'Shared memory files',
  },
  KNOWLEDGE_BASE: {
    allowedPrefixes: ['.claude/context/artifacts/'],
    description: 'Knowledge base index',
  },
  COST_TRACKING: {
    allowedPrefixes: ['.claude/context/metrics/'],
    description: 'Cost tracking logs',
  },
  SKILL_PATHS: {
    allowedPrefixes: ['.claude/skills/', '.claude/agents/', '.claude/workflows/'],
    description: 'Skill and agent definitions',
  },
};

/**
 * Validate path against dangerous patterns
 * @param {string} filePath - Path to validate
 * @returns {Object} { valid: boolean, reason: string }
 */
function validatePathSafety(filePath) {
  // Null/undefined check
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, reason: 'SEC-PATH-001: Path is null or not a string' };
  }

  // Normalize path
  const normalizedPath = path.normalize(filePath);

  // Check for path traversal patterns
  const dangerousPatterns = [
    /(^|[\\/])\.\.([\\/]|$)/, // Path traversal: bare ".." segment
    /^~\//, // Home directory reference
    /^\//, // Absolute Unix path
    /^[A-Za-z]:[\\/]/, // Absolute Windows path
    /\$\{.*\}/, // Template injection
    /%[0-9a-f]{2}/i, // URL encoding in path
    /\0/, // Null byte injection
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(filePath)) {
      return { valid: false, reason: `SEC-PATH-002: Dangerous path pattern detected: ${pattern}` };
    }
  }

  // Verify within project root
  const projectRoot = getProjectRoot();
  const resolvedPath = path.resolve(projectRoot, normalizedPath);

  if (!resolvedPath.startsWith(projectRoot)) {
    return { valid: false, reason: 'SEC-PATH-003: Path resolves outside project root' };
  }

  return { valid: true, reason: 'Path validation passed' };
}

/**
 * Validate path against context-specific allowlist
 * @param {string} filePath - Path to validate
 * @param {string} contextName - Context from PATH_CONTEXTS
 * @returns {Object} { valid: boolean, reason: string }
 */
function validatePathContext(filePath, contextName) {
  // First, validate basic path safety
  const safetyCheck = validatePathSafety(filePath);
  if (!safetyCheck.valid) {
    return safetyCheck;
  }

  // Get context allowlist
  const context = PATH_CONTEXTS[contextName];
  if (!context) {
    return { valid: false, reason: `SEC-PATH-004: Unknown path context: ${contextName}` };
  }

  // Normalize path for comparison
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');

  // Check against allowed prefixes
  const isAllowed = context.allowedPrefixes.some(
    prefix => normalizedPath.startsWith(prefix) || normalizedPath.startsWith('./' + prefix)
  );

  if (!isAllowed) {
    return {
      valid: false,
      reason: `SEC-PATH-005: Path not in allowed prefixes for ${contextName}. Allowed: ${context.allowedPrefixes.join(', ')}`,
    };
  }

  return { valid: true, reason: `Path valid for context: ${context.description}` };
}

/**
 * Validate sidecar path belongs to current agent
 * @param {string} filePath - Sidecar path
 * @param {string} agentName - Expected agent name
 * @returns {Object} { valid: boolean, reason: string }
 */
function validateSidecarOwnership(filePath, agentName) {
  const sidecarCheck = validatePathContext(filePath, 'SIDECAR');
  if (!sidecarCheck.valid) {
    return sidecarCheck;
  }

  // Extract agent name from path
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
  const match = normalizedPath.match(/\.claude\/memory\/agents\/([^/]+)/);

  if (!match) {
    return { valid: false, reason: 'SEC-PATH-006: Could not extract agent name from sidecar path' };
  }

  const pathAgentName = match[1];

  if (pathAgentName !== agentName) {
    return {
      valid: false,
      reason: `SEC-PATH-007: Sidecar path agent "${pathAgentName}" does not match current agent "${agentName}"`,
    };
  }

  return { valid: true, reason: 'Sidecar ownership validated' };
}

module.exports = {
  validatePathSafety,
  validatePathContext,
  validateSidecarOwnership,
  PATH_CONTEXTS,
  getProjectRoot,
};
