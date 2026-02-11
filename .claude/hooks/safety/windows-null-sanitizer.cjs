#!/usr/bin/env node
/**
 * Windows Null Device Sanitizer Hook
 *
 * PreToolUse hook that sanitizes bash commands on Windows by ensuring
 * null device references work correctly in the active shell environment.
 *
 * Background:
 * Claude Code on Windows uses Git Bash (MINGW64), a Unix-like shell where
 * /dev/null works correctly and maps to the Windows null device. In Git Bash,
 * writing to "NUL" or "nul" creates a LITERAL FILE instead of using the
 * null device, because Git Bash does not recognize Windows reserved device names.
 *
 * Therefore this hook does the OPPOSITE of what its original version did:
 * - On Windows with Git Bash: ensures /dev/null is used (not NUL)
 * - On Windows with cmd.exe/PowerShell: ensures NUL is used (not /dev/null)
 * - On Unix: no-op (pass through)
 *
 * Exit codes:
 * - 0: Allow operation (outputs modified command if sanitization needed)
 *
 * Output (when modifying):
 * - JSON with tool_input containing the sanitized command
 */

'use strict';

const isWindows = process.platform === 'win32';

/**
 * Detect if the current shell is Git Bash (MINGW/MSYS).
 * Git Bash sets MSYSTEM or MINGW environment variables.
 * Claude Code's Bash tool always runs in Git Bash on Windows.
 */
function isGitBash() {
  const forceShell = (process.env.WINDOWS_NULL_SANITIZER_SHELL || '').trim().toLowerCase();
  if (forceShell === 'cmd' || forceShell === 'powershell') {
    return false;
  }
  if (forceShell === 'bash' || forceShell === 'git-bash') {
    return true;
  }

  // This hook is executed only for Bash tool calls, which map to Git Bash on Windows.
  return true;
}

// PERF-006/PERF-007: Use shared hook-input.cjs utility
const {
  parseHookInputAsync,
  getToolName,
  getToolInput,
} = require('../../lib/utils/hook-input.cjs');

/**
 * Sanitize a command to ensure null device references work correctly.
 *
 * In Git Bash (MINGW/MSYS) on Windows:
 * - /dev/null works correctly (maps to Windows null device)
 * - NUL/nul creates a LITERAL FILE (Git Bash doesn't handle Windows device names)
 * - So we convert NUL/nul -> /dev/null
 *
 * In cmd.exe/PowerShell on Windows:
 * - NUL is the correct null device
 * - /dev/null creates a literal file
 * - So we convert /dev/null -> NUL
 *
 * On Unix: no conversion needed.
 *
 * @param {string} command - The command to sanitize
 * @returns {string} Sanitized command
 */
function sanitizeNullDevice(command) {
  if (!isWindows) {
    return command;
  }

  let sanitized = command;

  if (isGitBash()) {
    // Git Bash: convert Windows device names to /dev/null
    // NUL/nul in redirects creates literal files in Git Bash
    // Match: >NUL, > NUL, 2>NUL, >nul, > nul, 2> nul, >>NUL, etc.
    sanitized = sanitized.replace(
      /([>&])(\s*)(nul)(\s|$|2|&)/gi,
      (match, prefix, space, _device, suffix) => {
        return prefix + space + '/dev/null' + suffix;
      }
    );
    // Also handle > null (common typo) -> /dev/null
    sanitized = sanitized.replace(
      /([>&])(\s*)(null)(\s|$|2|&)/gi,
      (match, prefix, space, _device, suffix) => {
        return prefix + space + '/dev/null' + suffix;
      }
    );
  } else {
    // cmd.exe/PowerShell: convert /dev/null to NUL
    sanitized = sanitized.replace(/\/dev\/null/g, 'NUL');

    // Normalize lowercase device names to uppercase in redirects
    sanitized = sanitized.replace(
      /([>&])(\s*)(nul|null|con|prn|aux)(\s|$|2|&)/gi,
      (match, prefix, space, device, suffix) => {
        const normalizedDevice = device.toLowerCase() === 'null' ? 'NUL' : device.toUpperCase();
        return prefix + space + normalizedDevice + suffix;
      }
    );
  }

  return sanitized;
}

/**
 * Main execution function.
 */
async function main() {
  try {
    // Skip on non-Windows platforms
    if (!isWindows) {
      process.exit(0);
    }

    // PERF-006/PERF-007: Use shared hook-input.cjs utility
    const hookInput = await parseHookInputAsync();

    if (!hookInput) {
      process.exit(0);
    }

    // Verify this is a Bash tool call using shared helper
    const toolName = getToolName(hookInput);
    if (toolName !== 'Bash') {
      process.exit(0);
    }

    // Extract the command using shared helper
    const toolInputData = getToolInput(hookInput);
    const command = toolInputData.command;

    if (!command || typeof command !== 'string') {
      process.exit(0);
    }

    // Check if command needs sanitization based on shell environment
    let needsSanitization;
    if (isGitBash()) {
      // Git Bash: need to convert NUL/nul/null -> /dev/null (prevent literal file creation)
      needsSanitization = /[>&]\s*(nul|null)(\s|$|2|&)/i.test(command);
    } else {
      // cmd.exe/PowerShell: need to convert /dev/null -> NUL
      needsSanitization =
        command.includes('/dev/null') || /[>&]\s*(nul|null|con|prn|aux)(\s|$|2|&)/i.test(command);
    }

    if (!needsSanitization) {
      process.exit(0);
    }

    // Sanitize the command
    const sanitizedCommand = sanitizeNullDevice(command);

    // Output the modified tool_input to update the command
    const modifiedInput = {
      ...toolInputData,
      command: sanitizedCommand,
    };

    // Output JSON to modify the command
    console.log(JSON.stringify({ tool_input: modifiedInput }));
    process.exit(0);
  } catch (err) {
    // On any error, fail open
    if (process.env.DEBUG_HOOKS) {
      console.error('Windows null sanitizer error:', err.message);
    }
    process.exit(0);
  }
}

main();

module.exports = { sanitizeNullDevice, main };
