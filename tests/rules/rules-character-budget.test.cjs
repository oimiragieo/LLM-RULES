'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CLAUDE_MD = path.join(ROOT, '.claude', 'CLAUDE.md');
const RULES_DIR = path.join(ROOT, '.claude', 'rules');

// Files that were merged/deleted in previous milestones — must not exist
const DELETED_FILES = [
  'deviation-protocol.md',
  'sharp-edges.md',
  'shell-command-safety.md',
  'file-deletion-safety.md',
];

// Files that must still exist (untouched by merges)
const REQUIRED_FILES = [
  'cleanup-always.md',
  'code-standards.md',
  'documentation-always.md',
  'git-workflow.md',
  'plan-file-update.md',
  'task-tracking.md',
  'workspace-conventions.md',
  'deviation-rules.md',
  'safety-rules.md',
  'security.md',
  'agents.md',
  'hooks.md',
  'memory-protocol.md',
];

// Files with YAML frontmatter (must have valid --- delimiters and required keys)
const FRONTMATTER_FILES = [
  { file: 'hooks.md', keys: ['description', 'paths'] },
  { file: 'memory-protocol.md', keys: ['description', 'paths'] },
  { file: 'safety-rules.md', keys: ['description', 'globs'] },
];

function getAllRulesMdFiles() {
  return fs
    .readdirSync(RULES_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();
}

function getTotalCharCount() {
  const claudeMdLen = fs.readFileSync(CLAUDE_MD, 'utf8').length;
  const rulesFiles = getAllRulesMdFiles();
  let rulesTotal = 0;
  for (const f of rulesFiles) {
    rulesTotal += fs.readFileSync(path.join(RULES_DIR, f), 'utf8').length;
  }
  return { claudeMdLen, rulesTotal, total: claudeMdLen + rulesTotal, rulesFiles };
}

// ── VAL-RC-001: Total character budget ────────────────────────────────────────

test('Total CLAUDE.md + rules/ chars is under 40,000 (hard cap)', () => {
  const { total, claudeMdLen, rulesTotal } = getTotalCharCount();
  assert.ok(
    total < 40000,
    `Total ${total} chars exceeds 40,000 hard cap (CLAUDE.md: ${claudeMdLen}, rules: ${rulesTotal})`
  );
});

test('Total CLAUDE.md + rules/ chars is under 38,000 (target)', () => {
  const { total, claudeMdLen, rulesTotal } = getTotalCharCount();
  assert.ok(
    total < 38000,
    `Total ${total} chars exceeds 38,000 target (CLAUDE.md: ${claudeMdLen}, rules: ${rulesTotal})`
  );
});

// ── VAL-RC-006: No broken cross-references to deleted files ───────────────────

test('No references to deleted filenames in CLAUDE.md', () => {
  const content = fs.readFileSync(CLAUDE_MD, 'utf8');
  for (const deleted of DELETED_FILES) {
    assert.ok(!content.includes(deleted), `CLAUDE.md still references deleted file: ${deleted}`);
  }
});

test('No references to deleted filenames in rules files', () => {
  const rulesFiles = getAllRulesMdFiles();
  for (const f of rulesFiles) {
    const content = fs.readFileSync(path.join(RULES_DIR, f), 'utf8');
    for (const deleted of DELETED_FILES) {
      assert.ok(!content.includes(deleted), `${f} still references deleted file: ${deleted}`);
    }
  }
});

// ── VAL-RC-012: No rules files accidentally deleted ───────────────────────────

test('All required rules files still exist', () => {
  for (const required of REQUIRED_FILES) {
    const filePath = path.join(RULES_DIR, required);
    assert.ok(fs.existsSync(filePath), `Required rules file was accidentally deleted: ${required}`);
  }
});

test('Previously deleted files do not exist (merges completed)', () => {
  for (const deleted of DELETED_FILES) {
    const filePath = path.join(RULES_DIR, deleted);
    assert.ok(
      !fs.existsSync(filePath),
      `File should have been deleted in merge but still exists: ${deleted}`
    );
  }
});

// ── YAML frontmatter validation ───────────────────────────────────────────────

test('All rules files with expected YAML frontmatter have valid --- delimiters', () => {
  for (const { file, keys } of FRONTMATTER_FILES) {
    const filePath = path.join(RULES_DIR, file);
    assert.ok(fs.existsSync(filePath), `File missing: ${file}`);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.startsWith('---\n'), `${file}: frontmatter must start with ---`);
    const closingIndex = content.indexOf('\n---\n', 4);
    assert.ok(closingIndex > 0, `${file}: frontmatter closing --- not found`);
    const frontmatter = content.slice(4, closingIndex);
    for (const key of keys) {
      assert.ok(
        frontmatter.includes(`${key}:`),
        `${file}: frontmatter missing required key: ${key}`
      );
    }
  }
});

test('YAML frontmatter values are non-empty strings or arrays', () => {
  for (const { file, keys } of FRONTMATTER_FILES) {
    const filePath = path.join(RULES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const closingIndex = content.indexOf('\n---\n', 4);
    const frontmatter = content.slice(4, closingIndex);
    const lines = frontmatter.split('\n');
    for (const key of keys) {
      const keyLine = lines.find(l => l.startsWith(`${key}:`));
      assert.ok(keyLine !== undefined, `${file}: frontmatter key "${key}" not found`);
      // Key must have value on same line OR next lines (for block values)
      const afterColon = keyLine.slice(key.length + 1).trim();
      const hasInlineValue = afterColon.length > 0;
      const hasBlockValue = lines.some(
        (l, i) => lines[i - 1] === keyLine && l.trim().startsWith('-')
      );
      assert.ok(hasInlineValue || hasBlockValue, `${file}: frontmatter key "${key}" has no value`);
    }
  }
});

// ── Cross-reference integrity: rules files reference each other correctly ─────

test('Cross-references between rules files use existing filenames', () => {
  const existingFiles = new Set(getAllRulesMdFiles());
  const rulesFiles = getAllRulesMdFiles();
  // Only check explicit .claude/rules/ references, not general @-references
  const rulesRefPattern = /\.claude\/rules\/([a-z0-9-]+\.md)/g;

  for (const f of rulesFiles) {
    const content = fs.readFileSync(path.join(RULES_DIR, f), 'utf8');
    let match;
    while ((match = rulesRefPattern.exec(content)) !== null) {
      const referenced = match[1];
      assert.ok(
        existingFiles.has(referenced),
        `${f}: references non-existent rules file: ${referenced}`
      );
    }
  }
});
