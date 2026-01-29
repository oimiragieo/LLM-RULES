#!/usr/bin/env node
'use strict';

/**
 * File Path Guard Hook
 * Prevents agents from writing files with absolute paths or malformed names
 * Blocks common AI slop patterns
 *
 * @hook PreToolUse(Write, Edit)
 * @enforcement block
 * @override FILE_PATH_GUARD=warn|off
 */

const { readFileSync } = require('fs');

// AI slop patterns to detect
const AI_SLOP_PATTERNS = [
  /^C:/i, // Windows absolute path start (case-insensitive)
  /^[A-Z]:/i, // Any drive letter
  /devprojectsagent-studio/i, // Concatenated path
  /C\\357\\200\\272/, // URL-encoded colon
];

// Valid relative path patterns
const VALID_RELATIVE_PATTERNS = [
  /^\.claude\//,
  /^src\//,
  /^tests?\//,
  /^\.github\//,
  /^\.\//,
  /^[^/\\]+\./, // Files in current directory (e.g., package.json)
];

/**
 * Parse hook input from stdin
 */
function parseHookInput() {
  try {
    const input = readFileSync(0, 'utf-8');
    return JSON.parse(input);
  } catch (error) {
    console.error('[FILE-PATH-GUARD] Failed to parse hook input:', error.message);
    process.exit(1); // Block on parse error
  }
}

/**
 * Check if path is a valid relative path
 */
function isValidRelativePath(filePath) {
  // Check for valid relative patterns
  for (const pattern of VALID_RELATIVE_PATTERNS) {
    if (pattern.test(filePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if path contains AI slop patterns
 */
function containsAISlopPattern(filePath) {
  for (const pattern of AI_SLOP_PATTERNS) {
    if (pattern.test(filePath)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Check if path is an absolute path
 */
function isAbsolutePath(filePath) {
  // Windows absolute: C:\... or C:/...
  if (/^[A-Z]:[/\\]/i.test(filePath)) {
    return true;
  }
  // Unix absolute: /...
  if (filePath.startsWith('/') && !filePath.startsWith('./')) {
    return true;
  }
  return false;
}

/**
 * Main validation logic
 */
function validate() {
  const input = parseHookInput();
  const { tool, parameters } = input;

  // Only check Write/Edit tools
  if (tool !== 'Write' && tool !== 'Edit') {
    process.exit(0); // Allow
  }

  const filePath = parameters?.file_path || parameters?.filePath || '';

  if (!filePath) {
    console.error('[FILE-PATH-GUARD] BLOCKED: No file path provided');
    process.exit(1); // Block
  }

  // Check for AI slop patterns
  const slopPattern = containsAISlopPattern(filePath);
  if (slopPattern) {
    console.error(`[FILE-PATH-GUARD] BLOCKED: AI slop pattern detected in path: ${filePath}`);
    console.error(`[FILE-PATH-GUARD] Pattern matched: ${slopPattern}`);
    console.error(`[FILE-PATH-GUARD] Use relative paths from PROJECT_ROOT instead.`);
    console.error(`[FILE-PATH-GUARD] Example: .claude/context/artifacts/file.txt`);
    process.exit(1); // Block
  }

  // Check for absolute paths
  if (isAbsolutePath(filePath)) {
    console.error(`[FILE-PATH-GUARD] BLOCKED: Absolute path detected: ${filePath}`);
    console.error(`[FILE-PATH-GUARD] Use relative paths from PROJECT_ROOT.`);
    console.error(`[FILE-PATH-GUARD] Example: .claude/context/artifacts/file.txt`);
    process.exit(1); // Block
  }

  // Check for valid relative path patterns
  if (!isValidRelativePath(filePath)) {
    console.error(`[FILE-PATH-GUARD] WARNING: Path may be outside PROJECT_ROOT: ${filePath}`);
    console.error(`[FILE-PATH-GUARD] Ensure path starts with .claude/, src/, tests/, or other known directories`);
    // Allow but warn (could be legitimate)
  }

  process.exit(0); // Allow
}

// Run validation
validate();
