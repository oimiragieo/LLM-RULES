/**
 * @file metadata-validator.test.cjs
 * @description Tests for skill metadata validation hook
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import validator
const { preToolUse, validateSkillMetadata, parseFrontmatter } = require('../../.claude/hooks/skills/metadata-validator.cjs');

test('parseFrontmatter - extracts YAML frontmatter', () => {
  const content = `---
name: test-skill
description: Test description
author: vercel
version: 1.0.0
license: MIT
---

# Content`;

  const frontmatter = parseFrontmatter(content);
  assert.strictEqual(frontmatter.name, 'test-skill');
  assert.strictEqual(frontmatter.description, 'Test description');
  assert.strictEqual(frontmatter.author, 'vercel');
  assert.strictEqual(frontmatter.version, '1.0.0');
  assert.strictEqual(frontmatter.license, 'MIT');
});

test('parseFrontmatter - returns null for missing frontmatter', () => {
  const content = '# No frontmatter';
  const frontmatter = parseFrontmatter(content);
  assert.strictEqual(frontmatter, null);
});

test('validateSkillMetadata - valid metadata passes', () => {
  const tempFile = path.join(os.tmpdir(), 'valid-skill.md');
  const content = `---
name: test-skill
description: Test description
author: vercel
version: 1.0.0
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# Test Skill`;

  fs.writeFileSync(tempFile, content);
  const result = validateSkillMetadata(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('validateSkillMetadata - detects missing name', () => {
  const tempFile = path.join(os.tmpdir(), 'no-name.md');
  const content = `---
description: Test description
author: vercel
version: 1.0.0
license: MIT
---

# Content`;

  fs.writeFileSync(tempFile, content);
  const result = validateSkillMetadata(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('name')));
});

test('validateSkillMetadata - detects missing description', () => {
  const tempFile = path.join(os.tmpdir(), 'no-description.md');
  const content = `---
name: test-skill
author: vercel
version: 1.0.0
license: MIT
---

# Content`;

  fs.writeFileSync(tempFile, content);
  const result = validateSkillMetadata(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('description')));
});

test('validateSkillMetadata - detects missing author', () => {
  const tempFile = path.join(os.tmpdir(), 'no-author.md');
  const content = `---
name: test-skill
description: Test description
version: 1.0.0
license: MIT
---

# Content`;

  fs.writeFileSync(tempFile, content);
  const result = validateSkillMetadata(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('author')));
});

test('validateSkillMetadata - detects missing version', () => {
  const tempFile = path.join(os.tmpdir(), 'no-version.md');
  const content = `---
name: test-skill
description: Test description
author: vercel
license: MIT
---

# Content`;

  fs.writeFileSync(tempFile, content);
  const result = validateSkillMetadata(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('version')));
});

test('validateSkillMetadata - detects invalid license', () => {
  const tempFile = path.join(os.tmpdir(), 'invalid-license.md');
  const content = `---
name: test-skill
description: Test description
author: vercel
version: 1.0.0
license: INVALID
---

# Content`;

  fs.writeFileSync(tempFile, content);
  const result = validateSkillMetadata(tempFile);
  fs.unlinkSync(tempFile);

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('license')));
});

test('preToolUse - allows non-Write/Edit operations', () => {
  const hookInput = {
    tool: 'Read',
    params: { file_path: '.claude/skills/test/SKILL.md' }
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});

test('preToolUse - allows writes to non-SKILL.md files', () => {
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

test('preToolUse - blocks invalid SKILL.md', () => {
  const hookInput = {
    tool: 'Write',
    params: {
      file_path: '.claude/skills/test/SKILL.md',
      content: '# No frontmatter'
    }
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('validation failed'));
});

test('preToolUse - allows valid SKILL.md', () => {
  const hookInput = {
    tool: 'Write',
    params: {
      file_path: '.claude/skills/test/SKILL.md',
      content: `---
name: test-skill
description: Test description
author: vercel
version: 1.0.0
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# Test Skill`
    }
  };

  const result = preToolUse(hookInput);
  assert.strictEqual(result.allowed, true);
});
