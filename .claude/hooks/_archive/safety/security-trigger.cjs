#!/usr/bin/env node
/**
 * Security Review Trigger Hook
 *
 * Event: PreToolUse (Edit|Write|NotebookEdit)
 *
 * Automatically detects security-sensitive file operations and marks them
 * for security review by updating router state.
 *
 * Security-sensitive patterns:
 * - Authentication/authorization code
 * - Cryptographic operations
 * - Secrets/credentials handling
 * - Input validation/sanitization
 * - Security hooks themselves
 *
 * This hook does NOT block operations - it flags them for review.
 * The actual blocking is handled by security-review-guard.cjs.
 *
 * Exit codes:
 * - 0: Always (this hook only flags, never blocks)
 */

'use strict';

const path = require('path');

// Import shared utilities
const {
  parseHookInputSync,
  extractFilePath,
  getToolName,
  getToolInput,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');

// =============================================================================
// Security-Sensitive File Patterns
// =============================================================================

/**
 * File name patterns that indicate security-sensitive code
 */
const SECURITY_FILE_PATTERNS = [
  // Authentication & Authorization
  /auth/i,
  /login/i,
  /logout/i,
  /session/i,
  /token/i,
  /jwt/i,
  /oauth/i,
  /sso/i,
  /saml/i,
  /permission/i,
  /role/i,
  /rbac/i,
  /acl/i,

  // Cryptography
  /crypt/i,
  /encrypt/i,
  /decrypt/i,
  /hash/i,
  /bcrypt/i,
  /argon/i,
  /scrypt/i,
  /hmac/i,
  /signature/i,
  /certificate/i,
  /ssl/i,
  /tls/i,

  // Secrets & Credentials
  /secret/i,
  /credential/i,
  /password/i,
  /apikey/i,
  /api[-_]?key/i,
  /private[-_]?key/i,

  // Input Validation & Sanitization
  /sanitiz/i,
  /validat/i,
  /escape/i,
  /xss/i,
  /csrf/i,
  /injection/i,
  /sql[-_]?inject/i,

  // Security Infrastructure
  /firewall/i,
  /guard/i,
  /security/i,
  /secure/i,
  /audit/i,
];

/**
 * File extensions that may contain secrets
 */
const SENSITIVE_EXTENSIONS = [
  '.env',
  '.pem',
  '.key',
  '.crt',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
  '.secrets',
  '.credentials',
];

/**
 * Directory patterns that indicate security-sensitive areas
 */
const SECURITY_DIRECTORIES = [
  /[\\/]auth[\\/]/i,
  /[\\/]security[\\/]/i,
  /[\\/]crypto[\\/]/i,
  /[\\/]middleware[\\/]auth/i,
  /[\\/]guards[\\/]/i,
  /[\\/]validators[\\/]/i,
  /[\\/]hooks[\\/]safety[\\/]/i,
  /[\\/]hooks[\\/]security[\\/]/i,
  /[\\/]\.claude[\\/]hooks[\\/]/i,
];

/**
 * Content patterns that indicate security operations
 * PROC-003: Now actively used in detectSecuritySensitivityWithContent
 */
const SECURITY_CONTENT_PATTERNS = [
  // Environment variables
  /process\.env\./,

  // Cryptography
  /crypto\./,
  /bcrypt\./,
  /createCipher/i,
  /createHash/i,
  /randomBytes/i,
  /pbkdf2/i,

  // JWT operations
  /jwt\.sign/,
  /jwt\.verify/,

  // AWS credentials
  /AWS_ACCESS_KEY/i,
  /AWS_SECRET/i,

  // Payment providers
  /STRIPE_SECRET/i,
  /STRIPE_KEY/i,

  // AI providers
  /OPENAI_API_KEY/i,
  /ANTHROPIC_API_KEY/i,

  // Webhook/callback endpoints (security-sensitive integration points)
  /\/webhook\//i,
  /\/callback\//i,
  /\/notify\//i,
];

// =============================================================================
// Detection Logic
// =============================================================================

/**
 * Check if a file path matches security-sensitive patterns
 * @param {string} filePath - File path to check
 * @returns {Object} Detection result with matched patterns
 */
function detectSecuritySensitivity(filePath) {
  if (!filePath) {
    return { isSensitive: false, reasons: [] };
  }

  const normalizedPath = path.normalize(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const reasons = [];

  // Check file name patterns
  for (const pattern of SECURITY_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      reasons.push(`File name matches security pattern: ${pattern}`);
    }
  }

  // Check sensitive extensions
  if (SENSITIVE_EXTENSIONS.includes(ext)) {
    reasons.push(`Sensitive file extension: ${ext}`);
  }

  // Check for .env files (with any suffix like .env.local)
  if (fileName.startsWith('.env')) {
    reasons.push('Environment file detected');
  }

  // Check directory patterns
  for (const pattern of SECURITY_DIRECTORIES) {
    if (pattern.test(normalizedPath)) {
      reasons.push(`Security-sensitive directory: ${pattern}`);
      break; // One directory match is enough
    }
  }

  return {
    isSensitive: reasons.length > 0,
    reasons,
  };
}

/**
 * Check if file path or content matches security-sensitive patterns
 * PROC-003: Enables content pattern detection
 *
 * @param {string} filePath - File path to check
 * @param {string} content - File content to check (optional)
 * @returns {Object} Detection result with matched patterns
 */
function detectSecuritySensitivityWithContent(filePath, content) {
  // First check file path patterns
  const result = detectSecuritySensitivity(filePath);

  // Then check content patterns if content is provided
  if (content && typeof content === 'string') {
    for (const pattern of SECURITY_CONTENT_PATTERNS) {
      if (pattern.test(content)) {
        result.reasons.push(`Security content pattern detected: ${pattern}`);
        result.isSensitive = true;
      }
    }
  }

  return result;
}

/**
 * Get or create router state for security tracking
 * This is a simplified version - actual implementation would use router-state.cjs
 */
function flagForSecurityReview(filePath, reasons) {
  // Audit log the detection
  auditLog('security-trigger', 'security_sensitive_detected', {
    filePath,
    reasons,
    requiresReview: true,
  });

  // Note: In a full implementation, this would update router-state.json
  // to set securityReviewRequired: true
  // For now, we just log the detection

  if (process.env.SECURITY_TRIGGER_DEBUG === 'true') {
    console.error(`[security-trigger] Flagged for review: ${filePath}`);
    console.error(`[security-trigger] Reasons: ${reasons.join(', ')}`);
  }
}

// =============================================================================
// Main Execution
// =============================================================================

/**
 * Main hook execution
 */
function main() {
  try {
    // Check if hook is disabled
    if (process.env.SECURITY_TRIGGER === 'off') {
      process.exit(0);
    }

    // Parse hook input
    const hookInput = parseHookInputSync();
    if (!hookInput) {
      process.exit(0);
    }

    // Get tool info
    const toolName = getToolName(hookInput);
    const toolInput = getToolInput(hookInput);

    // Only check write operations
    const writeTools = ['Edit', 'Write', 'NotebookEdit'];
    if (!writeTools.includes(toolName)) {
      process.exit(0);
    }

    // Get file path
    const filePath = extractFilePath(toolInput);
    if (!filePath) {
      process.exit(0);
    }

    // Get content for content pattern detection
    // PROC-003: Enable content pattern checking
    const content = toolInput.content || toolInput.new_string || null;

    // Detect security sensitivity (file path + content patterns)
    const detection = detectSecuritySensitivityWithContent(filePath, content);

    if (detection.isSensitive) {
      // Flag for security review
      flagForSecurityReview(filePath, detection.reasons);

      // Log to stderr for visibility (not blocking)
      console.error(
        JSON.stringify({
          hook: 'security-trigger',
          event: 'security_review_required',
          tool: toolName,
          file: filePath,
          reasons: detection.reasons,
          timestamp: new Date().toISOString(),
        })
      );
    }

    // Always exit 0 - this hook flags but never blocks
    process.exit(0);
  } catch (err) {
    // Log error but don't block
    auditLog('security-trigger', 'error', {
      error: err.message,
      stack: process.env.DEBUG_HOOKS ? err.stack : undefined,
    });

    // Exit 0 even on error - this hook should not block operations
    process.exit(0);
  }
}

// Run main
main();

// Export for testing
module.exports = {
  detectSecuritySensitivity,
  detectSecuritySensitivityWithContent,
  SECURITY_FILE_PATTERNS,
  SENSITIVE_EXTENSIONS,
  SECURITY_DIRECTORIES,
  SECURITY_CONTENT_PATTERNS,
};
