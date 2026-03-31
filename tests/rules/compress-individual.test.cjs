'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', '..', '.claude');
const RULES = path.join(BASE, 'rules');

function readRule(name) {
  return fs.readFileSync(path.join(RULES, name), 'utf8');
}

// VAL-RC-009: security.md compressed retaining core concepts
test('security.md is under 4600 chars', () => {
  const content = readRule('security.md');
  assert.ok(content.length < 4600, `security.md is ${content.length} chars, expected < 4600`);
});

test('security.md retains shell:false rule', () => {
  const content = readRule('security.md');
  assert.ok(
    /shell.*false|shell: false/i.test(content),
    'security.md must contain shell:false reference'
  );
});

test('security.md retains safeParseJSON reference', () => {
  const content = readRule('security.md');
  assert.ok(/safeParseJSON/i.test(content), 'security.md must contain safeParseJSON reference');
});

test('security.md retains ASI01 reference', () => {
  const content = readRule('security.md');
  assert.ok(/ASI01/i.test(content), 'security.md must contain ASI01 reference');
});

test('security.md retains ASI02 reference', () => {
  const content = readRule('security.md');
  assert.ok(/ASI02/i.test(content), 'security.md must contain ASI02 reference');
});

test('security.md retains ASI06 reference', () => {
  const content = readRule('security.md');
  assert.ok(/ASI06/i.test(content), 'security.md must contain ASI06 reference');
});

test('security.md retains prompt injection concept', () => {
  const content = readRule('security.md');
  assert.ok(
    /prompt injection/i.test(content),
    'security.md must contain prompt injection reference'
  );
});

test('security.md retains memory poisoning concept', () => {
  const content = readRule('security.md');
  assert.ok(
    /memory poisoning/i.test(content),
    'security.md must contain memory poisoning reference'
  );
});

test('security.md retains least privilege concept', () => {
  const content = readRule('security.md');
  assert.ok(/least privilege/i.test(content), 'security.md must contain least privilege reference');
});

// VAL-RC-011: memory-protocol.md compressed retaining architecture
test('memory-protocol.md is under 4325 chars', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(
    content.length < 4325,
    `memory-protocol.md is ${content.length} chars, expected < 4325`
  );
});

test('memory-protocol.md retains STM reference', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(/STM/i.test(content), 'memory-protocol.md must contain STM reference');
});

test('memory-protocol.md retains MTM reference', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(/MTM/i.test(content), 'memory-protocol.md must contain MTM reference');
});

test('memory-protocol.md retains LTM reference', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(/LTM/i.test(content), 'memory-protocol.md must contain LTM reference');
});

test('memory-protocol.md retains rotation concept', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(/rotation|rotated/i.test(content), 'memory-protocol.md must contain rotation concept');
});

test('memory-protocol.md retains named memory API', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(
    /named.*memory|readMemory|writeMemory/i.test(content),
    'memory-protocol.md must contain named memory API reference'
  );
});

test('memory-protocol.md retains gotchas/patterns/discoveries API', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(
    /recordGotcha|recordPattern|recordDiscovery/i.test(content),
    'memory-protocol.md must contain structured memory API'
  );
});

test('memory-protocol.md retains budget thresholds', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(
    /threshold|LEARNINGS_ARCHIVE_THRESHOLD_KB|DECISIONS_WARN_THRESHOLD_KB/i.test(content),
    'memory-protocol.md must contain budget threshold reference'
  );
});

// VAL-RC-008: memory-protocol.md has valid paths frontmatter
test('memory-protocol.md has valid YAML frontmatter', () => {
  const content = readRule('memory-protocol.md');
  assert.ok(content.startsWith('---\n'), 'memory-protocol.md must start with --- YAML frontmatter');
  const endOfFrontmatter = content.indexOf('\n---\n', 4);
  assert.ok(endOfFrontmatter !== -1, 'memory-protocol.md must have closing --- frontmatter');
  const frontmatter = content.slice(4, endOfFrontmatter);
  assert.ok(
    /paths:|globs:/i.test(frontmatter),
    'memory-protocol.md frontmatter must contain paths: or globs: key'
  );
  assert.ok(
    /memory/i.test(frontmatter),
    'memory-protocol.md frontmatter paths must reference memory'
  );
});

// VAL-RC-010: agents.md compressed retaining routing tables
test('agents.md is under 3440 chars', () => {
  const content = readRule('agents.md');
  assert.ok(content.length < 3440, `agents.md is ${content.length} chars, expected < 3440`);
});

test('agents.md retains core agents table', () => {
  const content = readRule('agents.md');
  assert.ok(
    /router.*Route|planner.*plann|developer.*implement/i.test(content),
    'agents.md must contain core agents table'
  );
});

test('agents.md retains Specialist-First Routing Law', () => {
  const content = readRule('agents.md');
  assert.ok(
    /Specialist-First Routing Law|IRON LAW/i.test(content),
    'agents.md must contain Specialist-First Routing Law'
  );
});

test('agents.md retains common misrouting table', () => {
  const content = readRule('agents.md');
  assert.ok(
    /WRONG.*CORRECT|developer.*technical-writer/i.test(content),
    'agents.md must contain Common Misrouting table'
  );
});

test('agents.md retains Self-Check Gates', () => {
  const content = readRule('agents.md');
  assert.ok(
    /Self-Check Gates|Router Self-Check/i.test(content),
    'agents.md must contain Self-Check Gates'
  );
});

// VAL-RC-007: hooks.md has valid paths frontmatter
test('hooks.md has valid YAML frontmatter with paths scoped to hooks directory', () => {
  const content = readRule('hooks.md');
  assert.ok(content.startsWith('---\n'), 'hooks.md must start with --- YAML frontmatter');
  const endOfFrontmatter = content.indexOf('\n---\n', 4);
  assert.ok(endOfFrontmatter !== -1, 'hooks.md must have closing --- frontmatter');
  const frontmatter = content.slice(4, endOfFrontmatter);
  assert.ok(
    /paths:|globs:/i.test(frontmatter),
    'hooks.md frontmatter must contain paths: or globs: key'
  );
  assert.ok(
    /hooks/i.test(frontmatter),
    'hooks.md frontmatter paths must reference hooks directory'
  );
});

// VAL-RC-012: Untouched files still exist
const UNTOUCHED_FILES = [
  'cleanup-always.md',
  'code-standards.md',
  'documentation-always.md',
  'git-workflow.md',
  'plan-file-update.md',
  'task-tracking.md',
  'workspace-conventions.md',
];

for (const filename of UNTOUCHED_FILES) {
  test(`untouched file exists: ${filename}`, () => {
    const filePath = path.join(RULES, filename);
    assert.ok(fs.existsSync(filePath), `Expected file to exist: ${filename}`);
  });
}
