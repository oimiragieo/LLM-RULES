/**
 * @file Command Allowlist Validator Hook
 * @hook-type PreToolUse
 * @tool Bash
 * @phase 3
 * @priority MEDIUM
 * @description Validates Bash commands against allowlist of approved commands
 * @enforcement-mode warn (default), block, off
 * @environment COMMAND_ALLOWLIST=block|warn|off
 */

const { isCommandAllowed } = require('../../lib/safety/command-allowlist.cjs');

/**
 * Validate Bash command against command allowlist
 * @param {Object} input - Tool input from PreToolUse hook
 * @returns {{allowed: boolean, reason?: string, warning?: string}}
 */
function validateCommandAllowlist(input) {
  const { command } = input;
  const mode = process.env.COMMAND_ALLOWLIST || 'warn';

  // Skip if disabled
  if (mode === 'off') {
    return { allowed: true };
  }

  // Check against allowlist
  const result = isCommandAllowed(command);

  if (result.allowed) {
    return { allowed: true };
  }

  // Format error message
  const message = `[COMMAND-ALLOWLIST] ${result.reason}\n\nCommand: ${result.command}\nFull: ${command}\n\nTo bypass: Set COMMAND_ALLOWLIST=off`;

  // Block or warn based on mode
  if (mode === 'block') {
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
  handler: validateCommandAllowlist,
};
