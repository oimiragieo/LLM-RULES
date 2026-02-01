/**
 * @file shell-injection-validator.cjs
 * @hook-type PreToolUse(Bash)
 * @description Blocks Bash commands with shell injection patterns
 * @enforcement block (default) | warn | off (via SHELL_INJECTION_VALIDATOR env var)
 * @related ADR-077 Shell Command Security Architecture
 * @related SHELL-SECURITY-002
 *
 * **Purpose:**
 * Prevents arbitrary command execution via:
 * - Chained commands: `; rm -rf /`, `&& malicious`, `| dangerous`
 * - Command substitution: `$(rm -rf /)`, `` `malicious` ``
 * - Dangerous targets: `rm -rf /`, `rm -rf ~`, `rm -rf *`
 * - Code injection: `eval`, redirects to `/dev/`
 *
 * **Examples:**
 * ❌ BLOCK: find tests/; rm -rf /
 * ❌ BLOCK: eval "malicious"
 * ❌ BLOCK: echo $(rm -rf /)
 * ❌ BLOCK: cat data >> /dev/sda
 * ✅ PASS: find tests/ -name "*.test.*"
 * ✅ PASS: cd tests/ && npm test
 *
 * **Environment Variables:**
 * - SHELL_INJECTION_VALIDATOR=block (default) - Block dangerous commands
 * - SHELL_INJECTION_VALIDATOR=warn - Log warning but allow (NOT RECOMMENDED)
 * - SHELL_INJECTION_VALIDATOR=off - Disable validation (DANGEROUS)
 */

/**
 * Dangerous patterns that indicate shell injection attempts
 */
const INJECTION_PATTERNS = [
  { pattern: /;\s*rm\s+-rf/, message: 'Chained rm -rf command detected' },
  { pattern: /\|\s*rm\s+-rf/, message: 'Piped rm -rf command detected' },
  { pattern: /&&\s*rm\s+-rf/, message: 'Conditional rm -rf command detected' },
  { pattern: /eval\s+/, message: 'eval command injection risk' },
  { pattern: />>\s*\/dev\//, message: 'System device redirect detected' },
  { pattern: /\$\([^)]*rm/, message: 'Command substitution with rm' },
  { pattern: /`[^`]*rm/, message: 'Backtick execution with rm' },
];

/**
 * Dangerous targets for rm commands
 */
const DANGEROUS_TARGETS = [
  { pattern: /rm\s+-rf\s+\/(?!\w)/, message: 'rm -rf / (root deletion)' },
  { pattern: /rm\s+-rf\s+~/, message: 'rm -rf ~ (home deletion)' },
  { pattern: /rm\s+-rf\s+\*/, message: 'rm -rf * (wildcard deletion)' },
];

/**
 * Validates Bash command for shell injection patterns
 * @param {object} input - Hook input
 * @param {string} input.command - Bash command to execute
 * @returns {{allowed: boolean, reason?: string, warning?: string, detected?: string}}
 */
function handler(input) {
  const { command } = input;

  // Check enforcement mode
  const mode = process.env.SHELL_INJECTION_VALIDATOR || 'block';

  if (mode === 'off') {
    return { allowed: true };
  }

  // Check injection patterns
  for (const { pattern, message } of INJECTION_PATTERNS) {
    if (pattern.test(command)) {
      const violation = {
        message: `[SHELL-INJECTION] ${message}`,
        detected: pattern.toString(),
      };

      if (mode === 'warn') {
        return {
          allowed: true,
          warning: violation.message,
          detected: violation.detected,
        };
      }

      // block mode (default)
      return {
        allowed: false,
        reason: violation.message,
        detected: violation.detected,
      };
    }
  }

  // Check dangerous targets
  for (const { pattern, message } of DANGEROUS_TARGETS) {
    if (pattern.test(command)) {
      const violation = {
        message: `[SHELL-INJECTION] ${message}`,
        detected: pattern.toString(),
      };

      if (mode === 'warn') {
        return {
          allowed: true,
          warning: violation.message,
          detected: violation.detected,
        };
      }

      // block mode (default)
      return {
        allowed: false,
        reason: violation.message,
        detected: violation.detected,
      };
    }
  }

  return { allowed: true };
}

module.exports = {
  handler,
  INJECTION_PATTERNS, // Export for testing
  DANGEROUS_TARGETS, // Export for testing
};
