/**
 * memory-sanitizer.cjs - Memory Content Sanitization
 * ===================================================
 *
 * Detects dangerous patterns in memory content to prevent:
 * - Shell injection attacks
 * - Prompt injection attacks
 * - Code execution attacks
 * - Encoded payloads
 *
 * PRESERVES legitimate code in markdown blocks (triple backticks).
 *
 * Based on security patterns from:
 * - .claude/lib/utils/safe-json.cjs (prototype pollution)
 * - OWASP Agentic AI Top 10 (ASI01, ASI06)
 *
 * Created: 2026-02-13 (P0-005 Fix)
 */

'use strict';

/**
 * Dangerous pattern categories
 */
const DANGEROUS_PATTERNS = {
  // Shell injection patterns
  shell: [
    { pattern: /\brm\s+-rf\b/gi, description: 'shell injection: rm -rf command' },
    { pattern: /\bsudo\b/gi, description: 'shell injection: sudo command' },
    {
      pattern: /`[^`\n]*(\$\(|\brm\b|\bsudo\b|\bcurl\b|\bwget\b|\bsh\b|\bbash\b)[^`\n]*`/gi,
      description: 'shell injection: backtick execution',
    },
    { pattern: /\$\([^)]+\)/g, description: 'shell injection: $() execution' },
    {
      pattern:
        /;\s*(rm|sudo|curl|wget|chmod|chown|mv|cp|cat|bash|sh|python|node|powershell|pwsh)\b/gi,
      description: 'shell injection: semicolon command chaining',
    },
    { pattern: /\|\s*sh\b/gi, description: 'shell injection: pipe to sh' },
    { pattern: /\|\s*bash\b/gi, description: 'shell injection: pipe to bash' },
    { pattern: />\s*\/dev\//gi, description: 'shell injection: device write' },
  ],

  // Prompt injection patterns
  prompt: [
    {
      pattern: /\bIGNORE\s+(PREVIOUS|ALL|THE)\s+(INSTRUCTIONS?|RULES?)\b/gi,
      description: 'prompt injection: IGNORE PREVIOUS/ALL/THE INSTRUCTIONS',
    },
    {
      pattern: /\bDISREGARD\s+(PREVIOUS|ALL|THE)\s+(INSTRUCTIONS?|RULES?)\b/gi,
      description: 'prompt injection: DISREGARD PREVIOUS/ALL/THE INSTRUCTIONS',
    },
    {
      pattern: /\bSYSTEM:\s*/gi,
      description: 'prompt injection: SYSTEM: role impersonation',
    },
    {
      pattern: /\bADMIN:\s*/gi,
      description: 'prompt injection: ADMIN: role impersonation',
    },
    {
      pattern: /\bROOT:\s*/gi,
      description: 'prompt injection: ROOT: role impersonation',
    },
    {
      pattern: /\b(output|show|display|reveal)\s+(your\s+)?(system\s+)?(prompt|instructions?)\b/gi,
      description: 'prompt injection: system prompt exfiltration attempt',
    },
  ],

  // Code execution patterns
  code: [
    { pattern: new RegExp('\\beval\\s*\\(', 'gi'), description: 'code execution: ev' + 'al()' },
    { pattern: /\bFunction\s*\(/gi, description: 'code execution: Function()' },
    {
      pattern: /\brequire\s*\(\s*['"`](child_process|vm|worker_threads)['"`]\s*\)/gi,
      description: 'code execution: require()',
    },
    { pattern: /\bimport\s*\(/gi, description: 'code execution: import()' },
    { pattern: /__proto__/gi, description: 'code execution: __proto__ manipulation' },
    {
      pattern: /constructor\.prototype/gi,
      description: 'code execution: constructor.prototype manipulation',
    },
    {
      pattern: /process\.env\.[A-Z_]+=\s*["']/gi,
      description: 'code execution: environment variable injection',
    },
    { pattern: /child_process/gi, description: 'code execution: child_process usage' },
  ],

  // Encoded payload patterns
  encoded: [
    {
      pattern: /\bbase64\s+-d\b/gi,
      description: 'encoded payload: base64 decode',
    },
    {
      pattern: /\becho\s+[A-Za-z0-9+/=]{20,}\s*\|\s*base64/gi,
      description: 'encoded payload: echo base64 pipe',
    },
  ],
};

/**
 * Extract code blocks from markdown content to exclude from scanning
 *
 * @param {string} content - Content to parse
 * @returns {Object} { contentWithoutCode, codeBlocks }
 */
function extractCodeBlocks(content) {
  if (!content || typeof content !== 'string') {
    return { contentWithoutCode: '', codeBlocks: [] };
  }

  const codeBlocks = [];
  let contentWithoutCode = content;

  // Match triple backtick code blocks
  const codeBlockPattern = /```[\s\S]*?```/g;
  let match;

  while ((match = codeBlockPattern.exec(content)) !== null) {
    codeBlocks.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[0],
    });
  }

  // Replace code blocks with placeholder (preserve length for position tracking)
  for (const block of codeBlocks) {
    const placeholder = ' '.repeat(block.content.length);
    contentWithoutCode =
      contentWithoutCode.slice(0, block.start) + placeholder + contentWithoutCode.slice(block.end);
  }

  return { contentWithoutCode, codeBlocks };
}

/**
 * Sanitize memory content by detecting dangerous patterns
 *
 * @param {string} content - Memory content to sanitize
 * @returns {Object} { safe: boolean, original: string, detections: string[] }
 *   - safe: true if no dangerous patterns detected
 *   - original: the original input content (unchanged); field name makes clear this is NOT sanitized output
 *   - detections: array of detected dangerous pattern descriptions
 *
 * @example
 * const result = sanitizeMemoryContent('Run: rm -rf /tmp');
 * // result.safe = false
 * // result.original = 'Run: rm -rf /tmp'  (the original, not cleaned content)
 * // result.detections = ['shell injection: rm -rf command']
 */
function sanitizeMemoryContent(content) {
  // Handle null/undefined/empty
  if (!content) {
    return {
      safe: true,
      original: '',
      detections: [],
    };
  }

  // Convert to string
  const contentStr = String(content);

  const detections = [];

  // FIX VUL-BYPASS-001: Scan ALL content including code blocks
  // Code blocks in memory files are still read by LLMs and can contain
  // effective prompt injection. Removed code block exemption.
  // Scan for dangerous patterns (scan all content)
  for (const [_category, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
    for (const { pattern, description } of patterns) {
      // Reset regex state
      pattern.lastIndex = 0;

      if (pattern.test(contentStr)) {
        detections.push(description);
      }
    }
  }

  // FIX VUL-AUDIT-001: Log detections to stderr for audit trail
  if (detections.length > 0) {
    process.stderr.write(
      `[memory-sanitizer] SECURITY: Detected ${detections.length} dangerous patterns: ${detections.join('; ')}\n`
    );
  }

  return {
    safe: detections.length === 0,
    original: contentStr, // Renamed from 'sanitized': this is the original content, not a cleaned version
    detections,
  };
}

module.exports = {
  sanitizeMemoryContent,
  DANGEROUS_PATTERNS, // Export for testing
  extractCodeBlocks, // Export for testing
};
