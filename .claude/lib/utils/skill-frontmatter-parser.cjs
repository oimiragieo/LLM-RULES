'use strict';

/**
 * SKILL.md Frontmatter Parser (H1)
 *
 * Extracts YAML-like frontmatter from SKILL.md files.
 * Frontmatter is enclosed in `---` delimiters at the top of the file.
 *
 * Supported field types:
 *   - Scalar strings:      key: value
 *   - Quoted strings:      key: "value with spaces"
 *   - Multi-line (|):      key: |\n  line1\n  line2
 *   - Multi-line (>):      key: >\n  folded line
 *   - Inline lists:        key: [a, b, c]
 *   - Block lists:         key:\n  - item1\n  - item2
 *
 * @module skill-frontmatter-parser
 */

/**
 * Parse YAML-like frontmatter from the content of a SKILL.md file.
 *
 * @param {string} content - Full text content of the skill file
 * @returns {{ [key: string]: string | string[] } | null}
 *   Parsed frontmatter as a plain object, or null if no valid frontmatter found.
 */
function parseSkillFrontmatter(content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return null;
  }

  // Must start with --- (possibly with leading whitespace on the first line)
  const lines = content.split(/\r?\n/);

  // Find opening ---
  let startLine = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].trim() === '---') {
      startLine = i;
      break;
    }
  }

  if (startLine === -1) {
    return null;
  }

  // Find closing ---
  let endLine = -1;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endLine = i;
      break;
    }
  }

  if (endLine === -1) {
    return null;
  }

  const frontmatterLines = lines.slice(startLine + 1, endLine);
  return parseFrontmatterLines(frontmatterLines);
}

/**
 * Parse an array of lines extracted from between the --- delimiters.
 *
 * @param {string[]} lines
 * @returns {{ [key: string]: string | string[] }}
 */
function parseFrontmatterLines(lines) {
  const result = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines and comment lines
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    // Key: value pair (scalar or start of block)
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1);
    const restTrimmed = rest.trim();

    if (!key) {
      i++;
      continue;
    }

    // Inline list: key: [a, b, c]
    if (restTrimmed.startsWith('[')) {
      result[key] = parseInlineList(restTrimmed);
      i++;
      continue;
    }

    // Block literal (|) or folded (>)
    if (restTrimmed === '|' || restTrimmed === '>') {
      const style = restTrimmed;
      const blockLines = [];
      i++;
      // Collect indented block lines
      while (i < lines.length && (lines[i].startsWith(' ') || lines[i].startsWith('\t'))) {
        blockLines.push(lines[i].replace(/^[ \t]{2}/, '')); // strip 2-space indent
        i++;
      }
      if (style === '>') {
        // Folded: join with spaces, preserve double newlines as single
        result[key] = blockLines.join(' ').replace(/  +/g, '\n').trim();
      } else {
        // Literal: preserve newlines
        result[key] = blockLines.join('\n').trim();
      }
      continue;
    }

    // Block list: key: (empty) followed by - items
    if (restTrimmed === '') {
      const items = [];
      i++;
      while (i < lines.length) {
        const itemLine = lines[i];
        const itemMatch = itemLine.match(/^[ \t]*-[ \t]+(.+)$/);
        if (itemMatch) {
          items.push(itemMatch[1].trim());
          i++;
        } else if (itemLine.trim() === '') {
          i++;
        } else {
          break;
        }
      }
      if (items.length > 0) {
        result[key] = items;
      } else {
        result[key] = '';
      }
      continue;
    }

    // Scalar value (possibly quoted)
    result[key] = unquote(restTrimmed);
    i++;
  }

  return result;
}

/**
 * Parse an inline YAML list: "[item1, item2, item3]"
 *
 * @param {string} str
 * @returns {string[]}
 */
function parseInlineList(str) {
  const inner = str.replace(/^\[/, '').replace(/\].*$/, '');
  return inner
    .split(',')
    .map(s => unquote(s.trim()))
    .filter(s => s.length > 0);
}

/**
 * Remove surrounding quotes from a scalar value.
 *
 * @param {string} str
 * @returns {string}
 */
function unquote(str) {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}

module.exports = {
  parseSkillFrontmatter,
};
