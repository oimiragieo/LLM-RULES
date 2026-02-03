#!/usr/bin/env node
/**
 * Memory File Formatter Hook
 *
 * Runs on PostToolUse to format memory files after they're written.
 * Ensures consistent formatting across all memory files.
 *
 * Trigger: PostToolUse (after Edit/Write to memory files)
 *
 * PERF-006: Uses shared hook-input utility to eliminate code duplication.
 * PERF-007: Uses shared project-root utility to eliminate findProjectRoot duplication.
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// PERF-006/PERF-007: Use shared utilities instead of duplicated code
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');
const {
  parseHookInputSync,
  getToolName,
  getToolInput,
  extractFilePath,
  auditLog,
  debugLog,
} = require('../../lib/utils/hook-input.cjs');
const eventBus = require('../../lib/events/event-bus.cjs');
const { EventTypes } = require('../../lib/events/event-types.cjs');

// Memory paths to watch
const MEMORY_PATHS = ['.claude/context/memory', '.claude/context/reports', '.claude/context/plans'];

// PERF-006: parseHookInput is now imported from hook-input.cjs
// Alias for backward compatibility
const parseHookInput = parseHookInputSync;

/**
 * Check if file is in a memory directory
 */
function isMemoryFile(filePath) {
  if (!filePath) return false;

  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');

  return MEMORY_PATHS.some(memPath => {
    const fullMemPath = path.join(PROJECT_ROOT, memPath).replace(/\\/g, '/');
    return normalizedPath.startsWith(fullMemPath) || normalizedPath.includes(memPath);
  });
}

/**
 * Check if file is a markdown file
 */
function isMarkdownFile(filePath) {
  return filePath && filePath.endsWith('.md');
}

/**
 * SEC-009 FIX: Sanitize file path to prevent command injection
 * Only allows alphanumeric, hyphens, underscores, dots, and path separators
 * @param {string} filePath - File path to validate
 * @returns {boolean} True if path is safe
 */
function isPathSafe(filePath) {
  // Reject paths with dangerous characters that could enable injection
  // Allow: alphanumeric, hyphens, underscores, dots, colons (drive letters), slashes
  const safePattern = /^[a-zA-Z0-9_\-.\\/:\s]+$/;
  if (!safePattern.test(filePath)) {
    return false;
  }

  // Reject paths with shell metacharacters
  const dangerousChars = [
    '$',
    '`',
    '|',
    '&',
    ';',
    '(',
    ')',
    '<',
    '>',
    '!',
    '*',
    '?',
    '[',
    ']',
    '{',
    '}',
    '"',
    "'",
    '\n',
    '\r',
  ];
  return !dangerousChars.some(char => filePath.includes(char));
}

/**
 * Format file using pnpm format or prettier directly
 * SEC-009 FIX: Uses spawnSync with array args to prevent command injection
 */
function formatFile(filePath) {
  // SEC-009 FIX: Validate file path before use
  if (!isPathSafe(filePath)) {
    debugLog('format-memory', 'Rejected unsafe file path', new Error(filePath));
    return false;
  }

  try {
    // SEC-009 FIX: Use spawnSync with array args instead of string interpolation
    // This prevents command injection via shell metacharacters
    const pnpmResult = spawnSync('pnpm', ['format', filePath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 10000,
      shell: false, // CRITICAL: Disable shell to prevent injection
    });

    if (pnpmResult.status === 0) {
      return true;
    }

    // pnpm format failed, try prettier directly
    const prettierResult = spawnSync('npx', ['prettier', '--write', filePath], {
      cwd: PROJECT_ROOT,
      stdio: 'pipe',
      timeout: 10000,
      shell: false, // CRITICAL: Disable shell to prevent injection
    });

    if (prettierResult.status === 0) {
      return true;
    }

    // Prettier also failed, skip formatting
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  const startTime = Date.now();
  let output = null;
  // PERF-006: Use shared utility for parsing
  const input = parseHookInputSync();
  if (!input) {
    process.exit(0);
  }

  // PERF-006: Get tool info using shared utilities
  const toolName = getToolName(input);
  const toolInput = getToolInput(input);

  // Only process Edit/Write tools
  if (toolName !== 'Edit' && toolName !== 'Write') {
    process.exit(0);
  }

  // PERF-006: Get file path using shared utility
  const filePath = extractFilePath(toolInput);
  if (!filePath) {
    process.exit(0);
  }

  // Check if it's a memory markdown file
  if (!isMemoryFile(filePath) || !isMarkdownFile(filePath)) {
    process.exit(0);
  }

  // Format the file
  const formatted = formatFile(filePath);
  if (formatted) {
    const fileName = path.basename(filePath);
    auditLog('format-memory', 'formatted', { file: fileName });
  }
  output = {
    file: filePath,
    formatted,
    toolName,
  };

  try {
    // Best-effort: no await to avoid blocking hook execution
    eventBus.emit(EventTypes.TOOL_COMPLETED, {
      type: EventTypes.TOOL_COMPLETED,
      timestamp: new Date().toISOString(),
      toolName: 'format-memory',
      output,
      duration: Date.now() - startTime,
    });
  } catch (_e) {
    // Best-effort
  }

  if (!formatted) {
    try {
      eventBus.emit(EventTypes.TOOL_FAILED, {
        type: EventTypes.TOOL_FAILED,
        timestamp: new Date().toISOString(),
        toolName: 'format-memory',
        error: 'formatting_failed',
      });
    } catch (_e) {
      // Best-effort
    }
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main, parseHookInput };
