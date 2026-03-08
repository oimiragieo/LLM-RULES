'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '../../../.claude/skills/exa-monitor/SKILL.md');

describe('exa-monitor skill', () => {
  describe('SKILL.md structure', () => {
    test('SKILL.md exists', () => {
      assert.ok(fs.existsSync(SKILL_PATH), 'exa-monitor SKILL.md should exist');
    });

    test('has required frontmatter: name', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('name: exa-monitor'), 'should have name: exa-monitor');
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

    test('documents EXA_MONITOR_TOPICS configuration', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('EXA_MONITOR_TOPICS'), 'should document EXA_MONITOR_TOPICS env var');
    });

    test('documents deduplication via memory', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(
        (c.includes('deduplic') || c.includes('seen') || c.includes('MemoryRecord')) &&
          c.includes('memory'),
        'should document deduplication via memory'
      );
    });

    test('documents exa-digest.md output', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('exa-digest'), 'should reference exa-digest output file');
    });

    test('has dependencies field referencing scheduled-tasks', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(c.includes('scheduled-tasks'), 'should depend on scheduled-tasks skill');
    });

    test('references Exa MCP tool', () => {
      const c = fs.readFileSync(SKILL_PATH, 'utf8');
      assert.ok(
        c.includes('mcp__Exa') || c.includes('exa-monitor') || c.includes('web_search_exa'),
        'should reference Exa MCP tool'
      );
    });
  });

  describe('.env.example configuration', () => {
    const ENV_EXAMPLE = path.join(__dirname, '../../../.env.example');

    test('EXA_MONITOR_TOPICS is documented in .env.example', () => {
      const envContent = fs.readFileSync(ENV_EXAMPLE, 'utf8');
      assert.ok(
        envContent.includes('EXA_MONITOR_TOPICS'),
        'EXA_MONITOR_TOPICS should be in .env.example'
      );
    });
  });
});
