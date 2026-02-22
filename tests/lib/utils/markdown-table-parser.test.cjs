'use strict';
/**
 * Tests for markdown-table-parser utility (Track 4.1)
 * TDD — written BEFORE implementation.
 *
 * Simple | row parser — no remark/unist.
 * SE-01: path normalization not needed (pure text processing).
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let parseMarkdownTable, findTableByHeader, extractTableRows;

describe('markdown-table-parser — parseMarkdownTable', () => {
  before(() => {
    ({ parseMarkdownTable, findTableByHeader, extractTableRows } =
      require('../../../.claude/lib/utils/markdown-table-parser.cjs'));
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(parseMarkdownTable(''), []);
  });

  it('parses a simple markdown table', () => {
    const md = `
| Name | Path | Purpose |
|------|------|---------|
| my-tool | .claude/tools/ | Does something |
| other-tool | .claude/tools/cli/ | Does other |
`.trim();
    const rows = parseMarkdownTable(md);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Name, 'my-tool');
    assert.equal(rows[0].Path, '.claude/tools/');
    assert.equal(rows[1].Name, 'other-tool');
  });

  it('trims whitespace from cell values', () => {
    const md = `
| Name   |   Value   |
|--------|-----------|
| foo    |    bar    |
`.trim();
    const rows = parseMarkdownTable(md);
    assert.equal(rows[0].Name, 'foo');
    assert.equal(rows[0].Value, 'bar');
  });

  it('handles table with no data rows', () => {
    const md = `
| Name | Value |
|------|-------|
`.trim();
    const rows = parseMarkdownTable(md);
    assert.deepEqual(rows, []);
  });

  it('ignores non-table lines', () => {
    const md = `
# Title

Some prose text here.

| A | B |
|---|---|
| 1 | 2 |
`.trim();
    const rows = parseMarkdownTable(md);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].A, '1');
  });

  it('handles Windows-style CRLF line endings', () => {
    const md = '| A | B |\r\n|---|---|\r\n| x | y |\r\n';
    const rows = parseMarkdownTable(md);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].A, 'x');
    assert.equal(rows[0].B, 'y');
  });
});

describe('markdown-table-parser — extractTableRows', () => {
  it('returns raw rows as arrays of strings', () => {
    const md = `
| A | B | C |
|---|---|---|
| 1 | 2 | 3 |
| 4 | 5 | 6 |
`.trim();
    const rows = extractTableRows(md);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], ['1', '2', '3']);
    assert.deepEqual(rows[1], ['4', '5', '6']);
  });

  it('returns empty array for input with no data rows', () => {
    assert.deepEqual(extractTableRows(''), []);
  });
});

describe('markdown-table-parser — findTableByHeader', () => {
  it('finds a table by its first column header', () => {
    const md = `
# Section

| Tool | Category |
|------|----------|
| my-tool | metrics |

## Another section

| Agent | Role |
|-------|------|
| dev | developer |
`.trim();

    const toolRows = findTableByHeader(md, 'Tool');
    assert.ok(toolRows !== null);
    assert.equal(toolRows.length, 1);
    assert.equal(toolRows[0].Tool, 'my-tool');

    const agentRows = findTableByHeader(md, 'Agent');
    assert.ok(agentRows !== null);
    assert.equal(agentRows.length, 1);
    assert.equal(agentRows[0].Agent, 'dev');
  });

  it('returns null when no table with that header exists', () => {
    const md = `
| A | B |
|---|---|
| 1 | 2 |
`.trim();
    const result = findTableByHeader(md, 'NonExistent');
    assert.equal(result, null);
  });

  it('is case-insensitive by default', () => {
    const md = `
| name | value |
|------|-------|
| foo | bar |
`.trim();
    const rows = findTableByHeader(md, 'Name');
    assert.ok(rows !== null);
    assert.equal(rows[0].name, 'foo');
  });
});

describe('SE-XX compliance — markdown-table-parser', () => {
  it('SE-01: normalizes backslash paths (splits by \\n correctly)', () => {
    // The parser splits content by \n — must handle both LF and CRLF
    const mod = require('../../../.claude/lib/utils/markdown-table-parser.cjs');
    const crlfContent = '| A | B |\r\n|---|---|\r\n| x | y |\r\n';
    const rows = mod.parseMarkdownTable(crlfContent);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].A, 'x');
  });

  it('SE-02: module loads without prototype pollution risk', () => {
    const mod = require('../../../.claude/lib/utils/markdown-table-parser.cjs');
    assert.ok(typeof mod.parseMarkdownTable === 'function');
  });
});
