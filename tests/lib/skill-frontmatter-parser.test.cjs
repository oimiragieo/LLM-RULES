'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseSkillFrontmatter } = require('../../.claude/lib/utils/skill-frontmatter-parser.cjs');

describe('parseSkillFrontmatter', () => {
  describe('basic frontmatter parsing', () => {
    it('parses description and use_when fields', () => {
      const content = [
        '---',
        'description: My skill does something useful',
        'use_when: When you need to do something',
        '---',
        '',
        '# Skill Content',
      ].join('\n');

      const result = parseSkillFrontmatter(content);
      assert.ok(result !== null);
      assert.equal(result.description, 'My skill does something useful');
      assert.equal(result.use_when, 'When you need to do something');
    });

    it('parses quoted string values', () => {
      const content = ['---', 'description: "A skill with spaces and: colons"', '---'].join('\n');

      const result = parseSkillFrontmatter(content);
      assert.ok(result !== null);
      assert.equal(result.description, 'A skill with spaces and: colons');
    });

    it('parses multiple scalar fields', () => {
      const content = ['---', 'name: my-skill', 'version: 1.2.3', 'author: developer', '---'].join(
        '\n'
      );

      const result = parseSkillFrontmatter(content);
      assert.equal(result.name, 'my-skill');
      assert.equal(result.version, '1.2.3');
      assert.equal(result.author, 'developer');
    });
  });

  describe('missing fields handling', () => {
    it('returns empty object (not null) when frontmatter present but empty', () => {
      const content = ['---', '---', '', '# Body'].join('\n');
      const result = parseSkillFrontmatter(content);
      assert.ok(result !== null);
      assert.deepEqual(result, {});
    });

    it('returns null when no frontmatter delimiters found', () => {
      const content = '# Just a markdown file\n\nSome content here.';
      assert.equal(parseSkillFrontmatter(content), null);
    });

    it('returns null for unclosed frontmatter (missing closing ---)', () => {
      const content = ['---', 'description: something'].join('\n');
      assert.equal(parseSkillFrontmatter(content), null);
    });

    it('description field is undefined when not present', () => {
      const content = ['---', 'name: my-skill', '---'].join('\n');
      const result = parseSkillFrontmatter(content);
      assert.equal(result.description, undefined);
    });

    it('use_when field is undefined when not present', () => {
      const content = ['---', 'description: something', '---'].join('\n');
      const result = parseSkillFrontmatter(content);
      assert.equal(result.use_when, undefined);
    });
  });

  describe('no frontmatter at all', () => {
    it('returns null for empty string', () => {
      assert.equal(parseSkillFrontmatter(''), null);
    });

    it('returns null for whitespace-only string', () => {
      assert.equal(parseSkillFrontmatter('   \n  '), null);
    });

    it('returns null for non-string input', () => {
      assert.equal(parseSkillFrontmatter(null), null);
      assert.equal(parseSkillFrontmatter(undefined), null);
      assert.equal(parseSkillFrontmatter(42), null);
    });
  });

  describe('block list values', () => {
    it('parses block list (- items)', () => {
      const content = ['---', 'tags:', '  - tdd', '  - testing', '  - quality', '---'].join('\n');

      const result = parseSkillFrontmatter(content);
      assert.deepEqual(result.tags, ['tdd', 'testing', 'quality']);
    });
  });

  describe('inline list values', () => {
    it('parses inline list [a, b, c]', () => {
      const content = ['---', 'tools: [Read, Write, Edit]', '---'].join('\n');
      const result = parseSkillFrontmatter(content);
      assert.deepEqual(result.tools, ['Read', 'Write', 'Edit']);
    });
  });

  describe('real-world SKILL.md content', () => {
    it('parses a realistic skill header', () => {
      const content = [
        '---',
        'description: >-',
        '  Systematic 4-phase debugging process for complex bugs.',
        'use_when: When you encounter a bug that is not immediately obvious',
        'tags: [debugging, systematic, tdd]',
        'version: 2.0.0',
        '---',
        '',
        '# Debugging Skill',
        '',
        '## Phase 1: Reproduce',
      ].join('\n');

      const result = parseSkillFrontmatter(content);
      assert.ok(result !== null);
      assert.ok(typeof result.description === 'string' || result.description === '>-');
      assert.equal(result.version, '2.0.0');
      assert.deepEqual(result.tags, ['debugging', 'systematic', 'tdd']);
      assert.equal(result.use_when, 'When you encounter a bug that is not immediately obvious');
    });

    it('handles frontmatter with comments', () => {
      const content = ['---', '# This is a comment', 'description: My skill', '---'].join('\n');

      const result = parseSkillFrontmatter(content);
      assert.equal(result.description, 'My skill');
      assert.equal(result['# This is a comment'], undefined);
    });
  });
});
