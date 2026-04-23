#!/usr/bin/env node
/* eslint-disable max-lines -- security rule definitions and CLI; splitting would obscure flow */
/**
 * Security Lint Tool
 *
 * Pre-commit security scanner for detecting potential security issues.
 * Designed to be run as a pre-commit hook or manually.
 *
 * Usage:
 *   node security-lint.cjs [files...]
 *   node security-lint.cjs --staged
 *   node security-lint.cjs --all
 *
 * Exit codes:
 *   0 - No security issues found
 *   1 - Security issues detected
 *   2 - Error during execution
 */

'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Maximum file size to scan (in bytes)
  maxFileSize: 1024 * 1024, // 1MB

  // File extensions to scan
  scanExtensions: [
    '.js',
    '.cjs',
    '.mjs',
    '.ts',
    '.tsx',
    '.jsx',
    '.json',
    '.yaml',
    '.yml',
    '.env',
    '.sh',
    '.bash',
    '.py',
    '.rb',
    '.go',
    '.rs',
    '.md',
    '.txt',
  ],

  // Directories to skip
  skipDirs: [
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    'vendor',
    '_archive',
  ],

  // Path patterns: do not scan .md files under these (docs/plans/skills/agents - examples only)
  skipMdPaths: ['.claude/docs/', '.claude/context/plans/', '.claude/skills/', '.claude/agents/'],

  // Known false positives: { pathSubstring, ruleId } - excluded from blocking
  skipFindings: [
    { pathSubstring: 'user-prompt-unified.cjs', ruleId: 'SEC-040' }, // path.join with literal "reflection-spawn-request"
    { pathSubstring: 'user-prompt-unified.core.cjs', ruleId: 'SEC-040' }, // path.join PROJECT_ROOT + .claude/context/runtime + literals only
    { pathSubstring: 'user-prompt-orchestrator.cjs', ruleId: 'SEC-040' }, // path.join runtimeDir (PROJECT_ROOT) + literals only
    { pathSubstring: 'memory-health-check.cjs', ruleId: 'SEC-040' }, // path.join with literal "reflection-spawn-request.json"
    { pathSubstring: 'reflection-step0-guard.cjs', ruleId: 'SEC-040' }, // path.join with literal "reflection-spawn-request"
    { pathSubstring: 'reflection-step0-guard.test.cjs', ruleId: 'SEC-040' }, // path.join with literal in test
    { pathSubstring: 'force-step0-execution.cjs', ruleId: 'SEC-040' }, // path.join PROJECT_ROOT + constants only
    { pathSubstring: 'force-step0-execution.test.cjs', ruleId: 'SEC-040' }, // path.join test fixture path (constants)
    { pathSubstring: 'pre-tool-unified.cjs', ruleId: 'SEC-040' }, // path.join REFLECTION_RUNTIME_DIR + constants only
    { pathSubstring: 'pre-tool-unified-read-safety.test.cjs', ruleId: 'SEC-040' }, // path.join test fixture (constants)
    { pathSubstring: 'pre-tool-unified.read-safety.cjs', ruleId: 'SEC-040' }, // path.join REFLECTION_RUNTIME_DIR + literals only, no user input
    { pathSubstring: 'unified-pre-write-hook.cjs', ruleId: 'SEC-012' }, // regex pattern that detects eval in content, does not call eval()
    { pathSubstring: 'spawn-assembly-metrics-summary.cjs', ruleId: 'SEC-030' }, // CLI metrics summary (aggregates, not secrets)
    { pathSubstring: 'step-validators.cjs', ruleId: 'SEC-013' }, // new Function() for dynamic workflow validation (controlled input)
    { pathSubstring: 'generate-tool-manifest.cjs', ruleId: 'SEC-030' }, // CLI diagnostic logging
    { pathSubstring: 'migrate-2x-to-3.cjs', ruleId: 'SEC-030' }, // CLI migration guide output — user-facing text about env var names, not credentials
    { pathSubstring: 'run-workflow-tests.cjs', ruleId: 'SEC-030' }, // CLI test suite help output (not sensitive)
    { pathSubstring: 'ecosystem-assessor/', ruleId: 'SEC-030' }, // CLI analysis tool diagnostic output
    { pathSubstring: 'project-analyzer/', ruleId: 'SEC-030' }, // CLI analysis tool diagnostic output
    { pathSubstring: 'python-backend-expert/scripts/main.cjs', ruleId: 'SEC-030' }, // CLI help text only, no credentials
    { pathSubstring: 'typescript-expert/scripts/main.cjs', ruleId: 'SEC-030' }, // CLI help/diagnostic output only, no credentials
    { pathSubstring: 'reflection-cleanup.cjs', ruleId: 'SEC-040' }, // path.join RUNTIME_DIR + literal only, no user input
    { pathSubstring: 'context-compressor/scripts/main.cjs', ruleId: 'SEC-030' }, // CLI token/stats output, not credentials
    { pathSubstring: 'hybrid-search.cjs', ruleId: 'SEC-030' }, // CLI token stats and help output, not credentials
    { pathSubstring: 'token-saver-stats.cjs', ruleId: 'SEC-030' }, // CLI token/stats output, not credentials
    { pathSubstring: 'setup.cjs', ruleId: 'SEC-030' }, // Interactive setup wizard — displays masked key status (last 4 chars only via maskKey()), not raw secrets
    { pathSubstring: 'agent-registry.json', ruleId: 'SEC-031' }, // generated; "debugger" in capability text, not statement
    { pathSubstring: 'agent-registry-domain.json', ruleId: 'SEC-031' }, // generated; "debugger" in capability text
    { pathSubstring: 'post-task-unified.cjs', ruleId: 'SEC-011' }, // execSync node with project path (controlled)
    { pathSubstring: 'tests/migration/', ruleId: 'SEC-011' }, // test harness execSync with controlled input
    { pathSubstring: 'count-all-tests.mjs', ruleId: 'SEC-011' }, // internal test counter with controlled input
    { pathSubstring: 'tests/integration/e2e/phase1a-e2e.test.cjs', ruleId: 'SEC-011' }, // E2E test harness exec() with literal node CLI paths
  ],

  // Files explicitly allowed to bypass scanning with security-lint-ignore.
  securityLintIgnoreAllowlist: [
    'tests/lib/workflow/decision-handler-security.test.cjs',
    'tests/scripts/install-security.test.cjs',
  ],

  // Severity levels
  severityLevels: {
    critical: 3,
    high: 2,
    medium: 1,
    low: 0,
  },
};

// =============================================================================
// Security Rules
// =============================================================================

/**
 * Security rules to check
 * Each rule has: id, name, severity, pattern, description, fix
 * Optional: codeOnly (boolean) - only scan code files, not docs
 */
const SECURITY_RULES = [
  // Secrets & Credentials
  {
    id: 'SEC-001',
    name: 'Hardcoded API Key',
    severity: 'critical',
    pattern: /(?:api[-_]?key|apikey)\s*[:=]\s*['"`]([A-Za-z0-9_-]{20,})['"`]/gi,
    description: 'Hardcoded API key detected',
    fix: 'Use environment variables: process.env.API_KEY',
  },
  {
    id: 'SEC-002',
    name: 'Hardcoded Password',
    severity: 'critical',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"`]([^'"`]{4,})['"`]/gi,
    description: 'Hardcoded password detected',
    fix: 'Use environment variables or a secrets manager',
  },
  {
    id: 'SEC-003',
    name: 'Private Key',
    severity: 'critical',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i,
    description: 'Private key detected in file',
    fix: 'Remove private keys from source code',
  },
  {
    id: 'SEC-004',
    name: 'AWS Credentials',
    severity: 'critical',
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/,
    description: 'AWS access key ID detected',
    fix: 'Use AWS IAM roles or environment variables',
  },
  {
    id: 'SEC-005',
    name: 'JWT Secret',
    severity: 'critical',
    pattern: /(?:jwt[-_]?secret|jwt[-_]?key)\s*[:=]\s*['"`]([^'"`]{8,})['"`]/gi,
    description: 'Hardcoded JWT secret detected',
    fix: 'Use environment variables for JWT secrets',
  },

  // Injection Vulnerabilities (CODE ONLY - not in docs)
  {
    id: 'SEC-010',
    name: 'SQL Injection Risk',
    severity: 'high',
    pattern: /(?:query|execute)\s*\(\s*['"`].*\$\{.*\}.*['"`]\s*\)/gi,
    description: 'Potential SQL injection via string interpolation',
    fix: 'Use parameterized queries',
  },
  {
    id: 'SEC-011',
    name: 'Command Injection Risk',
    severity: 'high',
    pattern: /(?:exec|execSync|spawn|spawnSync)\s*\([^)]*\$\{/gi,
    description: 'Potential command injection via string interpolation',
    fix: 'Use array arguments instead of string interpolation',
  },
  {
    id: 'SEC-012',
    name: 'Eval Usage',
    severity: 'high',
    pattern: /(?<![\w.])eval\s*\(/g,
    description: 'eval() usage detected - potential code injection',
    fix: 'Avoid eval(); use safer alternatives',
    codeOnly: true, // Only scan code files, not .md/.json docs
  },
  {
    id: 'SEC-013',
    name: 'Function Constructor',
    severity: 'high',
    pattern: /new\s+Function\s*\(/g,
    description: 'Function constructor usage - similar to eval()',
    fix: 'Avoid dynamic function creation',
    codeOnly: true, // Only scan code files, not .md/.json docs
  },

  // Insecure Patterns
  {
    id: 'SEC-020',
    name: 'HTTP Without TLS',
    severity: 'medium',
    pattern: /['"`]http:\/\/(?!localhost|127\.0\.0\.1)/gi,
    description: 'HTTP URL detected (non-localhost)',
    fix: 'Use HTTPS for secure communication',
    codeOnly: true, // Only scan code files - HTTP refs in docs/memory are informational
  },
  {
    id: 'SEC-021',
    name: 'Disabled SSL Verification',
    severity: 'high',
    pattern: /rejectUnauthorized\s*:\s*false/gi,
    description: 'SSL certificate verification disabled',
    fix: 'Enable SSL certificate verification',
  },
  {
    id: 'SEC-022',
    name: 'Weak Crypto Algorithm',
    severity: 'medium',
    pattern: /createCipher\s*\(\s*['"`](?:des|rc4|md5)/gi,
    description: 'Weak cryptographic algorithm detected',
    fix: 'Use strong algorithms like AES-256-GCM',
  },
  {
    id: 'SEC-023',
    name: 'MD5 Hash',
    severity: 'medium',
    pattern: /createHash\s*\(\s*['"`]md5['"`]\s*\)/gi,
    description: 'MD5 hash detected - cryptographically weak',
    fix: 'Use SHA-256 or better for security purposes',
  },

  // Debug/Development Code
  {
    id: 'SEC-030',
    name: 'Console Log Credentials',
    severity: 'high',
    pattern: /console\.(?:log|debug|info)\s*\([^)]*(?:password|secret|key|token|credential)/gi,
    description: 'Logging sensitive data',
    fix: 'Remove sensitive data from logs',
  },
  {
    id: 'SEC-031',
    name: 'Debugger Statement',
    severity: 'low',
    pattern: /\bdebugger\b/g,
    description: 'debugger statement found',
    fix: 'Remove debugger statements before commit',
  },

  // File System
  {
    id: 'SEC-040',
    name: 'Unsafe Path Join',
    severity: 'medium',
    pattern: /path\.join\s*\([^)]*(?:req\.|request\.)/gi,
    description: 'Path constructed from user input',
    fix: 'Validate and sanitize user-provided paths',
  },

  // Prototype Pollution
  {
    id: 'SEC-050',
    name: 'Prototype Access',
    severity: 'high',
    pattern: /\[['"`]__proto__['"`]\]|\[['"`]constructor['"`]\]|\[['"`]prototype['"`]\]/g,
    description: 'Direct prototype access - pollution risk',
    fix: 'Use Object.create(null) for dictionaries',
  },
];

// =============================================================================
// File Scanning
// =============================================================================

/**
 * Get list of files to scan
 * @param {string[]} args - Command line arguments
 * @returns {string[]} List of file paths
 */
function getFilesToScan(args) {
  // Check for --staged flag (git staged files)
  if (args.includes('--staged')) {
    const result = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
      encoding: 'utf8',
      shell: false,
    });
    if (result.status !== 0) {
      console.error('Error getting staged files:', result.stderr || `exit ${result.status}`);
      return [];
    }
    return String(result.stdout || '')
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  // Check for --all flag (all tracked files)
  if (args.includes('--all')) {
    const result = spawnSync('git', ['ls-files'], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    if (result.status !== 0) {
      console.error('Error getting tracked files:', result.stderr || `exit ${result.status}`);
      return [];
    }
    return String(result.stdout || '')
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  // Specific files provided
  const files = args.filter(arg => !arg.startsWith('--'));
  if (files.length > 0) {
    return files;
  }

  // Default: scan current directory
  return walkDirectory('.');
}

/**
 * Recursively walk directory and collect files
 * @param {string} dir - Directory to walk
 * @returns {string[]} List of file paths
 */
function walkDirectory(dir) {
  const files = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (CONFIG.skipDirs.includes(entry.name)) {
          continue;
        }
        files.push(...walkDirectory(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (_err) {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Normalize path for consistent matching (forward slashes)
 * @param {string} filePath - File path
 * @returns {string} Normalized path
 */
function normalizePathForMatch(filePath) {
  return filePath.split(path.sep).join('/');
}

/**
 * Check if file should be scanned
 * @param {string} filePath - File path
 * @returns {boolean} Whether to scan
 */
function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const normalized = normalizePathForMatch(filePath);

  // Check extension
  if (!CONFIG.scanExtensions.includes(ext) && !filePath.includes('.env')) {
    return false;
  }

  // Skip .md files under docs/plans/skills (examples and documentation only)
  if (ext === '.md' && CONFIG.skipMdPaths) {
    if (CONFIG.skipMdPaths.some(prefix => normalized.includes(prefix))) {
      return false;
    }
  }

  // Check file size
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > CONFIG.maxFileSize) {
      return false;
    }
  } catch (_err) {
    return false;
  }

  return true;
}

/**
 * Check if file should be skipped (test fixtures)
 * @param {string} filePath - File path
 * @param {string} content - File content
 * @returns {boolean} Whether to skip scanning
 */
function shouldSkipScanning(filePath, content) {
  // Skip only when security-lint-ignore is both allowlisted and justified.
  const ignoreDirective = extractSecurityLintIgnoreDirective(content);
  if (ignoreDirective) {
    const normalized = normalizePathForMatch(filePath);
    const allowlisted = CONFIG.securityLintIgnoreAllowlist.some(allowed =>
      normalized.endsWith(allowed)
    );
    if (allowlisted && ignoreDirective.reason.length > 0) {
      return true;
    }
  }

  const normalized = normalizePathForMatch(filePath);

  // Skip archived files (superseded code, no longer active)
  if (
    normalized.includes('/_archive/') ||
    normalized.includes('/archive/') ||
    normalized.includes('\\archive\\')
  ) {
    return true;
  }

  const fileName = path.basename(filePath);

  // Skip README files (documentation that may reference patterns)
  if (fileName === 'README.md') {
    return true;
  }

  // Skip security-lint.cjs itself (contains security patterns as rule definitions)
  if (fileName === 'security-lint.cjs' && content.includes('SECURITY_RULES')) {
    return true;
  }

  // Skip test files that are testing security patterns
  // These files intentionally contain security issues as test data
  if (
    fileName.includes('.test.') &&
    (content.includes('SECURITY_RULES') ||
      content.includes('scanFile') ||
      content.includes('shouldSkipScanning') ||
      content.includes('security-lint.cjs'))
  ) {
    return true;
  }

  return false;
}

function extractSecurityLintIgnoreDirective(content) {
  const firstLine = String(content || '').split('\n', 1)[0] || '';
  const match = firstLine.match(
    /^\s*(?:\/\/|#|\/\*)\s*security-lint-ignore(?:\s*:\s*(.*?))?\s*(?:\*\/)?\s*$/i
  );
  if (!match) return null;
  return { reason: String(match[1] || '').trim() };
}

/**
 * Check if file is a code file (not documentation)
 * @param {string} filePath - File path
 * @returns {boolean} Whether file is code
 */
function isCodeFile(filePath) {
  const codeExtensions = ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs'];
  const ext = path.extname(filePath).toLowerCase();
  return codeExtensions.includes(ext);
}

/**
 * Scan a single file for security issues
 * @param {string} filePath - File path
 * @returns {Object[]} Array of findings
 */
function scanFile(filePath) {
  const findings = [];

  // Read file content
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_err) {
    return findings;
  }

  // Check if file should be skipped
  if (shouldSkipScanning(filePath, content)) {
    return findings;
  }

  const ext = path.extname(filePath).toLowerCase();
  const isCode = isCodeFile(filePath);

  // Check each rule
  for (const rule of SECURITY_RULES) {
    // Skip codeOnly rules for non-code files (.md, .json)
    if (rule.codeOnly && !isCode) {
      continue;
    }

    // Skip SEC-020 (http://) for .schema.json files (JSON Schema URIs)
    if (rule.id === 'SEC-020' && ext === '.json' && filePath.endsWith('.schema.json')) {
      continue;
    }

    // Create fresh regex to reset lastIndex
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);

    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Find line number
      const upToMatch = content.substring(0, match.index);
      const lineNumber = upToMatch.split('\n').length;

      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        description: rule.description,
        fix: rule.fix,
        file: filePath,
        line: lineNumber,
        column: match.index - upToMatch.lastIndexOf('\n'),
        match: match[0].substring(0, 50) + (match[0].length > 50 ? '...' : ''),
      });

      // Prevent infinite loops for non-global patterns
      if (!pattern.global) break;
    }
  }

  return findings;
}

// =============================================================================
// Output Formatting
// =============================================================================

/**
 * Format findings for console output
 * @param {Object[]} findings - All findings
 * @returns {string} Formatted output
 */
function formatFindings(findings) {
  if (findings.length === 0) {
    return '\n\x1b[32m[PASS] No security issues found\x1b[0m\n';
  }

  // Group by file
  const byFile = {};
  for (const f of findings) {
    if (!byFile[f.file]) byFile[f.file] = [];
    byFile[f.file].push(f);
  }

  // Count by severity
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    counts[f.severity]++;
  }

  let output = '\n\x1b[31m[FAIL] Security issues detected\x1b[0m\n\n';

  // Summary
  output += '\x1b[1mSummary:\x1b[0m\n';
  if (counts.critical > 0) output += `  \x1b[31m* Critical: ${counts.critical}\x1b[0m\n`;
  if (counts.high > 0) output += `  \x1b[33m* High: ${counts.high}\x1b[0m\n`;
  if (counts.medium > 0) output += `  \x1b[34m* Medium: ${counts.medium}\x1b[0m\n`;
  if (counts.low > 0) output += `  \x1b[90m* Low: ${counts.low}\x1b[0m\n`;
  output += '\n';

  // Details by file
  for (const [file, fileFindings] of Object.entries(byFile)) {
    output += `\x1b[1m${file}\x1b[0m\n`;

    for (const f of fileFindings) {
      const severityColor = {
        critical: '\x1b[31m',
        high: '\x1b[33m',
        medium: '\x1b[34m',
        low: '\x1b[90m',
      }[f.severity];

      output += `  ${severityColor}${f.line}:${f.column}\x1b[0m  ${f.ruleId} ${f.description}\n`;
      output += `           \x1b[90mMatch: ${f.match}\x1b[0m\n`;
      output += `           \x1b[36mFix: ${f.fix}\x1b[0m\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Format findings as JSON
 * @param {Object[]} findings - All findings
 * @returns {string} JSON output
 */
function formatJson(findings) {
  return JSON.stringify(
    {
      success: findings.length === 0,
      totalFindings: findings.length,
      findings,
      scannedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

// =============================================================================
// Main Execution
// =============================================================================

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Security Lint - Pre-commit security scanner

Usage:
  security-lint.cjs [options] [files...]

Options:
  --staged    Scan git staged files
  --all       Scan all git tracked files
  --json      Output results as JSON
  --help, -h  Show this help

Examples:
  security-lint.cjs --staged           # Pre-commit hook
  security-lint.cjs src/auth.js        # Scan specific file
  security-lint.cjs --all --json       # Full scan with JSON output
`);
    process.exit(0);
  }

  // Get files to scan
  const files = getFilesToScan(args);
  const filesToScan = files.filter(shouldScanFile);

  if (filesToScan.length === 0) {
    console.log('No files to scan');
    process.exit(0);
  }

  // Scan all files
  let allFindings = [];
  for (const file of filesToScan) {
    const findings = scanFile(file);
    allFindings.push(...findings);
  }

  // Exclude known false positives (path + ruleId) from blocking and report
  if (CONFIG.skipFindings && CONFIG.skipFindings.length > 0) {
    allFindings = allFindings.filter(f => {
      const normalized = normalizePathForMatch(f.file);
      const skip = CONFIG.skipFindings.some(
        s => normalized.includes(s.pathSubstring) && f.ruleId === s.ruleId
      );
      return !skip;
    });
  }

  // Output results
  if (args.includes('--json')) {
    console.log(formatJson(allFindings));
  } else {
    console.log(formatFindings(allFindings));
    console.log(`Scanned ${filesToScan.length} file(s)`);
  }

  // Exit with appropriate code
  const hasCriticalOrHigh = allFindings.some(
    f => f.severity === 'critical' || f.severity === 'high'
  );
  process.exit(hasCriticalOrHigh ? 1 : 0);
}

// Export for testing
module.exports = {
  SECURITY_RULES,
  scanFile,
  shouldScanFile,
  shouldSkipScanning,
  extractSecurityLintIgnoreDirective,
  normalizePathForMatch,
  isCodeFile,
  CONFIG,
};

// Run main only if executed directly (not when required as module)
const wrappedMain = wrapCLITool(main, 'security-lint');

if (require.main === module) {
  wrappedMain();
}
