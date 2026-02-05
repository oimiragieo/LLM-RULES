'use strict';

/**
 * Tests for Skill Index Generator
 *
 * TDD Test Cases for nested directory support (SKL-001)
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// We'll test the recursive scanning function
const { scanSkillFilesRecursively } = require('../../../.claude/tools/cli/generate-skill-index.cjs');

describe('generate-skill-index', () => {
  let tempDir;

  beforeEach(() => {
    // Create temp directory for test fixtures
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-index-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('scanSkillFilesRecursively', () => {
    test('should find SKILL.md in direct subdirectory', () => {
      // Arrange: Create skills/tdd/SKILL.md
      const skillDir = path.join(tempDir, 'tdd');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# TDD Skill');

      // Act
      const result = scanSkillFilesRecursively(tempDir);

      // Assert
      assert.ok(result['tdd'], 'Should find tdd skill');
      assert.strictEqual(result['tdd'].name, 'tdd');
      assert.strictEqual(result['tdd'].hasSkillFile, true);
    });

    test('should find SKILL.md in nested directory (scientific-skills/skills/biopython)', () => {
      // Arrange: Create scientific-skills/skills/biopython/SKILL.md
      // This is the exact structure that was failing
      const nestedPath = path.join(tempDir, 'scientific-skills', 'skills', 'biopython');
      fs.mkdirSync(nestedPath, { recursive: true });
      fs.writeFileSync(path.join(nestedPath, 'SKILL.md'), '# Biopython Skill');

      // Also create the parent SKILL.md (scientific-skills/SKILL.md)
      const parentPath = path.join(tempDir, 'scientific-skills');
      fs.writeFileSync(path.join(parentPath, 'SKILL.md'), '# Scientific Skills');

      // Act
      const result = scanSkillFilesRecursively(tempDir);

      // Assert: The key should preserve the full relative path including "skills/"
      assert.ok(result['scientific-skills'], 'Should find scientific-skills');
      assert.ok(
        result['scientific-skills/skills/biopython'],
        'Should find scientific-skills/skills/biopython with FULL path'
      );

      // Verify we DON'T have the wrong key
      assert.ok(
        !result['scientific-skills/biopython'],
        'Should NOT have stripped path scientific-skills/biopython'
      );
    });

    test('should find SKILL.md at multiple nesting levels', () => {
      // Arrange: Create various nesting levels
      const paths = [
        'simple',
        'nested/inner',
        'deep/nested/skill',
        'very/deep/nested/skill',
      ];

      for (const p of paths) {
        const fullPath = path.join(tempDir, p);
        fs.mkdirSync(fullPath, { recursive: true });
        fs.writeFileSync(path.join(fullPath, 'SKILL.md'), `# ${p} Skill`);
      }

      // Act
      const result = scanSkillFilesRecursively(tempDir);

      // Assert: All paths should be found with their full relative paths
      for (const p of paths) {
        assert.ok(
          result[p.replace(/\\/g, '/')],
          `Should find skill at ${p}`
        );
      }
    });

    test('should handle directories without SKILL.md (not indexed)', () => {
      // Arrange: Create directory without SKILL.md
      const noSkillDir = path.join(tempDir, 'no-skill-dir');
      fs.mkdirSync(noSkillDir, { recursive: true });
      fs.writeFileSync(path.join(noSkillDir, 'README.md'), '# Not a skill');

      // Create a valid skill too
      const validDir = path.join(tempDir, 'valid-skill');
      fs.mkdirSync(validDir, { recursive: true });
      fs.writeFileSync(path.join(validDir, 'SKILL.md'), '# Valid Skill');

      // Act
      const result = scanSkillFilesRecursively(tempDir);

      // Assert
      assert.ok(!result['no-skill-dir'], 'Should not index directory without SKILL.md');
      assert.ok(result['valid-skill'], 'Should index directory with SKILL.md');
    });

    test('should preserve exact relative path structure for document-skills', () => {
      // Arrange: Create scientific-skills/skills/document-skills/pdf structure
      const nestedPath = path.join(tempDir, 'scientific-skills', 'skills', 'document-skills', 'pdf');
      fs.mkdirSync(nestedPath, { recursive: true });
      fs.writeFileSync(path.join(nestedPath, 'SKILL.md'), '# PDF Skill');

      // Act
      const result = scanSkillFilesRecursively(tempDir);

      // Assert: Should have full path
      const expectedKey = 'scientific-skills/skills/document-skills/pdf';
      assert.ok(
        result[expectedKey],
        `Should find ${expectedKey} with exact path`
      );
    });
  });
});
