#!/usr/bin/env node
/**
 * Hook Input Parser - Shared utility for parsing hook input
 *
 * Eliminates duplicated parseHookInput() function across 40+ hooks.
 * Provides both sync and async parsing, enforcement checking, and audit logging.
 *
 * Usage:
 *   const { parseHookInputSync, parseHookInputAsync, isEnabled, auditLog } = require('../../lib/utils/hook-input.cjs');
 *   const input = parseHookInputSync();  // or await parseHookInputAsync()
 *
 * Input format from Claude Code:
 * - PreToolUse: { tool_name, tool_input, session_id, ... }
 * - PostToolUse: { tool_name, tool_output, tool_input, ... }
 * - UserPromptSubmit: { prompt, session_id, ... }
 *
 * @module hook-input
 */

'use strict';

const { safeParseJSON } = require('./safe-json.cjs');

/**
 * Default timeout for stdin reading in milliseconds
 * @constant {number}
 */
const DEFAULT_TIMEOUT_MS = 100;

/**
 * Keys allowed in hook input objects for SEC-007 sanitization
 * @constant {string[]}
 */
const ALLOWED_HOOK_INPUT_KEYS = [
  'tool_name',
  'tool',
  'tool_input',
  'input',
  'parameters',
  'tool_output',
  'output',
  'result',
  'session_id',
  'prompt',
  'file_path',
  'filePath',
  'path',
  'notebook_path',
  'content',
  'old_string',
  'new_string',
];

/**
 * Valid enforcement modes
 * @constant {string[]}
 */
const VALID_ENFORCEMENT_MODES = ['block', 'warn', 'off'];

/**
 * Keys to strip for prototype pollution prevention (SEC-007)
 * @constant {string[]}
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Sanitize parsed JSON object to prevent prototype pollution
 * @param {Object} parsed - Parsed JSON object
 * @param {boolean} [filterByAllowedKeys=false] - Whether to filter by ALLOWED_HOOK_INPUT_KEYS
 * @returns {Object|null} Sanitized object or null
 */
function sanitizeObject(parsed, filterByAllowedKeys = false) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  // Create clean object without prototype
  const clean = Object.create(null);

  for (const key of Object.keys(parsed)) {
    // Skip dangerous keys (SEC-007)
    if (DANGEROUS_KEYS.includes(key)) {
      continue;
    }

    // Skip unknown keys at top level when filtering is enabled
    if (filterByAllowedKeys && !ALLOWED_HOOK_INPUT_KEYS.includes(key)) {
      continue;
    }

    const value = parsed[key];

    // Deep copy nested objects (don't filter nested objects by allowed keys)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = sanitizeObject(value, false) || {};
    } else if (Array.isArray(value)) {
      clean[key] = [...value];
    } else {
      clean[key] = value;
    }
  }

  return Object.assign({}, clean);
}

/**
 * Parse hook input synchronously from argv[2]
 *
 * @returns {Object|null} Parsed hook context or null if no input
 */
function parseHookInputSync() {
  if (!process.argv[2]) {
    return null;
  }

  const parsed = safeParseJSON(process.argv[2]);
  if (!parsed || Object.keys(parsed).length === 0) return null;
  return sanitizeObject(parsed);
}

/**
 * Parse hook input asynchronously from stdin or argv[2]
 *
 * @param {Object} [options] - Parser options
 * @param {number} [options.timeout=100] - Timeout in ms to wait for stdin
 * @param {boolean} [options.allowEmpty=true] - Return null instead of throwing on empty input
 * @returns {Promise<Object|null>} Parsed hook context or null if no input
 */
async function parseHookInputAsync(options = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, allowEmpty = true } = options;

  // Try command line argument first (older hook format, some hooks still use this)
  if (process.argv[2]) {
    const parsed = safeParseJSON(process.argv[2]);
    if (parsed && Object.keys(parsed).length > 0) {
      return sanitizeObject(parsed);
    }
  }

  // Read from stdin (current hook format)
  return new Promise(resolve => {
    let input = '';
    let hasData = false;
    let resolved = false;

    // Helper to resolve only once
    const resolveOnce = value => {
      if (!resolved) {
        resolved = true;
        resolve(value);
      }
    };

    // Set encoding for proper text handling
    process.stdin.setEncoding('utf8');

    // Store listener references for cleanup (prevent memory leak when used as library)
    const dataListener = chunk => {
      hasData = true;
      input += chunk;
    };

    const endListener = () => {
      if (!hasData || !input.trim()) {
        cleanup();
        resolveOnce(allowEmpty ? null : undefined);
        return;
      }

      const parsed = safeParseJSON(input);
      cleanup();
      if (!parsed || (typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
        resolveOnce(allowEmpty ? null : undefined);
      } else {
        resolveOnce(sanitizeObject(parsed));
      }
    };

    const errorListener = () => {
      cleanup();
      resolveOnce(allowEmpty ? null : undefined);
    };

    // Cleanup function to remove listeners
    const cleanup = () => {
      process.stdin.removeListener('data', dataListener);
      process.stdin.removeListener('end', endListener);
      process.stdin.removeListener('error', errorListener);
    };

    // Attach listeners
    process.stdin.on('data', dataListener);
    process.stdin.on('end', endListener);
    process.stdin.on('error', errorListener);

    // Set a timeout in case stdin never ends
    setTimeout(() => {
      if (!hasData) {
        cleanup();
        resolveOnce(allowEmpty ? null : undefined);
      }
    }, timeout);

    // Resume stdin if it was paused
    process.stdin.resume();
  });
}

/**
 * Alias for backwards compatibility
 */
const parseHookInput = parseHookInputAsync;

/**
 * Validate and sanitize hook input from a JSON string
 * Filters top-level keys by ALLOWED_HOOK_INPUT_KEYS for SEC-007 compliance
 *
 * @param {string} jsonString - JSON string to validate
 * @returns {Object|null} Sanitized hook input or null if invalid
 */
function validateHookInput(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return null;
  }

  const trimmed = jsonString.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = safeParseJSON(trimmed);

  // Arrays are not valid hook input
  if (!parsed || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    return null;
  }

  // Filter by allowed keys at top level for security
  return sanitizeObject(parsed, true);
}

/**
 * Extract file path from tool input object
 *
 * @param {Object} toolInput - Tool input object
 * @returns {string|null} File path or null
 */
function extractFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }

  // Priority order: file_path > filePath > path > notebook_path
  return (
    toolInput.file_path || toolInput.filePath || toolInput.path || toolInput.notebook_path || null
  );
}

/**
 * Check if a hook is enabled based on environment variable
 *
 * @param {string} envVar - Environment variable name
 * @param {string} [defaultMode='block'] - Default mode if env var not set
 * @returns {boolean} True if enabled (not 'off')
 */
function isEnabled(envVar, defaultMode = 'block') {
  const mode = process.env[envVar] || defaultMode;
  return mode !== 'off';
}

/**
 * Get enforcement mode from environment variable
 *
 * Uses centralized defaults from enforcement-defaults.cjs.
 * Falls back to legacy defaultMode parameter for backwards compatibility.
 *
 * @param {string} envVar - Environment variable name
 * @param {string} [defaultMode] - Legacy parameter (ignored, kept for backwards compat)
 * @returns {string} Enforcement mode ('block', 'warn', or 'off')
 */
function getEnforcementMode(envVar, defaultMode) {
  // Try centralized defaults first
  try {
    const { getEnforcementMode: getCentralized } = require('./enforcement-defaults.cjs');
    return getCentralized(envVar);
  } catch {
    // Fallback to legacy behavior if centralized module not available
    const fallback = defaultMode || 'warn';
    const mode = process.env[envVar] || fallback;
    return VALID_ENFORCEMENT_MODES.includes(mode) ? mode : fallback;
  }
}

/**
 * Extract tool name from hook input (handles various input formats)
 *
 * @param {Object} input - Hook input object
 * @returns {string|null} Tool name or null
 */
function getToolName(input) {
  if (!input) return null;
  return input.tool_name || input.tool || input.toolUse?.tool || input.toolUse?.tool_name || null;
}

/**
 * Extract tool input/parameters from hook input
 *
 * @param {Object} input - Hook input object
 * @returns {Object} Tool input object (empty object if not found)
 */
function getToolInput(input) {
  if (!input) return {};
  return (
    input.tool_input ||
    input.input ||
    input.parameters ||
    input.toolUse?.input ||
    input.toolUse?.tool_input ||
    input.toolUse?.parameters ||
    {}
  );
}

/**
 * Extract tool output/result from PostToolUse hook input
 *
 * @param {Object} input - Hook input object
 * @returns {string|Object|null} Tool output or null
 */
function getToolOutput(input) {
  if (!input) return null;
  return (
    input.tool_output ||
    input.output ||
    input.result ||
    input.toolResult?.output ||
    input.toolResult?.result ||
    null
  );
}

/**
 * Format a JSON result for hook output.
 *
 * Runtime expects `permissionDecision` for PreToolUse deny/allow handling.
 * We also keep legacy `result/message` fields for backwards compatibility
 * with existing local scripts and diagnostics.
 *
 * @param {'allow'|'block'|'warn'|'deny'} result - Hook result
 * @param {string} [message] - Optional message
 * @returns {string} JSON string for output
 */
function formatResult(result, message = '') {
  // Backwards-compatibility path: some legacy hooks still pass an object
  // such as { allow: true, message: '' }.
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const allow = result.allow;
    const explicitDecision = result.permissionDecision;
    const inferredDecision =
      explicitDecision || (allow === false ? 'deny' : allow === true ? 'allow' : 'allow');
    const safeMessage =
      typeof result.message === 'string'
        ? result.message
        : typeof message === 'string'
          ? message
          : String(message || '');
    return JSON.stringify({
      ...result,
      permissionDecision: inferredDecision,
      permissionDecisionReason: safeMessage || result.permissionDecisionReason || '',
      message: safeMessage,
    });
  }

  const normalized = String(result || 'allow').toLowerCase();
  const permissionDecision = normalized === 'block' || normalized === 'deny' ? 'deny' : 'allow';
  const safeMessage = typeof message === 'string' ? message : String(message || '');

  const output = {
    permissionDecision,
    result: normalized,
    message: safeMessage,
  };

  if (safeMessage) {
    output.permissionDecisionReason = safeMessage;
  }

  return JSON.stringify(output);
}

/**
 * HOOK-007 FIX: Standardized audit log helper for all hooks
 * Use this for consistent JSON logging instead of console.error/console.log
 *
 * @param {string} hookName - Name of the hook (e.g., 'routing-guard')
 * @param {string} event - Event type (e.g., 'block', 'allow', 'error', 'warn')
 * @param {Object} [extra] - Additional fields to log
 * @example
 *   auditLog('routing-guard', 'block', { reason: 'Router using blacklisted tool', tool: 'Edit' });
 *   auditLog('bash-validator', 'allow', { command: 'git status' });
 *   auditLog('security-trigger', 'warn', { file: '/path/to/auth.ts', reasons: ['contains auth'] });
 */
function auditLog(hookName, event, extra = {}) {
  process.stderr.write(
    JSON.stringify({
      hook: hookName,
      event,
      timestamp: new Date().toISOString(),
      ...extra,
    }) + '\n'
  );
}

/**
 * HOOK-007/HOOK-010 FIX: Safe debug log helper that sanitizes error output
 * Only logs when DEBUG_HOOKS=true to prevent information disclosure in production
 *
 * @param {string} hookName - Name of the hook
 * @param {string} message - Log message (should not contain sensitive paths)
 * @param {Error} [err] - Error object (only message will be logged, not stack)
 * @example
 *   debugLog('routing-guard', 'Failed to parse input', err);
 */
function debugLog(hookName, message, err = null) {
  if (process.env.DEBUG_HOOKS !== 'true') {
    return;
  }

  const entry = {
    hook: hookName,
    event: 'debug',
    timestamp: new Date().toISOString(),
    message,
  };

  if (err) {
    // HOOK-010: Only include error message, not stack trace
    // Stack traces can reveal internal paths and structure
    entry.error = err.message || String(err);
  }

  process.stderr.write(JSON.stringify(entry) + '\n');
}

/**
 * SEC-AUDIT-016 FIX: Centralized audit log for security override usage
 * Provides consistent JSON logging to stderr when security env var overrides are used.
 *
 * This function MUST be used whenever a hook detects a security override env var
 * (e.g., *_ENFORCEMENT=off, *_GUARD=off, *_OVERRIDE=true) to ensure:
 * 1. Consistent JSON format across all hooks
 * 2. All overrides are audited (none are silent)
 * 3. Process ID included for correlation across hook calls
 *
 * @param {string} hookName - Name of the hook (e.g., 'routing-guard')
 * @param {string} envVar - Environment variable being overridden (e.g., 'ROUTER_BASH_GUARD')
 * @param {string} value - Override value (e.g., 'off', 'warn', 'true')
 * @param {string} impact - What the override allows (e.g., 'Router can use any Bash command')
 * @example
 *   auditSecurityOverride('routing-guard', 'ROUTER_BASH_GUARD', 'off', 'Router can use any Bash command');
 *   auditSecurityOverride('file-placement-guard', 'FILE_PLACEMENT_GUARD', 'off', 'File placement validation bypassed');
 *   auditSecurityOverride('loop-prevention', 'LOOP_PREVENTION_FAIL_OPEN', 'true', 'Hook fails open on errors');
 */
function auditSecurityOverride(hookName, envVar, value, impact) {
  process.stderr.write(
    JSON.stringify({
      type: 'SECURITY_OVERRIDE',
      hook: hookName,
      envVar,
      value,
      impact,
      timestamp: new Date().toISOString(),
      pid: process.pid,
    }) + '\n'
  );
}

/**
 * HOOK-009 FIX: Security audit log for security-critical hooks
 * Logs to both stderr (for debugging) and an audit file (for retention)
 *
 * @param {string} hookName - Name of the security hook
 * @param {string} action - Action taken (block, allow, warn, error)
 * @param {Object} details - Details of the action
 * @param {string} [details.tool] - Tool being validated
 * @param {string} [details.command] - Command being validated (if Bash)
 * @param {string} [details.reason] - Reason for action
 * @param {string} [details.file] - File being accessed (if relevant)
 */
function securityAuditLog(hookName, action, details = {}) {
  const entry = {
    hook: hookName,
    event: `security_${action}`,
    timestamp: new Date().toISOString(),
    ...details,
  };

  // Always log to stderr for immediate visibility
  process.stderr.write(JSON.stringify(entry) + '\n');

  // Optionally append to audit file if SECURITY_AUDIT_FILE is set
  const auditFile = process.env.SECURITY_AUDIT_FILE;
  if (auditFile) {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(auditFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(auditFile, JSON.stringify(entry) + '\n');
    } catch (_e) {
      // Best effort - don't fail the hook if audit logging fails
    }
  }
}

module.exports = {
  // Parsing functions
  parseHookInput,
  parseHookInputSync,
  parseHookInputAsync,
  validateHookInput,

  // Extraction functions
  extractFilePath,
  getToolName,
  getToolInput,
  getToolOutput,

  // Enforcement functions
  isEnabled,
  getEnforcementMode,

  // Output functions
  formatResult,
  auditLog,

  // HOOK-007/HOOK-009/HOOK-010: Standardized logging helpers
  debugLog,
  securityAuditLog,
  auditSecurityOverride,

  // Constants
  DEFAULT_TIMEOUT_MS,
  ALLOWED_HOOK_INPUT_KEYS,
  VALID_ENFORCEMENT_MODES,
};
