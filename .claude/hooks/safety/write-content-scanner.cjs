#!/usr/bin/env node
/**
 * write-content-scanner.cjs
 *
 * PreToolUse hook that scans file content for secrets and dangerous patterns.
 * Blocks writes containing API keys, credentials, private keys, etc.
 *
 * Triggers: PreToolUse on Write, Edit
 * Environment: WRITE_CONTENT_SCANNER=block|warn|off (default: block)
 *
 * CRITICAL GAP ADDRESSED: file-placement-guard only checks paths, not content.
 * This hook prevents agents from writing .env files or hardcoded secrets.
 */

'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  getEnforcementMode,
  formatResult,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');

// Dangerous patterns to detect
const DANGEROUS_PATTERNS = [
  // API Keys
  {
    name: 'OpenAI API Key',
    pattern: /sk-[A-Za-z0-9]{20,}/,
    severity: 'critical',
  },
  {
    name: 'GitHub Token',
    pattern: /ghp_[A-Za-z0-9]{36,}/,
    severity: 'critical',
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: 'critical',
  },

  // Private Keys
  {
    name: 'Private Key (RSA)',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/,
    severity: 'critical',
  },
  {
    name: 'Private Key (EC)',
    pattern: /-----BEGIN EC PRIVATE KEY-----/,
    severity: 'critical',
  },

  // Credentials (.env style, AWS, database passwords)
  {
    name: '.env or credentials',
    pattern: /(API_KEY|SECRET|PASSWORD|aws_secret[a-z_]*|database[a-z_]*password)\s*=/i,
    severity: 'critical',
  },

  // Bearer tokens
  {
    name: 'Bearer Token',
    pattern: /bearer\s+[A-Za-z0-9\-._~+/]+=*/i,
    severity: 'high',
  },
];

// Safe directory patterns (allow these even if they contain secrets in documentation/examples)
const SAFE_PATTERNS = [
  '.claude/context/memory/', // Memory files (learnings, issues, decisions)
  '.claude/audit/', // Audit reports
  '.claude/context/artifacts/', // Artifacts (plans, reports, research)
  'tests/', // Test fixtures
  'docs/', // Documentation
  '.claude/skills/', // Skill documentation
  '.claude/workflows/', // Workflow documentation
];

/**
 * Check if file path is in a safe directory
 * @param {string} filePath - File path to check
 * @returns {boolean}
 */
function isSafeDir(filePath) {
  return SAFE_PATTERNS.some(pattern => filePath.includes(pattern));
}

/**
 * Scan content for dangerous patterns
 * @param {string} content - Content to scan
 * @returns {Array} Matched patterns
 */
function scanContent(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const matches = [];
  for (const rule of DANGEROUS_PATTERNS) {
    if (rule.pattern.test(content)) {
      matches.push(rule);
    }
  }

  return matches;
}

async function main() {
  const mode = getEnforcementMode('WRITE_CONTENT_SCANNER', 'block');
  if (mode === 'off') {
    process.exit(0);
  }

  try {
    const hookInput = await parseHookInputAsync();
    const toolName = getToolName(hookInput);

    // Only check Write and Edit tools
    if (!['Write', 'Edit'].includes(toolName)) {
      process.exit(0);
    }

    const toolInput = getToolInput(hookInput);
    if (!toolInput) {
      process.exit(0);
    }

    // Extract content (Write uses 'content', Edit uses 'new_string')
    const content = toolInput.content || toolInput.new_string || '';
    const filePath = toolInput.file_path || '';

    if (!content || typeof content !== 'string') {
      process.exit(0);
    }

    // Skip safe directories
    if (isSafeDir(filePath)) {
      process.exit(0);
    }

    // Scan for dangerous patterns
    const matches = scanContent(content);

    if (matches.length > 0) {
      auditLog('write-content-scanner', 'secrets-detected', {
        file: filePath,
        patterns: matches.map(m => m.name),
        severity: matches[0].severity,
      });

      const message = [
        `[SECURITY] Dangerous content detected in write to ${filePath}`,
        'Patterns detected:',
        ...matches.map(m => `  - ${m.name}`),
        '',
        'This may be a security risk. Check content before committing.',
      ].join('\n');

      if (mode === 'block') {
        console.log(formatResult('block', message));
        process.exit(2);
      } else {
        console.warn(message);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Write content scanner error:', err.message);
    process.exit(0); // Fail open on errors
  }
}

main();
