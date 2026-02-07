/**
 * Cross-Platform Utilities
 *
 * Provides platform-aware constants and utilities for Windows/Unix compatibility.
 *
 * Usage:
 *   const { NULL_DEVICE, isWindows, shellQuote } = require('../lib/platform.cjs');
 *   execSync(`command 2>${NULL_DEVICE}`);
 */

/**
 * Detect if the current shell is Git Bash (MINGW/MSYS) on Windows.
 * In Git Bash, /dev/null works correctly but NUL creates a literal file.
 */
function _isGitBash() {
  return !!(
    process.env.MSYSTEM ||
    process.env.MINGW_PREFIX ||
    (process.env.SHELL && process.env.SHELL.includes('/usr/bin/bash')) ||
    (process.env.TERM_PROGRAM && process.env.TERM_PROGRAM === 'mintty')
  );
}

/**
 * The null device for the current platform and shell environment.
 * - Windows with Git Bash: '/dev/null' (Git Bash maps this to the null device;
 *   NUL/nul creates a literal file in Git Bash)
 * - Windows with cmd.exe/PowerShell: 'NUL'
 * - Unix/Linux/macOS: '/dev/null'
 *
 * IMPORTANT: On Windows, the correct value depends on whether you're running
 * in Git Bash (MINGW) or cmd.exe/PowerShell. This constant auto-detects.
 */
const NULL_DEVICE =
  process.platform === 'win32'
    ? _isGitBash()
      ? '/dev/null'
      : 'NUL'
    : '/dev/null';

/**
 * Whether the current platform is Windows.
 */
const isWindows = process.platform === 'win32';

/**
 * Whether the current platform is macOS.
 */
const isMacOS = process.platform === 'darwin';

/**
 * Whether the current platform is Linux.
 */
const isLinux = process.platform === 'linux';

/**
 * Get the appropriate shell for the platform.
 * - Windows: 'cmd.exe' or 'powershell.exe'
 * - Unix: '/bin/sh' or '/bin/bash'
 */
function getShell() {
  if (isWindows) {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/sh';
}

/**
 * Quote a path for shell usage (handles spaces).
 * @param {string} filepath - The path to quote
 * @returns {string} - The quoted path
 */
function shellQuote(filepath) {
  if (isWindows) {
    // Windows: use double quotes, escape internal quotes
    return `"${filepath.replace(/"/g, '""')}"`;
  }
  // Unix: use single quotes, escape internal single quotes
  return `'${filepath.replace(/'/g, "'\\''")}'`;
}

/**
 * Suppress stderr in a shell command (cross-platform).
 * @param {string} command - The command to modify
 * @returns {string} - Command with stderr suppressed
 */
function suppressStderr(command) {
  return `${command} 2>${NULL_DEVICE}`;
}

/**
 * Suppress all output in a shell command (cross-platform).
 * @param {string} command - The command to modify
 * @returns {string} - Command with all output suppressed
 */
function suppressAllOutput(command) {
  return `${command} >${NULL_DEVICE} 2>&1`;
}

module.exports = {
  NULL_DEVICE,
  isWindows,
  isMacOS,
  isLinux,
  getShell,
  shellQuote,
  suppressStderr,
  suppressAllOutput,
};
