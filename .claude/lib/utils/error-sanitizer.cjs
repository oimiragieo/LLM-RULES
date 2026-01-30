#!/usr/bin/env node
// @ts-check
/**
 * Error Sanitizer Library
 *
 * Implements 9 masking patterns per SEC-LOG guidelines to prevent
 * sensitive data leakage in error logs.
 *
 * Patterns:
 * 1. API keys: sk-.*, AKIA.* -> [REDACTED_API_KEY]
 * 2. JWT tokens: eyJ.* -> [REDACTED_JWT_TOKEN]
 * 3. Bearer tokens: Bearer .* -> [REDACTED_BEARER_TOKEN]
 * 4. GitHub tokens: ghp_.* -> [REDACTED_GITHUB_TOKEN]
 * 5. Passwords: password.*:.* -> [REDACTED_PASSWORD]
 * 6. SSH keys: PRIVATE KEY.* -> [REDACTED_SSH_KEY]
 * 7. Connection strings: mongodb://.* -> [REDACTED_CONNECTION_STRING]
 * 8. AWS credentials: Account IDs, ARNs -> [REDACTED_AWS_ARN]
 * 9. Emails: user@domain -> u***@d***.com
 *
 * @module lib/utils/error-sanitizer
 */

'use strict';

const path = require('path');

// =============================================================================
// Constants
// =============================================================================

/**
 * Masking patterns for sensitive data detection
 * Each pattern includes a regex and replacement text
 */
const MASKING_PATTERNS = [
  // Pattern 1: API keys (OpenAI sk-*, AWS AKIA*)
  {
    name: 'api_key',
    pattern: /\b(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g,
    replacement: '[REDACTED_API_KEY]',
  },
  // Pattern 2: JWT tokens
  {
    name: 'jwt_token',
    pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]*/g,
    replacement: '[REDACTED_JWT_TOKEN]',
  },
  // Pattern 3: Bearer tokens
  {
    name: 'bearer_token',
    pattern: /\bBearer\s+[a-zA-Z0-9._-]+/gi,
    replacement: '[REDACTED_BEARER_TOKEN]',
  },
  // Pattern 4: GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_ prefixes)
  {
    name: 'github_token',
    pattern: /\bgh[pours]_[a-zA-Z0-9]{4,}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  // Pattern 5: Passwords (various formats)
  {
    name: 'password',
    pattern: /\b(password|passwd|pwd)\s*[:=]\s*['"]?[^'"\s\n,;]+['"]?/gi,
    replacement: '[REDACTED_PASSWORD]',
  },
  // Pattern 6: SSH private keys
  {
    name: 'ssh_key',
    pattern: /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
    replacement: '[REDACTED_SSH_KEY]',
  },
  // Pattern 7: Connection strings (MongoDB, PostgreSQL, MySQL, etc.)
  {
    name: 'connection_string',
    pattern: /(mongodb(\+srv)?|postgres(ql)?|mysql|redis):\/\/[^:]+:[^@]+@[^\s]+/gi,
    replacement: '[REDACTED_CONNECTION_STRING]',
  },
  // Pattern 8: AWS ARNs and account IDs
  {
    name: 'aws_arn',
    pattern: /\barn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:[^\s]+/gi,
    replacement: '[REDACTED_AWS_ARN]',
  },
  // Generic secret patterns in environment variable format
  {
    name: 'env_secret',
    pattern: /\b(API_KEY|SECRET|TOKEN|AUTH|CREDENTIAL)[A-Z_]*\s*=\s*[^\s\n]+/gi,
    replacement: '$1=[REDACTED]',
  },
];

/**
 * Fields that should NEVER be logged (forbidden)
 */
const FORBIDDEN_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /credential/i,
  /apikey/i,
  /api_key/i,
  /privatekey/i,
  /private_key/i,
  /^token$/i,
  /authtoken/i,
  /auth_token/i,
  /accesstoken/i,
  /access_token/i,
  /refreshtoken/i,
  /refresh_token/i,
  /ssh.*key/i,
];

/**
 * Fields that are sensitive (need masking)
 */
const SENSITIVE_FIELD_PATTERNS = [
  /email/i,
  /phone/i,
  /address/i,
  /ssn/i,
  /social/i,
  /credit/i,
  /card/i,
  /account/i,
  /routing/i,
];

/**
 * Fields that are internal (should be limited in exposure)
 */
const INTERNAL_FIELD_PATTERNS = [/stack/i, /trace/i, /internal/i, /private/i, /debug/i];

// =============================================================================
// Masking Functions
// =============================================================================

/**
 * Mask sensitive data in a string
 *
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function maskString(text) {
  if (typeof text !== 'string') {
    return text;
  }

  let masked = text;

  for (const { pattern, replacement } of MASKING_PATTERNS) {
    masked = masked.replace(pattern, replacement);
  }

  return masked;
}

/**
 * Deep sanitize an object for logging
 *
 * Recursively traverses object and masks sensitive values.
 * Handles nested objects, arrays, and primitives.
 *
 * @param {*} obj - Object to sanitize
 * @param {number} [depth=0] - Current recursion depth
 * @returns {*} Sanitized object
 */
function sanitizeForLogging(obj, depth = 0) {
  // Prevent infinite recursion
  if (depth > 10) {
    return '[NESTED_OBJECT_TRUNCATED]';
  }

  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives
  if (typeof obj === 'string') {
    return maskString(obj);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item, depth + 1));
  }

  // Handle objects
  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if field is forbidden
    if (isForbidden(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Recursively sanitize values
    if (typeof value === 'string') {
      sanitized[key] = maskString(value);
    } else if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => sanitizeForLogging(item, depth + 1));
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeForLogging(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Mask email address
 *
 * Masks the local part and domain while keeping structure visible.
 * Example: john.doe@example.com -> j***@e***.com
 *
 * @param {string} email - Email address to mask
 * @returns {string} Masked email
 */
function maskEmail(email) {
  if (typeof email !== 'string') {
    return email;
  }

  const emailRegex = /^([^@]+)@([^.]+)\.(.+)$/;
  const match = email.match(emailRegex);

  if (!match) {
    return email;
  }

  const [, local, domain, tld] = match;

  // Mask local part (keep first char)
  const maskedLocal = local.length > 1 ? local[0] + '***' : local + '***';

  // Mask domain (keep first char)
  const maskedDomain = domain.length > 1 ? domain[0] + '***' : domain + '***';

  return `${maskedLocal}@${maskedDomain}.${tld}`;
}

/**
 * Normalize file paths by removing sensitive components
 *
 * Removes:
 * - PROJECT_ROOT (replaces with relative path)
 * - Home directory paths (replaces with [HOME])
 * - Username paths (replaces with [USER])
 *
 * @param {string} filePath - Path to normalize
 * @returns {string} Normalized path
 */
function maskPath(filePath) {
  if (typeof filePath !== 'string') {
    return filePath;
  }

  let masked = filePath;

  // Get PROJECT_ROOT
  const projectRoot = process.cwd();

  // Replace PROJECT_ROOT with relative path
  if (masked.startsWith(projectRoot)) {
    masked = masked.slice(projectRoot.length);
    if (masked.startsWith(path.sep)) {
      masked = masked.slice(1);
    }
    if (!masked.startsWith('.')) {
      masked = './' + masked.replace(/\\/g, '/');
    }
  }

  // Mask home directory (Unix)
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir && masked.includes(homeDir)) {
    masked = masked.replace(homeDir, '[HOME]');
  }

  // Mask username in paths (Unix: /home/username, /Users/username)
  const unixUserMatch = masked.match(/\/(home|Users)\/([^/]+)/);
  if (unixUserMatch) {
    masked = masked.replace(
      `/${unixUserMatch[1]}/${unixUserMatch[2]}`,
      `/${unixUserMatch[1]}/[USER]`
    );
  }

  // Mask username in paths (Windows: C:\Users\username)
  const windowsUserMatch = masked.match(/[A-Z]:\\Users\\([^\\]+)/i);
  if (windowsUserMatch) {
    masked = masked.replace(/([A-Z]:\\Users\\)[^\\]+/i, '$1[USER]');
  }

  return masked;
}

/**
 * Mask and limit stack trace
 *
 * - Limits to 3 frames
 * - Removes function arguments
 * - Masks file paths
 *
 * @param {string} stack - Stack trace to mask
 * @returns {string[]} Array of masked stack frames (max 3)
 */
function maskStackTrace(stack) {
  if (typeof stack !== 'string') {
    return [];
  }

  const lines = stack.split('\n');
  const frames = [];

  for (const line of lines) {
    // Skip the error message line (first line usually)
    if (!line.trim().startsWith('at ')) {
      continue;
    }

    // Extract and clean frame
    let frame = line.trim();

    // Remove function arguments (content in parentheses before file path)
    // Pattern: "at functionName(arg1, arg2) (/path/file.js:10:5)"
    // Should become: "at functionName (/path/file.js:10:5)"
    frame = frame.replace(/\([^)]*\)\s*\(/, ' (');

    // Mask file paths in the frame
    frame = maskPath(frame);

    // Mask any sensitive data that might be in the frame
    frame = maskString(frame);

    frames.push(frame);

    // Limit to 3 frames
    if (frames.length >= 3) {
      break;
    }
  }

  return frames;
}

/**
 * Check if a field name is forbidden (should never be logged)
 *
 * @param {string} fieldName - Field name to check
 * @returns {boolean} True if field is forbidden
 */
function isForbidden(fieldName) {
  if (typeof fieldName !== 'string') {
    return false;
  }

  return FORBIDDEN_FIELD_PATTERNS.some(pattern => pattern.test(fieldName));
}

/**
 * Get sensitivity level of a field
 *
 * @param {string} fieldName - Field name to check
 * @returns {'forbidden'|'sensitive'|'internal'|'public'} Sensitivity level
 */
function getSensitivity(fieldName) {
  if (typeof fieldName !== 'string') {
    return 'public';
  }

  if (FORBIDDEN_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))) {
    return 'forbidden';
  }

  if (SENSITIVE_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))) {
    return 'sensitive';
  }

  if (INTERNAL_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))) {
    return 'internal';
  }

  return 'public';
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  sanitizeForLogging,
  maskEmail,
  maskPath,
  maskStackTrace,
  isForbidden,
  getSensitivity,
  // Export patterns for testing and extension
  MASKING_PATTERNS,
  FORBIDDEN_FIELD_PATTERNS,
  SENSITIVE_FIELD_PATTERNS,
  INTERNAL_FIELD_PATTERNS,
};
