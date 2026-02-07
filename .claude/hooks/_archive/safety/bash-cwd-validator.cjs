/**
 * @file bash-cwd-validator.cjs
 * @hook-type PreToolUse(Bash)
 * @description Blocks background Bash tasks without CWD initialization to PROJECT_ROOT
 * @enforcement block (default) | warn | off (via BASH_CWD_VALIDATOR env var)
 * @related ADR-077 Shell Command Security Architecture
 * @related SHELL-SECURITY-001
 *
 * **Purpose:**
 * Background Bash tasks execute in undefined CWD (not PROJECT_ROOT), causing:
 * - Path traversal: `find tests/` searches from root (/) instead of PROJECT_ROOT
 * - Data exposure: User directories scanned (XboxGames, Documents, etc.)
 * - Resource exhaustion: Entire filesystem searched
 *
 * **Required Pattern:**
 * All background tasks MUST start with: cd "$PROJECT_ROOT" || exit 1
 *
 * **Examples:**
 * ✅ PASS: cd "$PROJECT_ROOT" && find tests/
 * ✅ PASS: cd "$PROJECT_ROOT" || exit 1; find tests/
 * ❌ BLOCK: find tests/  (no CWD initialization)
 * ❌ BLOCK: cd /tmp && find tests/  (wrong directory)
 *
 * **Environment Variables:**
 * - BASH_CWD_VALIDATOR=block (default) - Block invalid commands
 * - BASH_CWD_VALIDATOR=warn - Log warning but allow
 * - BASH_CWD_VALIDATOR=off - Disable validation
 */

/**
 * Validates that background Bash tasks include CWD initialization
 * @param {object} input - Hook input
 * @param {string} input.command - Bash command to execute
 * @param {boolean} input.run_in_background - Whether task runs in background
 * @returns {{allowed: boolean, reason?: string, warning?: string, fix?: string}}
 */
function handler(input) {
  const { command, run_in_background } = input;

  // Only validate background tasks
  if (!run_in_background) {
    return { allowed: true };
  }

  // Check enforcement mode
  const mode = process.env.BASH_CWD_VALIDATOR || 'block';

  if (mode === 'off') {
    return { allowed: true };
  }

  // Check for CWD initialization patterns
  const hasCwdInit = checkCwdInitialization(command);

  if (!hasCwdInit) {
    const message =
      '[BASH-CWD-VALIDATOR] Background Bash task missing CWD initialization. MUST start with: cd "$PROJECT_ROOT" || exit 1';
    const fix = `Prepend: cd "$PROJECT_ROOT" && `;

    if (mode === 'warn') {
      return {
        allowed: true,
        warning: message,
        fix,
      };
    }

    // block mode (default)
    return {
      allowed: false,
      reason: message,
      fix,
    };
  }

  return { allowed: true };
}

/**
 * Checks if command includes CWD initialization to PROJECT_ROOT
 * @param {string} command - Bash command
 * @returns {boolean} - True if CWD initialization present
 */
function checkCwdInitialization(command) {
  // Remove leading whitespace and comments to find first substantive command
  const lines = command.split('\n');
  let firstCommand = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (trimmed && !trimmed.startsWith('#')) {
      firstCommand = trimmed;
      break;
    }
  }

  // If no substantive command found, check entire command
  if (!firstCommand) {
    firstCommand = command.trim();
  }

  // CWD initialization patterns (case-insensitive)
  const cwdPatterns = [
    // cd "$PROJECT_ROOT" (double quotes)
    /^cd\s+"?\$PROJECT_ROOT"?/i,

    // cd '$PROJECT_ROOT' (single quotes)
    /^cd\s+'?\$PROJECT_ROOT'?/i,

    // cd $PROJECT_ROOT (no quotes - allowed but flagged by quoting validator)
    /^cd\s+\$PROJECT_ROOT/i,

    // cd ${PROJECT_ROOT} (braces)
    /^cd\s+"?\$\{PROJECT_ROOT\}"?/i,
  ];

  return cwdPatterns.some(pattern => pattern.test(firstCommand));
}

module.exports = {
  handler,
  checkCwdInitialization, // Export for testing
};
