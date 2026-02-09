/**
 * @file rule-structure-validator.test.cjs
 * @description Tests for skill rule structure validation hook
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import validator
const {
  preToolUse,
  validateRuleStructure,
  parseSections,
} = require('../../.claude/hooks/skills/rule-structure-validator.cjs');

test('parseSections - extracts markdown sections', () => {
  const content = `## Problem

Description of problem

## Why

Why this matters

## Wrong

Bad example

## Right

Good example

## Impact

Impact description`;

  const sections = parseSections(content);
  assert.ok(sections.includes('Problem'));
  assert.ok(sections.includes('Why'));
  assert.ok(sections.includes('Wrong'));
  assert.ok(sections.includes('Right'));
  assert.ok(sections.includes('Impact'));
});

test('validateRuleStructure - valid rule passes', () => {
  const tempFile = path.join(os.tmpdir(), 'valid-rule.md');
  const content = `---
title: Test Rule
impact: HIGH
tags: test, example
---

## Test Rule

## Explanation

This is a test rule.

## Wrong

\`\`\`typescript
const bad = "example";
\`\`\`

## Right

\`\`\`typescript
const good = "example";
\`\`\`

## Impact

High impact on performance.`;

  fs.writeFileSync(tempFile, content);
  const result = validateRuleStructure(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('validateRuleStructure - detects missing frontmatter', () => {
  const tempFile = path.join(os.tmpdir(), 'no-frontmatter.md');
  const content = `## Test Rule

## Explanation

Content`;

  fs.writeFileSync(tempFile, content);
  const result = validateRuleStructure(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('frontmatter')));
});

test('validateRuleStructure - detects missing title heading', () => {
  const tempFile = path.join(os.tmpdir(), 'no-title.md');
  const content = `---
title: Test Rule
impact: HIGH
---

## Explanation

Content`;

  fs.writeFileSync(tempFile, content);
  const result = validateRuleStructure(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('title heading')));
});

test('validateRuleStructure - detects missing Explanation section', () => {
  const tempFile = path.join(os.tmpdir(), 'no-explanation.md');
  const content = `---
title: Test Rule
impact: HIGH
---

## Test Rule

## Wrong

Bad example

## Right

Good example`;

  fs.writeFileSync(tempFile, content);
  const result = validateRuleStructure(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Explanation')));
});

test('validateRuleStructure - detects missing Wrong example', () => {
  const tempFile = path.join(os.tmpdir(), 'no-wrong.md');
  const content = `---
title: Test Rule
impact: HIGH
---

## Test Rule

## Explanation

Content

## Right

Good example`;

  fs.writeFileSync(tempFile, content);
  const result = validateRuleStructure(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Wrong')));
});

test('validateRuleStructure - detects missing Right example', () => {
  const tempFile = path.join(os.tmpdir(), 'no-right.md');
  const content = `---
title: Test Rule
impact: HIGH
---

## Test Rule

## Explanation

Content

## Wrong

Bad example`;

  fs.writeFileSync(tempFile, content);
  const result = validateRuleStructure(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('Right')));
});

test('validateRuleStructure - validates code examples have proper markdown fences', () => {
  const tempFile = path.join(os.tmpdir(), 'no-fences.md');
  const content = `---
title: Test Rule
impact: HIGH
---

## Test Rule

## Explanation

Content

## Wrong

Bad example (no code fence)

## Right

Good example (no code fence)`;

  fs.writeFileSync(tempFile, content);
  const result = validateRuleStructure(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('code example')));
});

test('preToolUse - allows non-Write/Edit operations', () => {
  const hookInput = {
    tool: 'Read',
    params: { file_path: '.claude/skills/test/rules/test-rule.md' },
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});

test('preToolUse - allows writes to non-rule files', () => {
  const hookInput = {
    tool: 'Write',
    params: {
      file_path: '.claude/skills/test/README.md',
      content: '# README',
    },
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});

test('preToolUse - blocks invalid rule file', () => {
  const hookInput = {
    tool: 'Write',
    params: {
      file_path: '.claude/skills/test/rules/bad-rule.md',
      content: '# No frontmatter or structure',
    },
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('validation failed'));
});

test('preToolUse - allows valid rule file', () => {
  const hookInput = {
    tool: 'Write',
    params: {
      file_path: '.claude/skills/test/rules/good-rule.md',
      content: `---
title: Test Rule
impact: HIGH
---

## Test Rule

## Explanation

Description

## Wrong

\`\`\`typescript
bad
\`\`\`

## Right

\`\`\`typescript
good
\`\`\`

## Impact

High`,
    },
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});

test('preToolUse - skips _template.md files', () => {
  const hookInput = {
    tool: 'Write',
    params: {
      file_path: '.claude/skills/test/rules/_template.md',
      content: '# Template content (incomplete)',
    },
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});
