#!/usr/bin/env node
/**
 * Sensitive Data Scrubber
 * ========================
 *
 * Scrubs sensitive data patterns from text content before archival.
 * Prevents credentials, tokens, emails, and PII from persisting in cold storage.
 *
 * Security Mitigation: MF-003 (Sensitive Data Scrubbing Before Cold Archival)
 *
 * Usage:
 *   const { scrubSensitiveContent } = require('./sensitive-scrubber.cjs');
 *   const result = scrubSensitiveContent(text);
 *   console.log(result.scrubbed, result.redactionCount);
 */

'use strict';

// Redaction placeholder strings (constants for consistency)
const REDACTION_PLACEHOLDER = '[REDACTED]';
const JWT_REDACTION_PLACEHOLDER = '[JWT-REDACTED]';
const EMAIL_REDACTION_PLACEHOLDER = '[EMAIL-REDACTED]';

// Minimum token length to redact (shorter strings are likely not sensitive)
const MIN_TOKEN_LENGTH = 8;

// Sensitive data patterns to detect and redact
// Order matters: more specific patterns first (JWT before generic token)
const PATTERNS = [
  // JWT tokens (three base64 segments separated by dots) - MUST be first
  {
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: JWT_REDACTION_PLACEHOLDER,
  },
  // Email addresses
  {
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: EMAIL_REDACTION_PLACEHOLDER,
  },
  // API keys and tokens (sk-, api_key=, token=, secret=, password=, credential=)
  // Match only when followed by = or : and at least MIN_TOKEN_LENGTH chars
  // Must not match code patterns like "const password =" (no value after =)
  // Must not match already-redacted patterns like "[JWT-REDACTED]" (negative lookahead for [)
  {
    regex: new RegExp(
      `(sk-|api[_-]?key|token|secret|password|credential)(=|:\\s*)(?!\\[)(\\S{${MIN_TOKEN_LENGTH},})`,
      'gi'
    ),
    replacement: `$1$2${REDACTION_PLACEHOLDER}`,
  },
];

/**
 * Scrub sensitive data patterns from text content.
 * Used before cold storage archival to prevent credential persistence.
 *
 * @param {string} text - Content to scrub
 * @returns {{ scrubbed: string, redactionCount: number }}
 */
function scrubSensitiveContent(text) {
  if (typeof text !== 'string') {
    return { scrubbed: '', redactionCount: 0 };
  }

  let scrubbed = text;
  let redactionCount = 0;

  for (const pattern of PATTERNS) {
    // Count matches BEFORE replacing to get accurate count
    const beforeMatches = scrubbed.match(pattern.regex);
    if (beforeMatches) {
      scrubbed = scrubbed.replace(pattern.regex, pattern.replacement);

      // Count the actual redactions that happened (not already-redacted strings)
      const afterMatches = scrubbed.match(pattern.regex);
      const actualRedactions = beforeMatches.length - (afterMatches ? afterMatches.length : 0);
      redactionCount += actualRedactions;
    }
  }

  return { scrubbed, redactionCount };
}

module.exports = { scrubSensitiveContent };
