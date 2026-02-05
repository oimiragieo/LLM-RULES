/**
 * @file Shellcheck Validator Hook
 * @hook-type PreToolUse
 * @tool Bash
 * @phase 3
 * @priority MEDIUM
 * @description Validates Bash commands using shellcheck (if available)
 * @enforcement-mode warn (default), block, off
 * @environment SHELLCHECK_VALIDATOR=block|warn|off
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// SC codes to ignore (false positives or handled by other validators)
const IGNORED_CODES = [
  'SC1071', // ShellCheck can only follow this non-bash script
  'SC2086', // Double quote to prevent globbing (handled by Phase 2 quoting validator)
];

/**
 * Run shellcheck on a command
 * @param {string} command - Bash command to validate
 * @returns {{valid: boolean, issues?: Array<Object>, warning?: string}}
 */
function runShellcheck(command) {
  try {
    // Write command to temp file
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `shellcheck-${Date.now()}.sh`);

    // Add shebang for shellcheck
    const script = `#!/bin/bash\n${command}`;
    fs.writeFileSync(tmpFile, script);

    let proc;
    try {
      // Run shellcheck with JSON output (spawnSync + array args: safe for paths with spaces; SHELLCHECK-VAL-001)
      proc = spawnSync('shellcheck', ['--format=json', tmpFile], {
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
      });
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch (_) {
        // ignore
      }
    }

    if (proc.error) {
      if (
        proc.error.code === 'ENOENT' ||
        (proc.error.message && proc.error.message.includes('command not found'))
      ) {
        return {
          valid: true,
          warning:
            'Shellcheck not installed, skipping validation. Install with: brew install shellcheck (macOS) or apt-get install shellcheck (Linux). Set SHELLCHECK_VALIDATOR=off to disable.',
        };
      }
      return {
        valid: true,
        warning: `Shellcheck execution failed: ${proc.error.message}. Set SHELLCHECK_VALIDATOR=off to disable.`,
      };
    }

    const result =
      (proc.stdout && proc.stdout.trim()) || (proc.stderr && proc.stderr.trim()) || '[]';
    let issues;
    try {
      issues = JSON.parse(result);
    } catch {
      return {
        valid: true,
        warning:
          'Shellcheck error parsing failed, skipping validation. Set SHELLCHECK_VALIDATOR=off to disable.',
      };
    }

    if (!Array.isArray(issues)) {
      return { valid: true };
    }

    const relevantIssues = issues.filter(issue => !IGNORED_CODES.includes(`SC${issue.code}`));
    if (relevantIssues.length > 0) {
      return {
        valid: false,
        issues: relevantIssues.map(issue => ({
          line: issue.line,
          column: issue.column,
          level: issue.level, // error, warning, info
          code: `SC${issue.code}`,
          message: issue.message,
        })),
      };
    }
    return { valid: true };
  } catch (error) {
    // Shellcheck not installed or execution failed
    if (error.code === 'ENOENT' || error.message.includes('command not found')) {
      return {
        valid: true,
        warning:
          'Shellcheck not installed, skipping validation. Install with: brew install shellcheck (macOS) or apt-get install shellcheck (Linux)',
      };
    }

    // Other error - fail gracefully
    return {
      valid: true,
      warning: `Shellcheck execution failed: ${error.message}`,
    };
  }
}

/**
 * Validate Bash command using shellcheck
 * @param {Object} input - Tool input from PreToolUse hook
 * @returns {{allowed: boolean, reason?: string, warning?: string}}
 */
function validateShellcheck(input) {
  const { command } = input;
  const mode = process.env.SHELLCHECK_VALIDATOR || 'warn';

  // Skip if disabled
  if (mode === 'off') {
    return { allowed: true, valid: true };
  }

  // Run shellcheck
  const result = runShellcheck(command);

  // If warning (shellcheck unavailable), allow but warn
  if (result.warning) {
    return {
      allowed: true,
      valid: true,
      warning: `[SHELLCHECK-VALIDATOR] ${result.warning}`,
    };
  }

  // If valid, allow
  if (result.valid) {
    return { allowed: true, valid: true };
  }

  // If invalid, format error message
  const errorSummary = result.issues
    .map(issue => `  - Line ${issue.line}: [${issue.code}] ${issue.level}: ${issue.message}`)
    .join('\n');

  const message = `[SHELLCHECK-VALIDATOR] Shellcheck found issues:\n${errorSummary}\n\nFix these issues or set SHELLCHECK_VALIDATOR=off to bypass.`;

  // Block or warn based on mode
  if (mode === 'block') {
    return {
      allowed: false,
      valid: false,
      reason: message,
    };
  }

  // Warn mode
  return {
    allowed: true,
    valid: false,
    warning: message,
  };
}

module.exports = {
  handler: validateShellcheck,
  runShellcheck, // Export for testing
  IGNORED_CODES,
};
