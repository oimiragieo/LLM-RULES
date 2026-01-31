#!/usr/bin/env node
/**
 * Tests for Skills Core Library
 *
 * Run with: node --test skills-core.test.cjs
 *
 * Converted from Jest to Node.js built-in test runner
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Get current directory
const __dirname_local = __dirname;

// Dynamic import for ESM module
let extractFrontmatter, findSkillsInDir, resolveSkillPath, stripFrontmatter, loadSkill;

describe('skills-core', async () => {
  // Import the ESM module before tests
  before(async () => {
    const mod = await import('./skills-core.js');
    extractFrontmatter = mod.extractFrontmatter;
    findSkillsInDir = mod.findSkillsInDir;
    resolveSkillPath = mod.resolveSkillPath;
    stripFrontmatter = mod.stripFrontmatter;
    loadSkill = mod.loadSkill;
  });

  describe('extractFrontmatter', async () => {
    const testDir = path.join(__dirname_local, '__test_fixtures__');
    const testSkillFile = path.join(testDir, 'test-skill', 'SKILL.md');

    before(() => {
      // Create test fixture
      fs.mkdirSync(path.join(testDir, 'test-skill'), { recursive: true });
      fs.writeFileSync(
        testSkillFile,
        `---
name: test-skill
description: A test skill for unit testing
tools: [Read, Write, Edit]
model: sonnet
---

# Test Skill

This is the body of the test skill.
`
      );
    });

    after(() => {
      // Cleanup test fixtures
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('extracts name and description', async () => {
      const result = extractFrontmatter(testSkillFile);
      assert.strictEqual(result.name, 'test-skill');
      assert.strictEqual(result.description, 'A test skill for unit testing');
    });

    test('extracts array values', async () => {
      const result = extractFrontmatter(testSkillFile);
      assert.deepStrictEqual(result.tools, ['Read', 'Write', 'Edit']);
    });

    test('extracts string values', async () => {
      const result = extractFrontmatter(testSkillFile);
      assert.strictEqual(result.model, 'sonnet');
    });

    test('returns empty values for missing file', async () => {
      const result = extractFrontmatter('/nonexistent/path/SKILL.md');
      assert.strictEqual(result.name, '');
      assert.strictEqual(result.description, '');
    });
  });

  describe('stripFrontmatter', async () => {
    test('removes frontmatter and returns body', async () => {
      const content = `---
name: test
description: desc
---

# Body

This is the body.`;

      const result = stripFrontmatter(content);
      assert.strictEqual(result, '# Body\n\nThis is the body.');
    });

    test('returns content unchanged if no frontmatter', async () => {
      const content = '# No Frontmatter\n\nJust content.';
      const result = stripFrontmatter(content);
      assert.strictEqual(result, '# No Frontmatter\n\nJust content.');
    });
  });

  describe('findSkillsInDir', async () => {
    const testDir = path.join(__dirname_local, '__test_skills__');

    before(() => {
      // Create test skill directories
      fs.mkdirSync(path.join(testDir, 'skill-a'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'skill-b'), { recursive: true });
      fs.mkdirSync(path.join(testDir, 'nested', 'skill-c'), { recursive: true });

      fs.writeFileSync(
        path.join(testDir, 'skill-a', 'SKILL.md'),
        '---\nname: skill-a\ndescription: First skill\n---\n# A'
      );
      fs.writeFileSync(
        path.join(testDir, 'skill-b', 'SKILL.md'),
        '---\nname: skill-b\ndescription: Second skill\n---\n# B'
      );
      fs.writeFileSync(
        path.join(testDir, 'nested', 'skill-c', 'SKILL.md'),
        '---\nname: skill-c\ndescription: Nested skill\n---\n# C'
      );
    });

    after(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('finds all skills in directory', async () => {
      const skills = findSkillsInDir(testDir, 'test');
      assert.strictEqual(skills.length, 3);
      assert.deepStrictEqual(skills.map(s => s.name).sort(), ['skill-a', 'skill-b', 'skill-c']);
    });

    test('includes source type', async () => {
      const skills = findSkillsInDir(testDir, 'framework');
      assert.ok(skills.every(s => s.sourceType === 'framework'));
    });

    test('respects max depth', async () => {
      const skills = findSkillsInDir(testDir, 'test', 0);
      // Only top-level skills (skill-a, skill-b), not nested/skill-c
      assert.strictEqual(skills.length, 2);
    });

    test('returns empty array for nonexistent directory', async () => {
      const skills = findSkillsInDir('/nonexistent/path', 'test');
      assert.deepStrictEqual(skills, []);
    });
  });

  describe('resolveSkillPath', async () => {
    const frameworkDir = path.join(__dirname_local, '__framework_skills__');
    const userDir = path.join(__dirname_local, '__user_skills__');

    before(() => {
      // Create framework skill
      fs.mkdirSync(path.join(frameworkDir, 'tdd'), { recursive: true });
      fs.writeFileSync(
        path.join(frameworkDir, 'tdd', 'SKILL.md'),
        '---\nname: tdd\ndescription: Framework TDD\n---\n# TDD'
      );

      // Create framework-only skill
      fs.mkdirSync(path.join(frameworkDir, 'debugging'), { recursive: true });
      fs.writeFileSync(
        path.join(frameworkDir, 'debugging', 'SKILL.md'),
        '---\nname: debugging\ndescription: Framework Debugging\n---\n# Debug'
      );

      // Create user override of tdd
      fs.mkdirSync(path.join(userDir, 'tdd'), { recursive: true });
      fs.writeFileSync(
        path.join(userDir, 'tdd', 'SKILL.md'),
        '---\nname: tdd\ndescription: User TDD Override\n---\n# TDD User'
      );

      // Create user-only skill
      fs.mkdirSync(path.join(userDir, 'custom'), { recursive: true });
      fs.writeFileSync(
        path.join(userDir, 'custom', 'SKILL.md'),
        '---\nname: custom\ndescription: User Custom\n---\n# Custom'
      );
    });

    after(() => {
      fs.rmSync(frameworkDir, { recursive: true, force: true });
      fs.rmSync(userDir, { recursive: true, force: true });
    });

    test('user skill shadows framework skill', async () => {
      const result = resolveSkillPath('tdd', frameworkDir, userDir);
      assert.strictEqual(result.sourceType, 'user');
      assert.ok(result.skillFile.includes('__user_skills__'));
    });

    test('falls back to framework if no user skill', async () => {
      const result = resolveSkillPath('debugging', frameworkDir, userDir);
      assert.strictEqual(result.sourceType, 'framework');
      assert.ok(result.skillFile.includes('__framework_skills__'));
    });

    test('finds user-only skills', async () => {
      const result = resolveSkillPath('custom', frameworkDir, userDir);
      assert.strictEqual(result.sourceType, 'user');
    });

    test('framework: prefix forces framework skill', async () => {
      const result = resolveSkillPath('framework:tdd', frameworkDir, userDir);
      assert.strictEqual(result.sourceType, 'framework');
      assert.ok(result.skillFile.includes('__framework_skills__'));
    });

    test('returns null for nonexistent skill', async () => {
      const result = resolveSkillPath('nonexistent', frameworkDir, userDir);
      assert.strictEqual(result, null);
    });
  });

  describe('loadSkill', async () => {
    const testDir = path.join(__dirname_local, '__load_test__');
    const testSkillFile = path.join(testDir, 'SKILL.md');

    before(() => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        testSkillFile,
        `---
name: load-test
description: Test loading
---

# Load Test

Body content here.`
      );
    });

    after(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    test('loads frontmatter and body separately', async () => {
      const result = loadSkill(testSkillFile);
      assert.strictEqual(result.frontmatter.name, 'load-test');
      assert.ok(result.body.includes('# Load Test'));
      assert.ok(result.body.includes('Body content here.'));
      assert.ok(!result.body.includes('name: load-test'));
    });

    test('returns null for missing file', async () => {
      const result = loadSkill('/nonexistent/SKILL.md');
      assert.strictEqual(result, null);
    });
  });
});
