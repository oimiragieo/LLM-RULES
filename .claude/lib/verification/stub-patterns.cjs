'use strict';

/**
 * Stub detection patterns for goal-backward verification.
 *
 * Detects common stub/placeholder markers in source code.
 * Skips .md files to avoid false positives on documentation.
 */

/**
 * Array of known stub patterns.
 * Each entry: { name: string, regex: RegExp }
 */
const STUB_PATTERNS = [
  {
    name: 'TODO',
    regex: /\/\/\s*TODO[:\s]/i,
  },
  {
    name: 'FIXME',
    regex: /\/\/\s*FIXME[:\s]/i,
  },
  {
    name: 'HACK',
    regex: /\/\/\s*HACK[:\s]/i,
  },
  {
    name: 'XXX',
    regex: /\/\/\s*XXX[:\s]/i,
  },
  {
    name: 'NOT_IMPLEMENTED',
    // Matches: throw new Error('not implemented') or throw new Error("Not Implemented")
    // Does NOT match legitimate error messages like "database connection failed"
    regex: /throw\s+new\s+\w*Error\s*\(\s*['"`][^'"`]*not\s+implemented[^'"`]*['"`]\s*\)/i,
  },
  {
    name: 'EMPTY_FUNCTION',
    // Matches: () => {} or function foo() {} — empty bodies only
    regex: /(?:=>\s*\{\s*\}|function\s+\w+\s*\([^)]*\)\s*\{\s*\})/,
  },
  {
    name: 'PLACEHOLDER_RETURN',
    // Matches: return 'placeholder' or return "placeholder"
    regex: /return\s+['"`]placeholder['"`]/i,
  },
];

// .md files are always excluded from stub detection (see isStub below)

/**
 * Returns true if the given line in the given file path matches any stub pattern.
 * Always returns false for .md files (documentation exclusion).
 *
 * @param {string} line - A single line of source code
 * @param {string} filePath - The file path (used to determine extension)
 * @returns {boolean}
 */
function isStub(line, filePath) {
  if (!line || !filePath) return false;

  // Normalize path separators (SE-01: Windows backslash paths)
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Extract extension
  const lastDot = normalizedPath.lastIndexOf('.');
  const ext = lastDot !== -1 ? normalizedPath.slice(lastDot).toLowerCase() : '';

  // Skip .md files — documentation always excluded
  if (ext === '.md') return false;

  // Only check recognized code extensions (default allow for unknown extensions)
  // Actually: check all non-.md files to be safe for .js .cjs .mjs etc.
  for (const pattern of STUB_PATTERNS) {
    if (pattern.regex.test(line)) {
      return true;
    }
  }

  return false;
}

module.exports = { STUB_PATTERNS, isStub };
