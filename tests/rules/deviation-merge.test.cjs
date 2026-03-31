'use strict';

/**
 * Tests for rules-merge-deviations feature (VAL-RC-004)
 * Verifies that deviation-protocol.md and deviation-rules.md have been
 * merged into a single deviation-rules.md containing all required content.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../');
const RULES_DIR = path.join(ROOT, '.claude', 'rules');
const MERGED_FILE = path.join(RULES_DIR, 'deviation-rules.md');
const DELETED_FILE = path.join(RULES_DIR, 'deviation-protocol.md');

test('exactly one deviation file exists (deviation-rules.md)', () => {
  assert.ok(fs.existsSync(MERGED_FILE), `Merged file must exist: ${MERGED_FILE}`);
  assert.ok(!fs.existsSync(DELETED_FILE), `Deleted file must NOT exist: ${DELETED_FILE}`);
});

test('merged file contains DR-1 through DR-4 rule identifiers', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  for (const rule of ['DR-1', 'DR-2', 'DR-3', 'DR-4']) {
    assert.ok(content.includes(rule), `Merged file must contain ${rule}`);
  }
});

test('merged file contains Decision Tree section', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(content.includes('Decision Tree'), 'Merged file must contain a Decision Tree section');
});

test('merged file contains Anti-Patterns section', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(
    content.includes('Anti-Pattern') || content.includes('Anti-pattern'),
    'Merged file must contain an Anti-Patterns section'
  );
});

test('merged file contains all Related References from both source files', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  const requiredRefs = [
    'session-gap-log.jsonl',
    'cleanup-always.md',
    'plan-file-update.md',
    'decisions.md',
    'reflection-agent.md',
  ];
  for (const ref of requiredRefs) {
    assert.ok(content.includes(ref), `Merged file must reference: ${ref}`);
  }
});

test('merged file contains STOP escalation instruction', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(content.includes('STOP'), 'Merged file must contain STOP escalation instruction');
  assert.ok(
    content.toLowerCase().includes('escalate'),
    'Merged file must contain escalation instruction'
  );
});

test('deviation-protocol.md is not referenced in .claude/rules/ or CLAUDE.md', () => {
  const filesToSearch = [
    path.join(ROOT, '.claude', 'CLAUDE.md'),
    ...fs
      .readdirSync(RULES_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(RULES_DIR, f)),
  ];
  for (const filePath of filesToSearch) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(
      !content.includes('deviation-protocol.md'),
      `Found reference to deleted file deviation-protocol.md in: ${filePath}`
    );
  }
});

test('merged file has valid markdown structure', () => {
  const content = fs.readFileSync(MERGED_FILE, 'utf8');
  assert.ok(content.length > 0, 'File must not be empty');
  assert.ok(/^#\s+/m.test(content), 'File must have at least one markdown heading');
});
