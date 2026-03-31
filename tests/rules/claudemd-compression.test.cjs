'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CLAUDE_MD = path.join(ROOT, '.claude', 'CLAUDE.md');
const DOCS_DIR = path.join(ROOT, '.claude', 'docs');

test('CLAUDE.md is between 6500 and 7500 characters', () => {
  const content = fs.readFileSync(CLAUDE_MD, 'utf8');
  assert.ok(
    content.length >= 6500,
    `Too short: ${content.length} chars (need >= 6500)`
  );
  assert.ok(
    content.length <= 7500,
    `Too long: ${content.length} chars (need <= 7500)`
  );
});

test('All router-critical section anchors are present', () => {
  const content = fs.readFileSync(CLAUDE_MD, 'utf8');
  const anchors = [
    'TOOL LOCKDOWN',
    'OUTPUT CONTRACT',
    'PRIME DIRECTIVE',
    'SELF-CHECK GATES',
    'ROUTING TABLE',
    'KEY REFERENCES',
    'MEMORY',
    'SKILL INVOCATION',
  ];
  for (const anchor of anchors) {
    assert.ok(content.includes(anchor), `Missing section anchor: "${anchor}"`);
  }
});

test('At least 3 IRON LAW markers are present', () => {
  const content = fs.readFileSync(CLAUDE_MD, 'utf8');
  const matches = content.match(/IRON LAW/g) || [];
  assert.ok(
    matches.length >= 3,
    `Only ${matches.length} IRON LAW markers found (need >= 3)`
  );
});

test('All @FILENAME.md references resolve to existing files in .claude/docs/', () => {
  const content = fs.readFileSync(CLAUDE_MD, 'utf8');
  // Match @UPPERCASE_FILENAME.md patterns (not lowercase like @agents.md)
  const refs = content.match(/@[A-Z][A-Z0-9_]+\.md/g) || [];
  const uniqueRefs = [...new Set(refs)];
  assert.ok(uniqueRefs.length > 0, 'No @FILENAME.md references found in CLAUDE.md');
  for (const ref of uniqueRefs) {
    const filePath = path.join(DOCS_DIR, ref);
    assert.ok(
      fs.existsSync(filePath),
      `@-reference does not resolve to existing file: ${ref} → ${filePath}`
    );
  }
});

test('CLAUDE.md file is valid UTF-8 and non-empty', () => {
  const content = fs.readFileSync(CLAUDE_MD, 'utf8');
  assert.ok(content.length > 0, 'File is empty');
  // Should have at least one markdown heading
  assert.ok(content.includes('#'), 'No markdown headings found');
});

// NOTE: VAL-RC-001 (total CLAUDE.md + rules < 40000) is validated cross-milestone
// after all rules-compression features complete (deviation merge, safety merge,
// security/memory/agents compression). Not tested here — only CLAUDE.md is in scope.
