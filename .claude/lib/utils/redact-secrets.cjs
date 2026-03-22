#!/usr/bin/env node
/**
 * Secret Redaction Utility (SEC-DLP-001)
 * =======================================
 *
 * Redacts secrets/credentials from text and objects before logging.
 * Inspired by node9-proxy DLP scanner patterns.
 *
 * Extends sensitive-scrubber.cjs (archive-focused) with:
 * - Deeper pattern coverage (AWS, GitHub, Stripe, connection strings, private keys)
 * - Recursive object redaction with depth limits
 * - Pre-logging use case (not just archival)
 *
 * Usage:
 *   const { redactSecrets, redactObject } = require('./redact-secrets.cjs');
 *   const safeText = redactSecrets(jsonString);
 *   const safeObj = redactObject(toolArgs);
 */

'use strict';

const REDACTED = '********';
const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 100 * 1024; // 100KB

/**
 * Secret detection patterns ordered by specificity (most specific first).
 * Each pattern replaces the matched secret portion with REDACTED.
 */
const PATTERNS = [
  // AWS Access Key IDs
  { regex: /\bAKIA[0-9A-Z]{16}\b/g, name: 'aws-access-key' },
  // AWS Secret Access Keys (40 chars after common prefixes)
  {
    regex: /(aws_secret_access_key|AWS_SECRET_ACCESS_KEY)([=:]\s*['"]?)[A-Za-z0-9/+=]{40}/g,
    replacement: `$1$2${REDACTED}`,
    name: 'aws-secret-key',
  },
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  { regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g, name: 'github-token' },
  // OpenAI API keys
  { regex: /\bsk-[a-zA-Z0-9_-]{20,}\b/g, name: 'openai-key' },
  // Stripe secret keys
  { regex: /\bsk_(?:live|test)_[0-9a-zA-Z]{24,}\b/g, name: 'stripe-key' },
  // Anthropic API keys
  { regex: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/g, name: 'anthropic-key' },
  // JWT tokens (three base64url segments)
  { regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, name: 'jwt' },
  // Private keys
  {
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    name: 'private-key',
  },
  // Connection strings with embedded passwords (e.g. postgres://user:pass@host)
  {
    regex: /:\/\/([^:]+):([^@]{3,})@/g,
    replacement: `://$1:${REDACTED}@`,
    name: 'connection-string',
  },
  // Bearer tokens in Authorization headers
  {
    regex:
      /((?:authorization|Authorization):\s*(?:Bearer|Basic|Digest)\s+)[a-zA-Z0-9._\-/\\=+]{8,}/gi,
    replacement: `$1${REDACTED}`,
    name: 'bearer-token',
  },
  // Generic key=value patterns (api_key, secret, password, token, credential, auth)
  {
    regex:
      /((?:api[_-]?key|secret|password|passwd|token|credential|auth[_-]?token)(?:\s*[=:]\s*['"]?))([a-zA-Z0-9._\-/+=]{8,})/gi,
    replacement: `$1${REDACTED}`,
    name: 'generic-secret',
  },
];

/**
 * Redact secrets from a text string.
 *
 * @param {string} text - Text to redact
 * @returns {string} Text with secrets replaced by ********
 */
function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  if (text.length === 0) return text;
  if (text.length > MAX_STRING_LENGTH) return text; // Skip oversized strings

  let result = text;
  for (const pattern of PATTERNS) {
    if (pattern.replacement) {
      result = result.replace(pattern.regex, pattern.replacement);
    } else {
      result = result.replace(pattern.regex, REDACTED);
    }
    // Reset lastIndex for stateful regex (global flag)
    pattern.regex.lastIndex = 0;
  }
  return result;
}

/**
 * Deep-clone an object and redact all string values containing secrets.
 *
 * @param {*} obj - Value to redact (any type)
 * @param {number} [depth=0] - Current recursion depth
 * @returns {*} Deep-cloned value with secrets redacted
 */
function redactObject(obj, depth) {
  if (depth === undefined) depth = 0;
  if (depth >= MAX_DEPTH) return obj;
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return redactSecrets(obj);
  }

  if (Array.isArray(obj)) {
    const result = [];
    for (let i = 0; i < obj.length; i++) {
      result[i] = redactObject(obj[i], depth + 1);
    }
    return result;
  }

  if (typeof obj === 'object') {
    const result = Object.create(null);
    for (const key of Object.keys(obj)) {
      // Strip prototype pollution keys
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      result[key] = redactObject(obj[key], depth + 1);
    }
    return result;
  }

  // Primitives (number, boolean, etc.) pass through
  return obj;
}

module.exports = {
  redactSecrets,
  redactObject,
  REDACTED,
  MAX_DEPTH,
  MAX_STRING_LENGTH,
  PATTERNS,
};
