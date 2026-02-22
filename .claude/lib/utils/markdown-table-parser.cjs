'use strict';
/**
 * Markdown Table Parser (Track 4.1)
 *
 * Simple | row parser for Markdown tables. No remark/unist dependency.
 * SE-01: Normalizes CRLF → LF before splitting to handle Windows line endings.
 *
 * API:
 *   parseMarkdownTable(markdown) → Array<Record<string,string>>
 *   extractTableRows(markdown)   → Array<string[]>
 *   findTableByHeader(markdown, headerName, opts?) → Array<Record<string,string>> | null
 */

/**
 * Split a Markdown string into lines, normalizing CRLF (SE-01).
 * @param {string} content
 * @returns {string[]}
 */
function splitLines(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');
}

/**
 * Determine whether a line is a Markdown table row (starts/ends with |, has 2+ cells).
 * @param {string} line
 * @returns {boolean}
 */
function isTableRow(line) {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.split('|').length >= 3;
}

/**
 * Determine whether a line is a separator row (|---|---|).
 * @param {string} line
 * @returns {boolean}
 */
function isSeparatorRow(line) {
  const t = line.trim();
  return isTableRow(t) && /^\|[\s|:-]+\|$/.test(t);
}

/**
 * Parse a | delimited row into an array of trimmed cell strings.
 * @param {string} line
 * @returns {string[]}
 */
function parseCells(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(cell => cell.trim());
}

/**
 * Extract raw data rows (as string arrays) from the first Markdown table found.
 * Skips the header row and separator rows.
 *
 * @param {string} markdown
 * @returns {string[][]}
 */
function extractTableRows(markdown) {
  const lines = splitLines(markdown);
  const rows = [];
  let headerFound = false;
  let separatorFound = false;
  let inFence = false;

  for (const line of lines) {
    if (/^[ \t]*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!isTableRow(line)) {
      // Reset if we leave the table region (blank line after data rows)
      if (rows.length > 0 && line.trim() === '') break;
      continue;
    }
    if (isSeparatorRow(line)) {
      if (headerFound) separatorFound = true;
      continue;
    }
    if (!headerFound) {
      headerFound = true;
      continue; // skip header row
    }
    if (!separatorFound) continue; // no separator yet → not a valid table
    rows.push(parseCells(line));
  }

  return rows;
}

/**
 * Parse the first Markdown table in the string into an array of objects
 * keyed by header column name.
 *
 * @param {string} markdown
 * @returns {Array<Record<string,string>>}
 */
function parseMarkdownTable(markdown) {
  const lines = splitLines(markdown);
  let headers = null;
  let separatorFound = false;
  const rows = [];
  let inFence = false;

  for (const line of lines) {
    if (/^[ \t]*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!isTableRow(line)) {
      if (headers !== null && separatorFound && line.trim() === '') break;
      continue;
    }
    if (isSeparatorRow(line)) {
      if (headers !== null) separatorFound = true;
      continue;
    }
    if (headers === null) {
      headers = parseCells(line);
      continue;
    }
    if (!separatorFound) continue;
    const cells = parseCells(line);
    const record = Object.create(null);
    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = cells[i] !== undefined ? cells[i] : '';
    }
    rows.push(record);
  }

  return rows;
}

/**
 * Find a specific Markdown table by searching for a matching header column name.
 * Returns the table rows as objects, or null if not found.
 *
 * @param {string} markdown
 * @param {string} headerName - The column header to search for
 * @param {{ caseSensitive?: boolean }} [opts]
 * @returns {Array<Record<string,string>> | null}
 */
function findTableByHeader(markdown, headerName, opts = {}) {
  const caseSensitive = opts.caseSensitive === true;
  const lines = splitLines(markdown);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!isTableRow(line)) {
      i++;
      continue;
    }

    // Try to parse this as a header row
    const cells = parseCells(line);
    const match = caseSensitive
      ? cells.some(c => c === headerName)
      : cells.some(c => c.toLowerCase() === headerName.toLowerCase());

    if (!match) {
      i++;
      continue;
    }

    // Found the header — now parse the full table starting here
    const tableLines = [];
    let j = i;
    // Collect lines that are table rows or separator rows
    while (j < lines.length && (isTableRow(lines[j]) || isSeparatorRow(lines[j]))) {
      tableLines.push(lines[j]);
      j++;
    }

    // Parse the collected block
    const tableContent = tableLines.join('\n');
    const result = parseMarkdownTable(tableContent);
    return result;
  }

  return null;
}

module.exports = {
  parseMarkdownTable,
  extractTableRows,
  findTableByHeader,
};
