'use strict';

/**
 * Tests for rules-merge-safety feature (VAL-RC-005)
 * Verifies that sharp-edges.md, shell-command-safety.md, and file-deletion-safety.md
 * have been merged into a single safety-rules.md containing all required content.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../');
const RULES_DIR = path.join(ROOT, '.claude', 'rules');
const MERGED_FILE = path.join(RULES_DIR, 'safety-rules.md');
const DELETED_FILES = [
  path.join(RULES_DIR, 'sharp-edges.md'),
  path.join(RULES_DIR, 'shell-command-safety.md'),
  path.join(RULES_DIR, 'file-deletion-safety.md'),
];

test('exactly one merged safety file exists and three originals are deleted', () => {
  assert.ok(fs.existsSync(MERGED_FILE), `Merged file must exist: ${MERGED_FILE}`);
  for (const deleted of DELETED_FILES) {
    assert.ok(!fs.existsSync(deleted), `Deleted file must NOT exist: ${deleted}`);
  }
});

test('merged file contains SE-01 through SE-07 identifiers', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  for (const id of ['SE-01', 'SE-02', 'SE-03', 'SE-04', 'SE-05', 'SE-06', 'SE-07']) {
    assert.ok(content.includes(id), `Merged file must contain ${id}`);
  }
});

test('merged file contains shell command safety rules', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(
    content.toLowerCase().includes('temp script') ||
      content.toLowerCase().includes('temp file') ||
      content.includes('.cjs'),
    'Merged file must contain temp script/file concept'
  );
  assert.ok(content.includes('timeout'), 'Merged file must contain timeout rule');
  assert.ok(
    content.toLowerCase().includes('one concern') ||
      content.toLowerCase().includes('single command') ||
      content.toLowerCase().includes('split them'),
    'Merged file must contain one-concern-per-command rule'
  );
});

test('merged file contains file deletion safety rules', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(
    content.toLowerCase().includes('untracked'),
    'Merged file must mention untracked files rule'
  );
  assert.ok(
    content.toLowerCase().includes('iron law') || content.toUpperCase().includes('IRON LAW'),
    'Merged file must contain IRON LAW designation'
  );
  assert.ok(
    content.toLowerCase().includes('git clean'),
    'Merged file must mention git clean is forbidden'
  );
});

test('merged file has valid YAML frontmatter (from shell-command-safety.md)', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(content.startsWith('---\n'), 'Merged file must start with YAML frontmatter delimiter');
  const endOfFrontmatter = content.indexOf('\n---\n', 4);
  assert.ok(endOfFrontmatter > 0, 'Merged file must have closing frontmatter delimiter');
  const frontmatter = content.slice(4, endOfFrontmatter);
  assert.ok(frontmatter.includes('description:'), 'Frontmatter must have description field');
  assert.ok(
    frontmatter.includes('globs:') || frontmatter.includes('alwaysApply:'),
    'Frontmatter must have globs or alwaysApply field'
  );
});

test('deleted filenames not referenced in .claude/rules/ or CLAUDE.md', () => {
  const filesToSearch = [
    path.join(ROOT, '.claude', 'CLAUDE.md'),
    ...fs
      .readdirSync(RULES_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(RULES_DIR, f)),
  ];
  const deletedNames = ['sharp-edges.md', 'shell-command-safety.md', 'file-deletion-safety.md'];
  for (const filePath of filesToSearch) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const deletedName of deletedNames) {
      assert.ok(
        !content.includes(deletedName),
        `Found reference to deleted file "${deletedName}" in: ${filePath}`
      );
    }
  }
});

test('merged file has valid markdown structure', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(content.length > 0, 'File must not be empty');
  assert.ok(/^#\s+/m.test(content), 'File must have at least one markdown heading');
});

test('merged file size is reasonable (less than 6000 chars)', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(content.length < 6000, `Merged file should be under 6000 chars, got ${content.length}`);
});
