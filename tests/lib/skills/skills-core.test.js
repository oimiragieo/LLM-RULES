/**
 * Tests for Skills Core Library
 *
 * Run with: node --experimental-vm-modules node_modules/jest/bin/jest.js skills-core.test.js
 * Or: npm test -- skills-core.test.js (if jest is configured with ESM support)
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the module under test
import {
  extractFrontmatter,
  findSkillsInDir,
  resolveSkillPath,
  stripFrontmatter,
  loadSkill,
} from '../../../.claude/lib/skills/skills-core.js';

describe('skills-core', () => {
  describe('extractFrontmatter', () => {
    const testDir = path.join(__dirname, '__test_fixtures__');
    const testSkillFile = path.join(testDir, 'test-skill', 'SKILL.md');

    beforeAll(() => {
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

    afterAll(() => {
      // Cleanup test fixtures
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('extracts name and description', () => {
      const result = extractFrontmatter(testSkillFile);
      expect(result.name).toBe('test-skill');
      expect(result.description).toBe('A test skill for unit testing');
    });

    it('extracts array values', () => {
      const result = extractFrontmatter(testSkillFile);
      expect(result.tools).toEqual(['Read', 'Write', 'Edit']);
    });

    it('extracts string values', () => {
      const result = extractFrontmatter(testSkillFile);
      expect(result.model).toBe('sonnet');
    });

    it('returns empty values for missing file', () => {
      const result = extractFrontmatter('/nonexistent/path/SKILL.md');
      expect(result.name).toBe('');
      expect(result.description).toBe('');
    });
  });

  describe('stripFrontmatter', () => {
    it('removes frontmatter and returns body', () => {
      const content = `---
name: test
description: desc
---

# Body

This is the body.`;

      const result = stripFrontmatter(content);
      expect(result).toBe('# Body\n\nThis is the body.');
    });

    it('returns content unchanged if no frontmatter', () => {
      const content = '# No Frontmatter\n\nJust content.';
      const result = stripFrontmatter(content);
      expect(result).toBe('# No Frontmatter\n\nJust content.');
    });
  });

  describe('findSkillsInDir', () => {
    const testDir = path.join(__dirname, '__test_skills__');

    beforeAll(() => {
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

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('finds all skills in directory', () => {
      const skills = findSkillsInDir(testDir, 'test');
      expect(skills.length).toBe(3);
      expect(skills.map(s => s.name).sort()).toEqual(['skill-a', 'skill-b', 'skill-c']);
    });

    it('includes source type', () => {
      const skills = findSkillsInDir(testDir, 'framework');
      expect(skills.every(s => s.sourceType === 'framework')).toBe(true);
    });

    it('respects max depth', () => {
      const skills = findSkillsInDir(testDir, 'test', 0);
      // Only top-level skills (skill-a, skill-b), not nested/skill-c
      expect(skills.length).toBe(2);
    });

    it('returns empty array for nonexistent directory', () => {
      const skills = findSkillsInDir('/nonexistent/path', 'test');
      expect(skills).toEqual([]);
    });
  });

  describe('resolveSkillPath', () => {
    const frameworkDir = path.join(__dirname, '__framework_skills__');
    const userDir = path.join(__dirname, '__user_skills__');

    beforeAll(() => {
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

    afterAll(() => {
      fs.rmSync(frameworkDir, { recursive: true, force: true });
      fs.rmSync(userDir, { recursive: true, force: true });
    });

    it('user skill shadows framework skill', () => {
      const result = resolveSkillPath('tdd', frameworkDir, userDir);
      expect(result.sourceType).toBe('user');
      expect(result.skillFile).toContain('__user_skills__');
    });

    it('falls back to framework if no user skill', () => {
      const result = resolveSkillPath('debugging', frameworkDir, userDir);
      expect(result.sourceType).toBe('framework');
      expect(result.skillFile).toContain('__framework_skills__');
    });

    it('finds user-only skills', () => {
      const result = resolveSkillPath('custom', frameworkDir, userDir);
      expect(result.sourceType).toBe('user');
    });

    it('framework: prefix forces framework skill', () => {
      const result = resolveSkillPath('framework:tdd', frameworkDir, userDir);
      expect(result.sourceType).toBe('framework');
      expect(result.skillFile).toContain('__framework_skills__');
    });

    it('returns null for nonexistent skill', () => {
      const result = resolveSkillPath('nonexistent', frameworkDir, userDir);
      expect(result).toBeNull();
    });
  });

  describe('loadSkill', () => {
    const testDir = path.join(__dirname, '__load_test__');
    const testSkillFile = path.join(testDir, 'SKILL.md');

    beforeAll(() => {
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

    afterAll(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('loads frontmatter and body separately', () => {
      const result = loadSkill(testSkillFile);
      expect(result.frontmatter.name).toBe('load-test');
      expect(result.body).toContain('# Load Test');
      expect(result.body).toContain('Body content here.');
      expect(result.body).not.toContain('name: load-test');
    });

    it('returns null for missing file', () => {
      const result = loadSkill('/nonexistent/SKILL.md');
      expect(result).toBeNull();
    });
  });
});
