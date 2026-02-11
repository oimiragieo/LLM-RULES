#!/usr/bin/env node
/**
 * Bash Command Validator Hook
 *
 * PreToolUse hook that validates bash commands using the validator registry.
 * Blocks dangerous commands that could harm the system or data.
 *
 * Exit codes:
 * - 0: Allow operation (command is safe or no validator exists)
 * - 2: Block operation (command is dangerous)
 *
 * The hook fails CLOSED (exits 2) on errors to prevent security bypass.
 * Set BASH_VALIDATOR_FAIL_OPEN=true to override for debugging only.
 *
 * PERF-006: Uses shared hook-input utility to eliminate code duplication.
 */

'use strict';

const { validateCommand } = require('./validators/registry.cjs');

// PERF-006: Use shared hook-input utility instead of duplicated 55-line parseHookInput function
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
  auditLog,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

/**
 * Detect shell commands that commonly trigger "bad substitution" because they
 * contain JavaScript-style template expressions inside ${...}.
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectBadSubstitutionRisk(command) {
  if (!command || typeof command !== 'string') return null;

  // Examples to block:
  // - echo ${c.code.substring(0, 80)}
  // - printf "${obj.method()}"
  // Safe shell expansions like ${HOME} or ${var:-default} do not match.
  const jsTemplateInShell =
    /\$\{[^}\n]*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\([^}\n]*\)[^}\n]*\}/;
  if (jsTemplateInShell.test(command)) {
    return (
      'Potential JS template interpolation inside ${...} detected; this causes shell bad substitution. ' +
      'Use shell-safe expansion (e.g. $VAR, ${VAR}) or precompute the value outside Bash.'
    );
  }

  return null;
}

/**
 * Detect unsupported ripgrep type aliases that cause runtime failures in this
 * environment (e.g. `rg --type cjs`).
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectUnsupportedRipgrepType(command) {
  if (!command || typeof command !== 'string') return null;
  if (!/(^|\s)rg(\s|$)/.test(command)) return null;

  const hasUnsupportedType =
    /(^|\s)--type(?:=|\s+)cjs(\s|$)/i.test(command) ||
    /(^|\s)-t\s*cjs(\s|$)/i.test(command) ||
    /(^|\s)-tcjs(\s|$)/i.test(command);

  if (!hasUnsupportedType) return null;

  return (
    'Unsupported ripgrep type alias "cjs". Use globs instead: ' +
    '`rg -n "<pattern>" -g "*.cjs" -S <path>`.'
  );
}

/**
 * Block Bash-based report generation/writes so agents must use Write/Edit
 * for deterministic artifact creation and traceable diffs.
 *
 * @param {string} command - Raw shell command
 * @returns {string|null} Blocking reason or null when safe
 */
function detectBashReportWrite(command) {
  if (!command || typeof command !== 'string') return null;

  const reportPathPattern = /\.claude[\\/]+context[\\/]+reports[\\/]+/i;
  if (!reportPathPattern.test(command)) return null;

  const writesViaRedirection =
    /(?:^|[\s;|&])(?:cat|echo|printf)\b[\s\S]*?(?:>>?|1>>?)\s*['"]?[^'"\s]*\.claude[\\/]+context[\\/]+reports[\\/]+/i.test(
      command
    ) || /(?:>>?|1>>?)\s*['"]?[^'"\s]*\.claude[\\/]+context[\\/]+reports[\\/]+/i.test(command);
  const writesViaTee = /\btee\b[\s\S]*\.claude[\\/]+context[\\/]+reports[\\/]+/i.test(command);
  const writesViaFileOps =
    /\b(?:cp|mv|touch)\b[\s\S]*\.claude[\\/]+context[\\/]+reports[\\/]+/i.test(command);

  if (!writesViaRedirection && !writesViaTee && !writesViaFileOps) return null;

  return (
    'Bash writes to .claude/context/reports are not allowed for task artifacts. ' +
    'Use Write/Edit tools to create report files so hooks can validate wiring and completion.'
  );
}

/**
 * Extract the bash command from hook input.
 *
 * @param {object} hookInput - The parsed hook context
 * @returns {string|null} The command string or null if not found
 */
function extractCommand(hookInput) {
  if (!hookInput) return null;

  // PERF-006: Use shared utility to get tool input
  const toolInput = getToolInput(hookInput);

  // The Bash tool uses 'command' parameter
  if (toolInput.command && typeof toolInput.command === 'string') {
    return toolInput.command;
  }

  return null;
}

/**
 * Format a blocked command message for display.
 *
 * @param {string} command - The blocked command
 * @param {string} reason - The reason for blocking
 * @returns {string} Formatted message
 */
function formatBlockedMessage(command, reason) {
  const truncatedCmd = command.length > 50 ? command.slice(0, 47) + '...' : command;

  return `
+--------------------------------------------------+
| BLOCKED: Dangerous Command Detected              |
+--------------------------------------------------+
| Command: ${truncatedCmd.padEnd(40)} |
|                                                  |
| Reason: ${reason.slice(0, 41).padEnd(41)}|
|                                                  |
| This command was blocked by the safety hook.     |
| If you believe this is a false positive, review  |
| the command and try a safer alternative.         |
+--------------------------------------------------+
`;
}

/**
 * Main execution function.
 */
async function main() {
  try {
    // PERF-006: Parse the hook input using shared utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      // No input provided - fail open
      process.exit(0);
    }

    // PERF-006: Verify this is a Bash tool call using shared helper
    const toolName = getToolName(hookInput);
    if (toolName !== 'Bash') {
      // Not a Bash tool - should not happen but fail open
      process.exit(0);
    }

    // Extract the command
    const command = extractCommand(hookInput);

    if (!command) {
      // No command to validate - allow
      process.exit(0);
    }

    const badSubstitutionReason = detectBadSubstitutionRisk(command);
    if (badSubstitutionReason) {
      console.error(formatBlockedMessage(command, badSubstitutionReason));
      process.exit(2);
    }

    const ripgrepTypeReason = detectUnsupportedRipgrepType(command);
    if (ripgrepTypeReason) {
      console.error(formatBlockedMessage(command, ripgrepTypeReason));
      process.exit(2);
    }

    const reportWriteReason = detectBashReportWrite(command);
    if (reportWriteReason) {
      console.error(formatBlockedMessage(command, reportWriteReason));
      process.exit(2);
    }

    // Validate the command using the registry
    const result = validateCommand(command);

    if (!result.valid) {
      // Command is dangerous - block it
      try {
        await eventBus.emit(EventTypes.TOOL_BLOCKED, {
          type: EventTypes.TOOL_BLOCKED,
          timestamp: new Date().toISOString(),
          toolName: 'Bash',
          reason: result.error || 'bash_command_blocked',
        });
      } catch (_err) {
        // Best-effort
      }
      console.error(formatBlockedMessage(command, result.error || 'Unknown safety violation'));
      process.exit(2);
    }

    // Command is safe - allow
    process.exit(0);
  } catch (err) {
    // SEC-008: Fail CLOSED on errors to prevent bypass attacks
    // An attacker could craft input that triggers errors to bypass validation
    // Defense-in-depth principle: deny by default when security state is unknown

    // Allow debug override for troubleshooting
    if (process.env.BASH_VALIDATOR_FAIL_OPEN === 'true') {
      auditLog('bash-command-validator', 'fail_open_override', {
        error: err.message,
        warning: 'Failing open due to BASH_VALIDATOR_FAIL_OPEN override',
      });
      process.exit(0);
    }

    auditLog('bash-command-validator', 'error_fail_closed', { error: err.message });

    if (process.env.DEBUG_HOOKS) {
      console.error('Bash command validator error - BLOCKING for safety:', err.message);
      console.error('Stack trace:', err.stack);
    }
    try {
      await eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'bash-command-validator',
        error: err.message,
      });
    } catch (_err) {
      // Best-effort
    }
    process.exit(2);
  }
}

// Run main function
main();

// Export for testing
// PERF-006: Alias parseHookInput for backward compatibility
module.exports = {
  main,
  extractCommand,
  formatBlockedMessage,
  detectBadSubstitutionRisk,
  detectUnsupportedRipgrepType,
  detectBashReportWrite,
  parseHookInput: parseHookInputAsync,
};
