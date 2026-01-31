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

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODE = process.env.SHELLCHECK_VALIDATOR || 'warn';

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

    try {
      // Run shellcheck with JSON output (using array to prevent command injection)
      const result = execSync('shellcheck --format=json ' + tmpFile, {
        stdio: 'pipe',
        encoding: 'utf8',
      });

      // Clean up temp file
      fs.unlinkSync(tmpFile);

      // Parse JSON output
      const issues = JSON.parse(result || '[]');

      // Filter ignored codes
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
    } catch (shellcheckError) {
      // Shellcheck found issues (exits with non-zero)
      fs.unlinkSync(tmpFile);

      // Try to parse stderr as JSON
      try {
        const issues = JSON.parse(shellcheckError.stdout || '[]');
        const relevantIssues = issues.filter(issue => !IGNORED_CODES.includes(`SC${issue.code}`));

        if (relevantIssues.length > 0) {
          return {
            valid: false,
            issues: relevantIssues.map(issue => ({
              line: issue.line,
              column: issue.column,
              level: issue.level,
              code: `SC${issue.code}`,
              message: issue.message,
            })),
          };
        }

        return { valid: true };
      } catch {
        // Could not parse error output, assume shellcheck not installed
        return {
          valid: true,
          warning: 'Shellcheck error parsing failed, skipping validation',
        };
      }
    }
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

  // Skip if disabled
  if (MODE === 'off') {
    return { allowed: true };
  }

  // Run shellcheck
  const result = runShellcheck(command);

  // If warning (shellcheck unavailable), allow but warn
  if (result.warning) {
    return {
      allowed: true,
      warning: `[SHELLCHECK-VALIDATOR] ${result.warning}`,
    };
  }

  // If valid, allow
  if (result.valid) {
    return { allowed: true };
  }

  // If invalid, format error message
  const errorSummary = result.issues
    .map(issue => `  - Line ${issue.line}: [${issue.code}] ${issue.level}: ${issue.message}`)
    .join('\n');

  const message = `[SHELLCHECK-VALIDATOR] Shellcheck found issues:\n${errorSummary}\n\nFix these issues or set SHELLCHECK_VALIDATOR=off to bypass.`;

  // Block or warn based on mode
  if (MODE === 'block') {
    return {
      allowed: false,
      reason: message,
    };
  }

  // Warn mode
  return {
    allowed: true,
    warning: message,
  };
}

module.exports = {
  handler: validateShellcheck,
  runShellcheck, // Export for testing
  IGNORED_CODES,
};
