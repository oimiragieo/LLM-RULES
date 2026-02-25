'use strict';

/**
 * Hook: post-edit-scanner.cjs
 * Event: PostToolUse (Edit) — non-blocking, always exit 0
 * Purpose: Scan edited files for console.log, TODOs, and hardcoded secrets
 *
 * Protocol:
 * - Input: JSON via stdin (PostToolUse Edit result)
 * - Output: Original JSON to stdout (passthrough, non-blocking)
 * - Warnings: stderr (issues found)
 * - Exit: Always 0 (non-blocking)
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

// Scan rules configuration
const SCAN_RULES = [
  {
    name: 'console.log',
    pattern: /console\.(log|debug|info)\s*\(/,
    exclude: /^\s*(\/\/|\/\*|\*)/, // skip comments
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
    message: 'console.log() detected - remove before committing',
  },
  {
    name: 'print()',
    pattern: /\bprint\s*\(/,
    exclude: /^\s*#/, // skip Python comments
    extensions: ['.py'],
    message: 'print() detected - use logging instead',
  },
  {
    name: 'TODO/FIXME',
    pattern: /\b(TODO|FIXME|XXX|HACK)\b/i,
    exclude: null, // always report
    extensions: null, // all files
    message: 'TODO/FIXME marker found - address or create task',
  },
  {
    name: 'hardcoded-secret',
    pattern: /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/i,
    exclude: /^\s*(\/\/|#|\/\*|\*)/, // skip comments
    extensions: null, // all files
    message: 'Possible hardcoded secret detected',
  },
];

// Binary file extensions to skip
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.db',
  '.sqlite',
  '.lance',
]);

const MAX_ISSUES = 5;
const MAX_LINES = 500;

/** Max bytes for hook stdout response to avoid host JSON parse truncation. */
const MAX_PASSTHROUGH_BYTES = Number(process.env.POST_EDIT_SCANNER_MAX_PASSTHROUGH_BYTES || 150000);
const TRUNCATED_PLACEHOLDER = '[truncated for hook response]';

/**
 * Recursively trim large string values in obj so JSON.stringify stays under size limit.
 * Preserves structure; replaces long strings with a short placeholder.
 */
function trimLargeStrings(obj, maxLength = 2000) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => trimLargeStrings(item, maxLength));
  }
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      out[key] = value.length > maxLength ? TRUNCATED_PLACEHOLDER : value;
    } else {
      out[key] = trimLargeStrings(value, maxLength);
    }
  }
  return out;
}

/**
 * Main hook logic
 */
function main() {
  try {
    // Read stdin
    const chunks = [];
    const stdin = process.stdin;
    stdin.setEncoding('utf8');

    stdin.on('data', chunk => chunks.push(chunk));
    stdin.on('end', () => {
      try {
        const input = chunks.join('');
        const data = safeParseJSON(input, 'edit-result');
        if (!data || Object.keys(data).length === 0) {
          process.stdout.write(input);
          process.exit(0);
          return;
        }

        // Extract file path
        const filePath = data.tool_result?.file_path || data.tool_input?.file_path;

        if (!filePath) {
          // No file path - nothing to scan, passthrough
          process.stdout.write(input);
          process.exit(0);
          return;
        }

        // Check if file exists
        if (!fs.existsSync(filePath)) {
          // File doesn't exist - passthrough silently
          process.stdout.write(input);
          process.exit(0);
          return;
        }

        // Check if binary file
        const ext = path.extname(filePath).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          // Binary file - skip scan, passthrough
          process.stdout.write(input);
          process.exit(0);
          return;
        }

        // Scan file
        const issues = scanFile(filePath);

        // Report issues to stderr if found
        if (issues.length > 0) {
          const displayPath = filePath.replace(/\\/g, '/');
          process.stderr.write(
            `\n[Post-Edit Scanner] ${issues.length} issue(s) in ${displayPath}:\n`
          );

          for (const issue of issues) {
            process.stderr.write(`  Line ${issue.line}: ${issue.message}\n`);
          }

          process.stderr.write('\n');
        }

        // Passthrough: if payload is small enough, use original; otherwise trim large
        // fields to avoid host JSON parse truncation (Unterminated string).
        const inputBytes = Buffer.byteLength(input, 'utf8');
        if (inputBytes <= MAX_PASSTHROUGH_BYTES) {
          process.stdout.write(input);
        } else {
          const trimmed = trimLargeStrings(data, 500);
          process.stdout.write(JSON.stringify(trimmed));
        }
        process.exit(0);
      } catch (_error) {
        // Parse error or other error - fail open (passthrough)
        process.stdout.write(chunks.join(''));
        process.exit(0);
      }
    });
  } catch (_error) {
    // Top-level error - fail open
    process.exit(0);
  }
}

/**
 * Scan file for issues
 */
function scanFile(filePath) {
  const issues = [];
  const ext = path.extname(filePath).toLowerCase();

  try {
    // Read file (max 500 lines for performance)
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').slice(0, MAX_LINES);

    // Scan each line
    for (let i = 0; i < lines.length && issues.length < MAX_ISSUES; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check each rule
      for (const rule of SCAN_RULES) {
        // Check if rule applies to this file extension
        if (rule.extensions && !rule.extensions.includes(ext)) {
          continue;
        }

        // Check if line matches pattern
        if (!rule.pattern.test(line)) {
          continue;
        }

        // Check if line should be excluded (e.g., comment)
        if (rule.exclude && rule.exclude.test(line)) {
          continue;
        }

        // Issue found
        issues.push({
          line: lineNum,
          rule: rule.name,
          message: rule.message,
        });

        break; // One issue per line
      }
    }
  } catch (_error) {
    // File read error - silently skip
    return [];
  }

  return issues;
}

// Run main
main();
