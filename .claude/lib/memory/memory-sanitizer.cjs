'use strict';

/**
 * Memory Content Sanitizer
 *
 * Prevents memory poisoning attacks by sanitizing content before writing to
 * memory files (learnings.md, decisions.md, issues.md). Blocks prompt injection
 * patterns that could hijack future agent behavior.
 *
 * FIX HIGH-002: Memory Poisoning via Unsanitized File Writes
 * Security Control: SEC-006 (memory poisoning prevention)
 *
 * Related: OWASP Agentic AI Top 10 - ASI06 (Memory & Context Poisoning)
 */

/**
 * Prompt injection patterns that indicate goal hijacking attempts.
 * These patterns are commonly used to override agent instructions.
 *
 * @type {Array<RegExp>}
 */
const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /ignore\s+all\s+prior\s+instructions/i,
  /system\s+prompt\s+override/i,
  /you\s+are\s+now\s+a/i,
  /disregard\s+all\s+prior/i,
  /disregard\s+everything/i,
  /forget\s+everything/i,
  /forget\s+all\s+previous/i,
];

/**
 * Sanitize memory content before writing to memory files.
 *
 * Blocks obvious injection attempts and escapes markdown that looks like
 * system instructions.
 *
 * @param {string} content - The content to sanitize
 * @returns {string} Sanitized content safe for memory files
 * @throws {Error} If content contains obvious injection patterns
 */
function sanitizeMemoryContent(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // Block obvious injection attempts
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(
        `Memory injection attempt blocked: Pattern "${pattern}" detected. ` +
          `This content appears to contain instructions designed to modify agent behavior. ` +
          `Security Control: SEC-006 (memory poisoning prevention)`
      );
    }
  }

  // Escape markdown headings that look like system instructions
  // Pattern: # System: or ## Instruction: or ### Override:
  const sanitized = content.replace(
    /^(#{1,3}\s+)?(System|Instruction|Override|IMPORTANT|CRITICAL|MANDATORY):/gim,
    '\\$&' // Escape with backslash
  );

  return sanitized;
}

/**
 * Check if content is safe without throwing (for validation).
 *
 * @param {string} content - The content to check
 * @returns {{safe: boolean, reason: string}} Validation result
 */
function isContentSafe(content) {
  if (!content || typeof content !== 'string') {
    return { safe: true, reason: '' };
  }

  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        safe: false,
        reason: `Content contains potential injection pattern: ${pattern}`,
      };
    }
  }

  return { safe: true, reason: '' };
}

module.exports = {
  sanitizeMemoryContent,
  isContentSafe,
  INJECTION_PATTERNS,
};
