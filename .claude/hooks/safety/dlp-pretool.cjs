#!/usr/bin/env node
/**
 * DLP (Data Loss Prevention) PreToolUse Hook (SEC-DLP-002)
 * =========================================================
 *
 * Scans tool arguments recursively for secrets/credentials before execution.
 * Blocks tool calls that would exfiltrate sensitive data.
 *
 * Inspired by node9-proxy src/dlp.ts recursive scanner.
 *
 * Matcher: PreToolUse Bash|Write|Edit|WebFetch|WebSearch
 * Policy: Fail-closed (security hook — exit 2 on detection)
 *
 * Environment:
 *   DLP_PRETOOL_ENFORCEMENT=block|warn|off (default: warn)
 */

'use strict';

const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  formatResult,
  getEnforcementMode,
} = require('../../lib/utils/hook-input.cjs');
const { createHookTracer } = require('../../lib/utils/hook-trace.cjs');

const HOOK_NAME = 'dlp-pretool';
const trace = createHookTracer(HOOK_NAME);

// DLP patterns with severity levels
const DLP_PATTERNS = [
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/, severity: 'block' },
  { name: 'GitHub Token', regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/, severity: 'block' },
  { name: 'OpenAI API Key', regex: /\bsk-[a-zA-Z0-9_-]{20,}\b/, severity: 'block' },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/, severity: 'block' },
  { name: 'Stripe Secret Key', regex: /\bsk_(?:live|test)_[0-9a-zA-Z]{24,}\b/, severity: 'block' },
  {
    name: 'Private Key Block',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    severity: 'block',
  },
  { name: 'Connection String Password', regex: /:\/\/[^:]+:[^@]{3,}@/, severity: 'warn' },
  {
    name: 'JWT Token',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    severity: 'warn',
  },
  {
    name: 'Bearer Token',
    regex: /(?:authorization|bearer)\s*[:=]\s*[a-zA-Z0-9._\-/\\=+]{20,}/i,
    severity: 'warn',
  },
  {
    name: 'Generic Secret Value',
    regex:
      /(?:api[_-]?key|secret_?key|password|passwd|credential)\s*[=:]\s*['"]?[a-zA-Z0-9._\-/+=]{12,}/i,
    severity: 'warn',
  },
];

const MAX_DEPTH = 5;
const MAX_STRING_LEN = 100 * 1024; // 100KB

/**
 * Recursively scan an object for DLP pattern matches.
 * @param {*} value - Value to scan
 * @param {string} path - Dot-path for reporting
 * @param {number} depth - Current recursion depth
 * @returns {Array<{pattern: string, field: string, severity: string, sample: string}>}
 */
function scanValue(value, fieldPath, depth) {
  if (depth >= MAX_DEPTH) return [];
  if (value === null || value === undefined) return [];

  const matches = [];

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LEN) return [];
    for (const pattern of DLP_PATTERNS) {
      // Reset regex lastIndex for safety
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(value)) {
        // Create redacted sample: first 8 chars + **** + last 4 chars
        const match = value.match(pattern.regex);
        const raw = match ? match[0] : '';
        const sample = raw.length > 16 ? raw.slice(0, 8) + '****' + raw.slice(-4) : '****';

        matches.push({
          pattern: pattern.name,
          field: fieldPath,
          severity: pattern.severity,
          sample,
        });
      }
    }
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      matches.push(...scanValue(value[i], `${fieldPath}[${i}]`, depth + 1));
    }
  } else if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      matches.push(...scanValue(value[key], `${fieldPath}.${key}`, depth + 1));
    }
  }

  return matches;
}

async function main() {
  const mode = getEnforcementMode('DLP_PRETOOL_ENFORCEMENT', 'warn');
  if (mode === 'off') {
    process.exit(0);
  }

  const input = await parseHookInputAsync();
  if (!input) {
    process.exit(0);
  }

  const toolName = getToolName(input);
  const toolInput = getToolInput(input);

  if (!toolName || !toolInput || Object.keys(toolInput).length === 0) {
    process.exit(0);
  }

  // Scan all tool input fields recursively
  const findings = scanValue(toolInput, 'tool_input', 0);

  if (findings.length === 0) {
    trace.allow(toolName, `${HOOK_NAME}:clean`);
    process.exit(0);
  }

  // Separate by severity
  const blocks = findings.filter(f => f.severity === 'block');
  const summary = findings.map(f => `${f.pattern} in ${f.field} (${f.sample})`).join('; ');

  if (blocks.length > 0 && mode === 'block') {
    trace.block(toolName, `${HOOK_NAME}:secret-detected`, {
      findingCount: findings.length,
      patterns: findings.map(f => f.pattern),
    });

    const msg =
      `[DLP] Blocked: ${blocks.length} secret(s) detected in ${toolName} args. ` +
      `Patterns: ${blocks.map(f => f.pattern).join(', ')}. ` +
      `Remove secrets before retrying.`;

    process.stdout.write(formatResult('block', msg));
    process.exit(2);
  }

  // Warn mode or only warn-severity findings
  trace.warn(toolName, `${HOOK_NAME}:secret-warning`, {
    findingCount: findings.length,
    patterns: findings.map(f => f.pattern),
  });

  process.stderr.write(
    JSON.stringify({
      hook: HOOK_NAME,
      event: 'dlp_warning',
      tool: toolName,
      findings: findings.length,
      summary,
      timestamp: new Date().toISOString(),
    }) + '\n'
  );

  process.exit(0);
}

// --- Main ---
main().catch(err => {
  // Fail-closed for security hooks
  process.stderr.write(
    JSON.stringify({
      hook: HOOK_NAME,
      event: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    }) + '\n'
  );
  // In warn mode, fail-open on errors to not block workflow
  const mode = process.env.DLP_PRETOOL_ENFORCEMENT || 'warn';
  process.exit(mode === 'block' ? 2 : 0);
});
