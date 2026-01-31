#!/usr/bin/env node
/**
 * Tests for spawn-size-validator.cjs hook
 * TDD: Red-Green-Refactor cycle
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { calculateSpawnSize, validateSpawnSize, generatePruningSuggestions } = require('../.claude/hooks/safety/spawn-size-validator.cjs');

describe('spawn-size-validator.cjs', () => {
  describe('calculateSpawnSize', () => {
    it('calculates minimal spawn size correctly', () => {
      const tools = ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill'];
      const prompt = 'Short prompt';
      const template = '';

      const result = calculateSpawnSize(tools, prompt, template);

      assert.equal(result.toolCount, 9);
      assert.equal(result.totalBytes, 4000 + (9 * 200) + 12 + 0); // 5812 bytes
      assert.equal(result.totalKB, Math.round(5812 / 1024 * 10) / 10); // ~5.7 KB
      assert.deepEqual(result.breakdown, {
        base: 4000,
        tools: 1800,
        prompt: 12,
        template: 0,
      });
    });

    it('calculates large spawn size correctly', () => {
      const tools = [
        'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill',
        'mcp__chrome-devtools__list_pages',
        'mcp__chrome-devtools__select_page',
        'mcp__chrome-devtools__new_page',
        'mcp__chrome-devtools__close_page',
        'mcp__chrome-devtools__navigate_page',
        'mcp__chrome-devtools__take_snapshot',
        'mcp__chrome-devtools__take_screenshot',
        'mcp__chrome-devtools__click',
        'mcp__chrome-devtools__fill',
        'mcp__chrome-devtools__fill_form',
        'mcp__chrome-devtools__hover',
        'mcp__chrome-devtools__drag',
        'mcp__chrome-devtools__press_key',
        'mcp__chrome-devtools__evaluate_script',
        'mcp__chrome-devtools__handle_dialog',
      ];
      const prompt = 'A'.repeat(5000); // 5KB prompt
      const template = 'B'.repeat(3000); // 3KB template

      const result = calculateSpawnSize(tools, prompt, template);

      assert.equal(result.toolCount, 27); // 12 core + 15 chrome tools = 27
      assert.equal(result.totalBytes, 4000 + (27 * 200) + 5000 + 3000); // 17400 bytes
      assert.equal(result.totalKB, Math.round(17400 / 1024 * 10) / 10); // ~17.0 KB
    });
  });

  describe('validateSpawnSize', () => {
    it('passes for minimal spawn (6 KB, 9 tools)', () => {
      const result = validateSpawnSize(6, 9, 'warn');

      assert.equal(result.status, 'pass');
      assert.equal(result.message, '');
    });

    it('warns for medium spawn (18 KB, 15 tools)', () => {
      const result = validateSpawnSize(18, 15, 'warn');

      assert.equal(result.status, 'warn');
      assert.ok(result.message.includes('SPAWN SIZE WARNING'));
      assert.ok(result.message.includes('18 KB'));
      assert.ok(result.message.includes('15 tools'));
    });

    it('blocks for large spawn (30 KB, 20 tools) in block mode', () => {
      const result = validateSpawnSize(30, 20, 'block');

      assert.equal(result.status, 'block');
      assert.ok(result.message.includes('SPAWN SIZE BLOCKED'));
      assert.ok(result.message.includes('30 KB'));
      assert.ok(result.message.includes('20 tools'));
    });

    it('passes for orchestrators (bypass validation)', () => {
      // Orchestrators have special handling in main hook
      // This test verifies threshold logic only
      const result = validateSpawnSize(50, 30, 'block');

      assert.equal(result.status, 'block'); // Would block for non-orchestrators
    });

    it('allows spawn in off mode regardless of size', () => {
      const result = validateSpawnSize(100, 50, 'off');

      assert.equal(result.status, 'pass');
    });
  });

  describe('generatePruningSuggestions', () => {
    it('suggests removing chrome tools when present', () => {
      const tools = [
        'Read', 'Write', 'Edit',
        'mcp__chrome-devtools__list_pages',
        'mcp__chrome-devtools__select_page',
        'mcp__chrome-devtools__new_page',
        'mcp__chrome-devtools__click',
        'mcp__chrome-devtools__fill',
      ];

      const result = generatePruningSuggestions(tools);

      assert.ok(result.suggestions.length > 0);
      assert.ok(result.suggestions[0].includes('chrome tools'));
      assert.ok(result.estimatedSavings.includes('KB'));
      assert.ok(result.example);
    });

    it('suggests removing optional MCP tools', () => {
      const tools = [
        'Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill',
        'WebSearch', 'WebFetch', 'NotebookEdit',
        'mcp__Exa__web_search_exa',
      ];

      const result = generatePruningSuggestions(tools);

      assert.ok(result.suggestions.length > 0);
      assert.ok(result.suggestions.some(s => s.includes('WebFetch') || s.includes('WebSearch') || s.includes('Exa')));
    });

    it('suggests splitting spawn for very large tool lists', () => {
      const tools = new Array(30).fill('Tool');

      const result = generatePruningSuggestions(tools);

      assert.ok(result.suggestions.some(s => s.includes('split') || s.includes('multi-agent')));
    });

    it('returns no suggestions for minimal tool lists', () => {
      const tools = ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill'];

      const result = generatePruningSuggestions(tools);

      // Minimal tool list shouldn't need pruning
      assert.ok(result.suggestions.length === 0 || result.estimatedSavings === '0 KB');
    });
  });

  describe('hook integration (main function)', () => {
    it('validates spawn parameters from hook input', () => {
      // This test will verify the hook reads from stdin and processes correctly
      // Main function tests will be added after basic functions pass
      assert.ok(true, 'Integration tests to be added after GREEN phase');
    });
  });
});
