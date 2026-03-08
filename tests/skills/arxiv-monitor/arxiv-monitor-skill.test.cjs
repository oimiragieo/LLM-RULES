'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '../../../.claude/skills/arxiv-monitor/SKILL.md');

describe('arxiv-monitor skill', () => {
  describe('SKILL.md structure', () => {
    test('SKILL.md exists', () => {
      assert.ok(fs.existsSync(SKILL_PATH), 'arxiv-monitor SKILL.md should exist');
    });

    let content;
    test('reads SKILL.md content', () => {
      content = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(content.length > 100, 'SKILL.md should have substantial content');
    });

    test('has required frontmatter: name', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('name: arxiv-monitor'), 'should have name: arxiv-monitor');
    });

    test('has required frontmatter: category', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('category:'), 'should have category field');
    });

    test('references CronCreate or /loop scheduling', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(
        c.includes('CronCreate') || c.includes('/loop'),
        'should document CronCreate or /loop scheduling'
      );
    });

    test('documents ARXIV_KEYWORDS configuration', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('ARXIV_KEYWORDS'), 'should document ARXIV_KEYWORDS env var');
    });

    test('documents deduplication via memory', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(
        (c.includes('deduplic') || c.includes('seen') || c.includes('MemoryRecord')) &&
          c.includes('memory'),
        'should document deduplication via memory'
      );
    });

    test('documents arxiv-digest.md output', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('arxiv-digest'), 'should reference arxiv-digest output file');
    });

    test('has dependencies field referencing scheduled-tasks', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('scheduled-tasks'), 'should depend on scheduled-tasks skill');
    });
  });

  describe('.env.example configuration', () => {
    const ENV_EXAMPLE = path.join(__dirname, '../../../.env.example');

    test('ARXIV_KEYWORDS is documented in .env.example', () => {
      const envContent = fs.readFileSync(ENV_EXAMPLE, 'utf8');
      assert.ok(envContent.includes('ARXIV_KEYWORDS'), 'ARXIV_KEYWORDS should be in .env.example');
    });
  });
});
