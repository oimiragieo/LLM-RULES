'use strict';

/**
 * prompt-assembler-context.cjs
 * =============================
 *
 * Loads .claude/context/project-context.md and formats it for injection
 * into agent spawn prompts.
 *
 * Features:
 * - Reads .claude/context/project-context.md relative to projectRoot
 * - Strips YAML frontmatter (--- ... ---) before injection
 * - Truncates content to charLimit (default 2048 chars) with [truncated] marker
 * - Respects PROJECT_CONTEXT_INJECTION=off env var
 * - Respects PROJECT_CONTEXT_CHAR_LIMIT env var for default limit
 * - Returns '' (empty string) on any error or when disabled
 * - SE-01: normalizes Windows backslash paths via path.join
 *
 * @module prompt-assembler-context
 */

const fs = require('fs');
const path = require('path');

/** Default character limit for injected context content */
const DEFAULT_CHAR_LIMIT = 2048;

/** Section header prepended to the context content */
const SECTION_HEADER = '## Project Context\n\n';

/** Truncation marker appended when content is cut */
const TRUNCATION_MARKER = '[truncated]';

/**
 * Strips YAML frontmatter from markdown content.
 *
 * YAML frontmatter is a block delimited by `---` at the very start of the file.
 * The delimiter must appear on its own line.
 *
 * @param {string} content - Raw file content
 * @returns {string} Content with frontmatter removed and leading/trailing whitespace trimmed
 */
function stripFrontmatter(content) {
  // Frontmatter starts with --- at the beginning of the string (optional BOM/whitespace handled by trim)
  const trimmed = content.replace(/^\uFEFF/, ''); // strip BOM if present
  const frontmatterPattern = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
  const stripped = trimmed.replace(frontmatterPattern, '');
  return stripped.trim();
}

/**
 * Loads and formats the project context file for spawn prompt injection.
 *
 * The function reads `.claude/context/project-context.md` from the given
 * projectRoot, strips frontmatter, truncates to the char limit, and wraps
 * the result in a `## Project Context` section header.
 *
 * Returns an empty string ('') when:
 * - PROJECT_CONTEXT_INJECTION env var is set to 'off'
 * - The file does not exist
 * - The file is empty (after stripping frontmatter and whitespace)
 * - Any read/parse error occurs
 *
 * @param {object} [options={}] - Options
 * @param {string} [options.projectRoot=process.cwd()] - Root directory of the project
 * @param {number} [options.charLimit] - Character limit for content (default: PROJECT_CONTEXT_CHAR_LIMIT env or 2048)
 * @returns {string} Formatted project context section, or '' if disabled/unavailable
 */
function loadProjectContext(options) {
  options = options || {};

  // Check if injection is disabled
  const injectionEnv = process.env.PROJECT_CONTEXT_INJECTION;
  if (injectionEnv && injectionEnv.trim().toLowerCase() === 'off') {
    return '';
  }

  // Resolve char limit: explicit option > env var > default
  let charLimit;
  if (typeof options.charLimit === 'number') {
    charLimit = options.charLimit;
  } else {
    const envLimit = process.env.PROJECT_CONTEXT_CHAR_LIMIT;
    charLimit = envLimit ? parseInt(envLimit, 10) : DEFAULT_CHAR_LIMIT;
    if (!Number.isFinite(charLimit) || charLimit <= 0) {
      charLimit = DEFAULT_CHAR_LIMIT;
    }
  }

  // Resolve the project root and file path (SE-01: use path.join for Windows compat)
  const projectRoot = options.projectRoot || process.cwd();
  const contextFilePath = path.join(projectRoot, '.claude', 'context', 'project-context.md');

  let rawContent;
  try {
    rawContent = fs.readFileSync(contextFilePath, 'utf-8');
  } catch (_err) {
    // File not found or unreadable — return empty string (graceful degradation)
    return '';
  }

  // Strip YAML frontmatter
  const content = stripFrontmatter(rawContent);

  // Empty content yields empty string (no header added for empty files)
  if (!content) {
    return '';
  }

  // Truncate if needed
  let truncated = content;
  if (content.length > charLimit) {
    truncated = content.slice(0, charLimit) + TRUNCATION_MARKER;
  }

  return SECTION_HEADER + truncated;
}

module.exports = { loadProjectContext };
