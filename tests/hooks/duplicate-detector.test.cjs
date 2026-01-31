/**
 * @file duplicate-detector.test.cjs
 * @description Tests for skill duplicate detection hook
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import detector
const { preToolUse, detectDuplicates, scanSkillsDirectory } = require('../../.claude/hooks/skills/duplicate-detector.cjs');

test('scanSkillsDirectory - scans skill rules', () => {
  // Create temporary skill structure
  const tempDir = path.join(os.tmpdir(), 'test-skills-' + Date.now());
  const skill1Dir = path.join(tempDir, 'skill1', 'rules');
  const skill2Dir = path.join(tempDir, 'skill2', 'rules');

  fs.mkdirSync(skill1Dir, { recursive: true });
  fs.mkdirSync(skill2Dir, { recursive: true });

  fs.writeFileSync(path.join(skill1Dir, 'rule1.md'), `---
title: Rule 1
impact: HIGH
---

## Rule 1`);

  fs.writeFileSync(path.join(skill2Dir, 'rule2.md'), `---
title: Rule 2
impact: MEDIUM
---

## Rule 2`);

  const index = scanSkillsDirectory(tempDir);

  assert.ok(index.rulesByTitle['Rule 1']);
  assert.ok(index.rulesByTitle['Rule 2']);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('detectDuplicates - detects duplicate rule titles', () => {
  const tempDir = path.join(os.tmpdir(), 'test-dups-' + Date.now());
  const skill1Dir = path.join(tempDir, 'skill1', 'rules');
  const skill2Dir = path.join(tempDir, 'skill2', 'rules');

  fs.mkdirSync(skill1Dir, { recursive: true });
  fs.mkdirSync(skill2Dir, { recursive: true });

  fs.writeFileSync(path.join(skill1Dir, 'rule1.md'), `---
title: Duplicate Title
impact: HIGH
---

## Duplicate Title`);

  fs.writeFileSync(path.join(skill2Dir, 'rule2.md'), `---
title: Duplicate Title
impact: MEDIUM
---

## Duplicate Title`);

  const result = detectDuplicates(tempDir, 'Duplicate Title', '');

  assert.strictEqual(result.hasDuplicates, true);
  assert.ok(result.conflicts.some(c => c.includes('title')));

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('detectDuplicates - detects duplicate file names', () => {
  const tempDir = path.join(os.tmpdir(), 'test-filenames-' + Date.now());
  const skill1Dir = path.join(tempDir, 'skill1', 'rules');
  const skill2Dir = path.join(tempDir, 'skill2', 'rules');

  fs.mkdirSync(skill1Dir, { recursive: true });
  fs.mkdirSync(skill2Dir, { recursive: true });

  fs.writeFileSync(path.join(skill1Dir, 'same-file.md'), `---
title: Rule 1
impact: HIGH
---

## Rule 1`);

  fs.writeFileSync(path.join(skill2Dir, 'same-file.md'), `---
title: Rule 2
impact: MEDIUM
---

## Rule 2`);

  const result = detectDuplicates(tempDir, 'Rule 3', path.join(skill2Dir, 'same-file.md'));

  assert.strictEqual(result.hasDuplicates, true);
  assert.ok(result.conflicts.some(c => c.includes('file name') || c.includes('filename')));

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('detectDuplicates - no conflicts returns valid', () => {
  const tempDir = path.join(os.tmpdir(), 'test-noconflict-' + Date.now());
  const skillDir = path.join(tempDir, 'skill1', 'rules');

  fs.mkdirSync(skillDir, { recursive: true });

  fs.writeFileSync(path.join(skillDir, 'rule1.md'), `---
title: Unique Rule
impact: HIGH
---

## Unique Rule`);

  const result = detectDuplicates(tempDir, 'Another Unique Rule', path.join(skillDir, 'rule2.md'));

  assert.strictEqual(result.hasDuplicates, false);
  assert.strictEqual(result.conflicts.length, 0);

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('preToolUse - allows non-Write/Edit operations', () => {
  const hookInput = {
    tool: 'Read',
    params: { file_path: '.claude/skills/test/rules/test-rule.md' }
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});

test('preToolUse - allows writes to non-rule files', () => {
  const hookInput = {
    tool: 'Write',
    params: {
      file_path: '.claude/skills/test/README.md',
      content: '# README'
    }
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});

test('preToolUse - skips _template.md files', () => {
  const hookInput = {
    tool: 'Write',
    params: {
      file_path: '.claude/skills/test/rules/_template.md',
      content: '# Template'
    }
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});
