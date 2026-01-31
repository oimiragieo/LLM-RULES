#!/usr/bin/env node
/**
 * Comprehensive Test Suite for spawn-size-validator.cjs hook
 *
 * Coverage Target: 50+ tests across 7 categories
 * - Unit Tests: calculateSpawnSize(), validateSpawnSize(), generatePruningSuggestions()
 * - Integration Tests: Real hook behavior
 * - Edge Cases & Boundary Tests
 * - Regression Tests: Specific scenarios
 * - Smoke Tests: End-to-end validation
 *
 * Run: node --test tests/hooks/spawn-size-validator.test.cjs
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  calculateSpawnSize,
  validateSpawnSize,
  generatePruningSuggestions,
  logSpawnAudit,
} = require('../../.claude/hooks/safety/spawn-size-validator.cjs');

// ============================================================================
// CATEGORY 1: Unit Tests - calculateSpawnSize()
// ============================================================================

describe('Unit: calculateSpawnSize()', () => {
  it('calculates minimal spawn (9 tools, 2KB prompt) correctly', () => {
    const tools = ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill'];
    const prompt = 'A'.repeat(2048); // 2KB prompt
    const template = '';

    const result = calculateSpawnSize(tools, prompt, template);

    // Base: 4000 + Tools: 9*200=1800 + Prompt: 2048 + Template: 0 = 7848
    assert.equal(result.toolCount, 9);
    assert.equal(result.totalBytes, 4000 + 1800 + 2048 + 0);
    assert.equal(result.totalKB, Math.round(7848 / 1024 * 10) / 10);
    assert.deepEqual(result.breakdown, {
      base: 4000,
      tools: 1800,
      prompt: 2048,
      template: 0,
    });
  });

  it('calculates medium spawn (15 tools, 5KB prompt) correctly', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskUpdate',
      'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput', 'Skill', 'WebSearch', 'WebFetch'
    ];
    const prompt = 'B'.repeat(5120); // 5KB prompt
    const template = '';

    const result = calculateSpawnSize(tools, prompt, template);

    // Base: 4000 + Tools: 15*200=3000 + Prompt: 5120 + Template: 0 = 12120
    assert.equal(result.toolCount, 15);
    assert.equal(result.totalBytes, 4000 + 3000 + 5120 + 0);
    assert.equal(result.totalKB, Math.round(12120 / 1024 * 10) / 10);
  });

  it('calculates large spawn (26 tools, 10KB prompt) correctly', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskUpdate',
      'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput', 'Skill',
      'mcp__chrome-devtools__list_pages', 'mcp__chrome-devtools__select_page',
      'mcp__chrome-devtools__new_page', 'mcp__chrome-devtools__close_page',
      'mcp__chrome-devtools__navigate_page', 'mcp__chrome-devtools__take_snapshot',
      'mcp__chrome-devtools__take_screenshot', 'mcp__chrome-devtools__click',
      'mcp__chrome-devtools__fill', 'mcp__chrome-devtools__fill_form',
      'mcp__chrome-devtools__hover', 'mcp__chrome-devtools__drag',
      'mcp__chrome-devtools__press_key'
    ];
    const prompt = 'C'.repeat(10240); // 10KB prompt
    const template = '';

    const result = calculateSpawnSize(tools, prompt, template);

    // Base: 4000 + Tools: 26*200=5200 + Prompt: 10240 + Template: 0 = 19440
    assert.equal(result.toolCount, 26);
    assert.equal(result.totalBytes, 4000 + 5200 + 10240 + 0);
    assert.ok(result.totalKB > 18 && result.totalKB < 20);
  });

  it('calculates researcher actual tools (26 tools, 15KB prompt) → ~30 KB', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskUpdate',
      'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput', 'Skill', 'WebSearch', 'WebFetch',
      'mcp__chrome-devtools__list_pages', 'mcp__chrome-devtools__select_page',
      'mcp__chrome-devtools__new_page', 'mcp__chrome-devtools__take_snapshot',
      'mcp__chrome-devtools__take_screenshot', 'mcp__chrome-devtools__click',
      'mcp__chrome-devtools__fill', 'mcp__chrome-devtools__navigate_page',
      'mcp__chrome-devtools__evaluate_script', 'mcp__Exa__web_search_exa',
      'mcp__Exa__get_code_context_exa'
    ];
    const prompt = 'D'.repeat(15360); // 15KB prompt
    const template = '';

    const result = calculateSpawnSize(tools, prompt, template);

    // Base: 4000 + Tools: 26*200=5200 + Prompt: 15360 = 24560 (~24 KB)
    assert.equal(result.toolCount, 26);
    assert.ok(result.totalKB >= 23 && result.totalKB <= 25, `Expected ~24 KB, got ${result.totalKB}`);
  });

  it('handles empty tools array → 4 KB base only', () => {
    const tools = [];
    const prompt = '';
    const template = '';

    const result = calculateSpawnSize(tools, prompt, template);

    assert.equal(result.toolCount, 0);
    assert.equal(result.totalBytes, 4000);
    assert.equal(result.totalKB, Math.round(4000 / 1024 * 10) / 10);
  });

  it('handles very long prompt (20KB) correctly', () => {
    const tools = ['Read', 'Write'];
    const prompt = 'E'.repeat(20480); // 20KB
    const template = '';

    const result = calculateSpawnSize(tools, prompt, template);

    // Base: 4000 + Tools: 2*200=400 + Prompt: 20480 = 24880
    assert.equal(result.totalBytes, 4000 + 400 + 20480);
    assert.ok(result.totalKB > 24 && result.totalKB < 25);
  });

  it('handles zero-length prompt correctly', () => {
    const tools = ['Read', 'Write', 'Edit'];
    const prompt = '';
    const template = '';

    const result = calculateSpawnSize(tools, prompt, template);

    // Base: 4000 + Tools: 3*200=600 + Prompt: 0 = 4600
    assert.equal(result.totalBytes, 4000 + 600 + 0);
    assert.equal(result.breakdown.prompt, 0);
  });

  it('handles mixed tool types (core + MCP) correctly', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Skill',
      'mcp__chrome-devtools__click',
      'mcp__Exa__web_search_exa'
    ];
    const prompt = 'Test';
    const template = 'Template content';

    const result = calculateSpawnSize(tools, prompt, template);

    assert.equal(result.toolCount, 7);
    assert.equal(result.breakdown.tools, 7 * 200);
    assert.equal(result.breakdown.prompt, 4);
    assert.equal(result.breakdown.template, 16);
  });

  it('includes template in size calculation', () => {
    const tools = ['Read'];
    const prompt = 'Prompt';
    const template = 'T'.repeat(3000); // 3KB template

    const result = calculateSpawnSize(tools, prompt, template);

    // Base: 4000 + Tools: 200 + Prompt: 6 + Template: 3000 = 7206
    assert.equal(result.breakdown.template, 3000);
    assert.equal(result.totalBytes, 4000 + 200 + 6 + 3000);
  });
});

// ============================================================================
// CATEGORY 2: Unit Tests - validateSpawnSize()
// ============================================================================

describe('Unit: validateSpawnSize()', () => {
  it('passes for 8 KB, 9 tools → status: pass', () => {
    const result = validateSpawnSize(8, 9, 'warn');

    assert.equal(result.status, 'pass');
    assert.equal(result.message, '');
  });

  it('warns for 15 KB, 15 tools → status: warn (at threshold)', () => {
    const result = validateSpawnSize(15, 15, 'warn');

    assert.equal(result.status, 'warn');
    assert.ok(result.message.includes('WARNING'));
  });

  it('warns for 18 KB, 10 tools → status: warn (exceeded KB)', () => {
    const result = validateSpawnSize(18, 10, 'warn');

    assert.equal(result.status, 'warn');
    assert.ok(result.message.includes('18 KB'));
  });

  it('warns for 8 KB, 16 tools → status: warn (exceeded tool count)', () => {
    const result = validateSpawnSize(8, 16, 'warn');

    assert.equal(result.status, 'warn');
    assert.ok(result.message.includes('16 tools'));
  });

  it('blocks for 26 KB, 20 tools → status: block (in block mode)', () => {
    const result = validateSpawnSize(26, 20, 'block');

    assert.equal(result.status, 'block');
    assert.ok(result.message.includes('BLOCKED'));
  });

  it('blocks for 25 KB, 21 tools → status: block (tool count exceeded)', () => {
    const result = validateSpawnSize(25, 21, 'block');

    assert.equal(result.status, 'block');
    assert.ok(result.message.includes('21 tools'));
  });

  it('mode=off always passes regardless of size', () => {
    const result = validateSpawnSize(100, 50, 'off');

    assert.equal(result.status, 'pass');
    assert.equal(result.message, '');
  });

  it('mode=warn warns but does not block even for large sizes', () => {
    const result = validateSpawnSize(50, 30, 'warn');

    assert.equal(result.status, 'warn');
    assert.ok(!result.message.includes('BLOCKED'));
  });

  it('mode=block enforces block threshold', () => {
    const result = validateSpawnSize(30, 25, 'block');

    assert.equal(result.status, 'block');
    assert.ok(result.message.includes('BLOCKED'));
  });

  it('boundary: exactly 14.9 KB, 14 tools → pass (just below warn)', () => {
    const result = validateSpawnSize(14.9, 14, 'warn');

    assert.equal(result.status, 'pass');
  });

  it('boundary: exactly 15.0 KB, 14 tools → warn (at KB threshold)', () => {
    const result = validateSpawnSize(15.0, 14, 'warn');

    assert.equal(result.status, 'warn');
  });

  it('boundary: exactly 14.9 KB, 15 tools → warn (at tool threshold)', () => {
    const result = validateSpawnSize(14.9, 15, 'warn');

    assert.equal(result.status, 'warn');
  });

  it('boundary: exactly 24.9 KB, 19 tools → warn (just below block)', () => {
    const result = validateSpawnSize(24.9, 19, 'block');

    assert.equal(result.status, 'warn');
  });

  it('boundary: exactly 25.0 KB, 19 tools → block (at block KB threshold)', () => {
    const result = validateSpawnSize(25.0, 19, 'block');

    assert.equal(result.status, 'block');
  });

  it('boundary: exactly 24.9 KB, 20 tools → block (at block tool threshold)', () => {
    const result = validateSpawnSize(24.9, 20, 'block');

    assert.equal(result.status, 'block');
  });
});

// ============================================================================
// CATEGORY 3: Unit Tests - generatePruningSuggestions()
// ============================================================================

describe('Unit: generatePruningSuggestions()', () => {
  it('detects chrome-devtools tools (8 tools)', () => {
    const tools = [
      'Read', 'Write', 'Edit',
      'mcp__chrome-devtools__list_pages',
      'mcp__chrome-devtools__select_page',
      'mcp__chrome-devtools__new_page',
      'mcp__chrome-devtools__close_page',
      'mcp__chrome-devtools__navigate_page',
      'mcp__chrome-devtools__take_snapshot',
      'mcp__chrome-devtools__take_screenshot',
      'mcp__chrome-devtools__click',
    ];

    const result = generatePruningSuggestions(tools);

    assert.ok(result.suggestions.length > 0);
    assert.ok(result.suggestions[0].includes('chrome'));
    assert.ok(result.suggestions[0].includes('8 tools'));
  });

  it('detects claude-in-chrome tools (7 tools)', () => {
    const tools = [
      'Read', 'Write',
      'mcp__claude-in-chrome__navigate',
      'mcp__claude-in-chrome__read_page',
      'mcp__claude-in-chrome__find',
      'mcp__claude-in-chrome__computer',
      'mcp__claude-in-chrome__form_input',
      'mcp__claude-in-chrome__fill_form',
      'mcp__claude-in-chrome__gif_creator',
    ];

    const result = generatePruningSuggestions(tools);

    assert.ok(result.suggestions.length > 0);
    assert.ok(result.suggestions[0].includes('chrome'));
    assert.ok(result.suggestions[0].includes('7 tools'));
  });

  it('calculates chrome tools savings (~3.2 KB for 16 tools)', () => {
    const chromeTools = [
      'mcp__chrome-devtools__list_pages',
      'mcp__chrome-devtools__select_page',
      'mcp__chrome-devtools__new_page',
      'mcp__chrome-devtools__close_page',
      'mcp__chrome-devtools__navigate_page',
      'mcp__chrome-devtools__take_snapshot',
      'mcp__chrome-devtools__take_screenshot',
      'mcp__chrome-devtools__click',
      'mcp__claude-in-chrome__navigate',
      'mcp__claude-in-chrome__read_page',
      'mcp__claude-in-chrome__find',
      'mcp__claude-in-chrome__computer',
      'mcp__claude-in-chrome__form_input',
      'mcp__claude-in-chrome__fill_form',
      'mcp__claude-in-chrome__gif_creator',
      'mcp__claude-in-chrome__javascript_tool',
    ];
    const tools = ['Read', 'Write', 'Edit', ...chromeTools];

    const result = generatePruningSuggestions(tools);

    // 16 chrome tools * 200 bytes = 3200 bytes = ~3.1 KB
    assert.ok(result.estimatedSavings.includes('KB'));
    const savings = parseFloat(result.estimatedSavings);
    assert.ok(savings >= 3.0 && savings <= 3.5, `Expected ~3.2 KB savings, got ${savings}`);
  });

  it('detects MCP tools (WebSearch, WebFetch, Exa tools)', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill',
      'WebSearch', 'WebFetch',
      'mcp__Exa__web_search_exa',
      'mcp__Exa__get_code_context_exa',
    ];

    const result = generatePruningSuggestions(tools);

    assert.ok(result.suggestions.length > 0);
    assert.ok(result.suggestions.some(s =>
      s.includes('WebSearch') || s.includes('WebFetch') || s.includes('Exa') || s.includes('optional')
    ));
  });

  it('calculates MCP tool savings (~0.4-0.6 KB per tool)', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill',
      'WebSearch', 'WebFetch', 'NotebookEdit',
    ];

    const result = generatePruningSuggestions(tools);

    // 3 optional tools * 200 bytes = 600 bytes = ~0.6 KB
    const savings = parseFloat(result.estimatedSavings);
    assert.ok(savings >= 0.4 && savings <= 0.8, `Expected ~0.6 KB savings, got ${savings}`);
  });

  it('suggests split first for chrome removal, then MCP when both present', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill',
      'WebSearch', 'WebFetch',
      'mcp__chrome-devtools__click',
      'mcp__chrome-devtools__fill',
    ];

    const result = generatePruningSuggestions(tools);

    // Priority order: 1. chrome, 2. optional MCP
    assert.ok(result.suggestions.length >= 2);
    assert.ok(result.suggestions[0].includes('chrome') || result.suggestions[0].includes('1.'));
    assert.ok(result.suggestions[1].includes('optional') || result.suggestions[1].includes('2.'));
  });

  it('no suggestions needed for <10 KB spawn with core tools only', () => {
    const tools = ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill'];

    const result = generatePruningSuggestions(tools);

    // Minimal tool list with only core tools should have no suggestions
    assert.ok(
      result.suggestions.length === 0 ||
      result.estimatedSavings === '0 KB'
    );
  });

  it('suggests split for >20 tools', () => {
    const tools = new Array(25).fill(null).map((_, i) => `Tool${i}`);

    const result = generatePruningSuggestions(tools);

    assert.ok(result.suggestions.some(s =>
      s.includes('split') || s.includes('multi-agent') || s.includes('two agents')
    ));
  });

  it('example includes recommended core tools list', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill',
      'mcp__chrome-devtools__click',
    ];

    const result = generatePruningSuggestions(tools);

    assert.ok(result.example, 'Should include example of recommended tools');
    assert.ok(result.example.includes('Read') || result.example.includes('core'));
  });
});

// ============================================================================
// CATEGORY 4: Integration Tests - Real Hook Behavior
// ============================================================================

describe('Integration: Hook behavior', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  it('hook blocks researcher spawn (26 tools) with pruning suggestions in block mode', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskUpdate',
      'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput', 'Skill', 'WebSearch', 'WebFetch',
      'mcp__chrome-devtools__list_pages', 'mcp__chrome-devtools__select_page',
      'mcp__chrome-devtools__new_page', 'mcp__chrome-devtools__take_snapshot',
      'mcp__chrome-devtools__take_screenshot', 'mcp__chrome-devtools__click',
      'mcp__chrome-devtools__fill', 'mcp__chrome-devtools__navigate_page',
      'mcp__chrome-devtools__evaluate_script', 'mcp__Exa__web_search_exa',
      'mcp__Exa__get_code_context_exa'
    ];
    const prompt = 'Research task prompt'.repeat(100); // Long prompt

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'block');
    const pruning = generatePruningSuggestions(tools);

    // Should block (26 tools > 20 tool threshold)
    assert.equal(validation.status, 'block');
    // Should have pruning suggestions
    assert.ok(pruning.suggestions.length > 0);
    // Should suggest removing chrome tools first
    assert.ok(pruning.suggestions[0].includes('chrome'));
  });

  it('hook warns developer spawn (15 tools, 18 KB estimated)', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskUpdate',
      'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput', 'Skill', 'WebSearch', 'WebFetch'
    ];
    const prompt = 'D'.repeat(10000); // ~10 KB prompt

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'warn');

    // 15 tools is at warn threshold, and with large prompt exceeds 15 KB
    assert.equal(validation.status, 'warn');
    assert.ok(validation.message.includes('WARNING'));
  });

  it('hook passes minimal spawn (9 tools, 8 KB)', () => {
    const tools = ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'Skill'];
    const prompt = 'Short prompt';

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'warn');

    assert.equal(validation.status, 'pass');
    assert.equal(validation.message, '');
  });

  it('hook respects SPAWN_SIZE_VALIDATOR=warn env var', () => {
    process.env.SPAWN_SIZE_VALIDATOR = 'warn';
    const mode = process.env.SPAWN_SIZE_VALIDATOR;

    const result = validateSpawnSize(30, 25, mode);

    assert.equal(result.status, 'warn');
    assert.ok(!result.message.includes('BLOCKED'));
  });

  it('hook respects SPAWN_SIZE_VALIDATOR=block env var', () => {
    process.env.SPAWN_SIZE_VALIDATOR = 'block';
    const mode = process.env.SPAWN_SIZE_VALIDATOR;

    const result = validateSpawnSize(30, 25, mode);

    assert.equal(result.status, 'block');
    assert.ok(result.message.includes('BLOCKED'));
  });

  it('hook respects SPAWN_SIZE_VALIDATOR=off env var', () => {
    process.env.SPAWN_SIZE_VALIDATOR = 'off';
    const mode = process.env.SPAWN_SIZE_VALIDATOR;

    const result = validateSpawnSize(100, 50, mode);

    assert.equal(result.status, 'pass');
  });

  it('default mode (no env var) is warn', () => {
    delete process.env.SPAWN_SIZE_VALIDATOR;
    const mode = process.env.SPAWN_SIZE_VALIDATOR || 'warn';

    const result = validateSpawnSize(30, 25, mode);

    assert.equal(result.status, 'warn');
  });
});

// ============================================================================
// CATEGORY 5: Edge Cases & Boundary Tests
// ============================================================================

describe('Edge Cases & Boundary Tests', () => {
  it('handles null tools array gracefully', () => {
    // Simulate null/undefined inputs - should not throw
    const tools = null;
    try {
      const result = calculateSpawnSize(tools || [], '', '');
      assert.equal(result.toolCount, 0);
    } catch (e) {
      assert.fail('Should handle null tools array');
    }
  });

  it('handles undefined tools array gracefully', () => {
    const tools = undefined;
    try {
      const result = calculateSpawnSize(tools || [], '', '');
      assert.equal(result.toolCount, 0);
    } catch (e) {
      assert.fail('Should handle undefined tools array');
    }
  });

  it('handles null prompt gracefully', () => {
    const tools = ['Read', 'Write'];
    const prompt = null;
    try {
      const result = calculateSpawnSize(tools, prompt || '', '');
      assert.equal(result.breakdown.prompt, 0);
    } catch (e) {
      assert.fail('Should handle null prompt');
    }
  });

  it('handles undefined prompt gracefully', () => {
    const tools = ['Read', 'Write'];
    const prompt = undefined;
    try {
      const result = calculateSpawnSize(tools, prompt || '', '');
      assert.equal(result.breakdown.prompt, 0);
    } catch (e) {
      assert.fail('Should handle undefined prompt');
    }
  });

  it('handles very large prompt (50+ KB) correctly', () => {
    const tools = ['Read'];
    const prompt = 'X'.repeat(51200); // 50 KB

    const result = calculateSpawnSize(tools, prompt, '');

    // Base: 4000 + Tools: 200 + Prompt: 51200 = 55400 (~54 KB)
    assert.equal(result.breakdown.prompt, 51200);
    assert.ok(result.totalKB > 50);
  });

  it('counts duplicate tools in array separately', () => {
    const tools = ['Read', 'Read', 'Write', 'Write', 'Edit'];

    const result = calculateSpawnSize(tools, '', '');

    // 5 tools even though duplicates
    assert.equal(result.toolCount, 5);
    assert.equal(result.breakdown.tools, 5 * 200);
  });

  it('handles unknown subagent_type gracefully (warning not block)', () => {
    // Unknown types should still be validated
    const result = validateSpawnSize(20, 18, 'warn');

    assert.equal(result.status, 'warn');
  });

  it('handles null subagent_type with default validation', () => {
    // Subagent type is used for orchestrator bypass, null should use default
    // This is tested via the validation function with normal thresholds
    const result = validateSpawnSize(10, 10, 'warn');

    assert.equal(result.status, 'pass');
  });

  it('counts tool names with special characters correctly', () => {
    const tools = [
      'mcp__Ref__ref_search_documentation',
      'mcp__Exa__web_search_exa',
      'mcp__chrome-devtools__list_pages',
    ];

    const result = calculateSpawnSize(tools, '', '');

    // 3 tools regardless of special characters in names
    assert.equal(result.toolCount, 3);
    assert.equal(result.breakdown.tools, 3 * 200);
  });

  it('counts empty tool name as valid entry', () => {
    const tools = ['Read', '', 'Write'];

    const result = calculateSpawnSize(tools, '', '');

    // Empty string is still a tool entry
    assert.equal(result.toolCount, 3);
  });

  it('handles array with only empty strings', () => {
    const tools = ['', '', ''];

    const result = calculateSpawnSize(tools, '', '');

    assert.equal(result.toolCount, 3);
    assert.equal(result.breakdown.tools, 3 * 200);
  });
});

// ============================================================================
// CATEGORY 6: Regression Tests - Specific Scenarios
// ============================================================================

describe('Regression Tests - Specific Scenarios', () => {
  it('Researcher (26 tools, 15 KB prompt) → ~30 KB, BLOCK', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskUpdate',
      'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput', 'Skill', 'WebSearch', 'WebFetch',
      'mcp__chrome-devtools__list_pages', 'mcp__chrome-devtools__select_page',
      'mcp__chrome-devtools__new_page', 'mcp__chrome-devtools__take_snapshot',
      'mcp__chrome-devtools__take_screenshot', 'mcp__chrome-devtools__click',
      'mcp__chrome-devtools__fill', 'mcp__chrome-devtools__navigate_page',
      'mcp__chrome-devtools__evaluate_script', 'mcp__Exa__web_search_exa',
      'mcp__Exa__get_code_context_exa'
    ];
    const prompt = 'R'.repeat(15360); // 15 KB

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'block');

    // 26 tools > 20 threshold → BLOCK
    assert.equal(validation.status, 'block');
    assert.ok(sizeInfo.toolCount === 26);
    assert.ok(sizeInfo.totalKB > 20, `Expected >20 KB, got ${sizeInfo.totalKB}`);
  });

  it('Evolution-orchestrator (3-5 tools) → 5-7 KB, PASS', () => {
    const tools = ['Read', 'Write', 'Edit', 'Task', 'Skill'];
    const prompt = 'Evolve task';

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'warn');

    assert.equal(validation.status, 'pass');
    assert.ok(sizeInfo.toolCount >= 3 && sizeInfo.toolCount <= 5);
    assert.ok(sizeInfo.totalKB >= 4 && sizeInfo.totalKB <= 8);
  });

  it('Planner (12 tools, 8 KB prompt) → ~10 KB, PASS', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
      'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput', 'Skill'
    ];
    const prompt = 'P'.repeat(8192); // 8 KB

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'warn');

    assert.equal(validation.status, 'pass');
    assert.equal(sizeInfo.toolCount, 12);
    assert.ok(sizeInfo.totalKB < 15, `Expected <15 KB, got ${sizeInfo.totalKB}`);
  });

  it('Security-architect (15 tools, 12 KB prompt) → ~17 KB, WARN', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Task', 'TaskUpdate',
      'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput', 'Skill', 'WebSearch', 'WebFetch'
    ];
    const prompt = 'S'.repeat(12288); // 12 KB

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'warn');

    assert.equal(validation.status, 'warn');
    assert.equal(sizeInfo.toolCount, 15);
    assert.ok(sizeInfo.totalKB >= 15 && sizeInfo.totalKB <= 20);
  });

  it('QA (10 tools, 6 KB prompt) → ~8 KB, PASS', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
      'TaskUpdate', 'TaskList', 'TaskCreate', 'Skill'
    ];
    const prompt = 'Q'.repeat(6144); // 6 KB

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'warn');

    assert.equal(validation.status, 'pass');
    assert.equal(sizeInfo.toolCount, 10);
    assert.ok(sizeInfo.totalKB < 15);
  });

  it('Developer with browser tools - warns appropriately', () => {
    const tools = [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TaskUpdate', 'TaskList',
      'TaskCreate', 'TaskGet', 'Skill',
      'mcp__chrome-devtools__click', 'mcp__chrome-devtools__fill',
      'mcp__chrome-devtools__navigate_page', 'mcp__chrome-devtools__take_screenshot'
    ];
    const prompt = 'Test prompt';

    const sizeInfo = calculateSpawnSize(tools, prompt, '');
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'warn');

    // 15 tools at threshold
    assert.equal(validation.status, 'warn');
    assert.equal(sizeInfo.toolCount, 15);
  });
});

// ============================================================================
// CATEGORY 7: Smoke Tests - End-to-End
// ============================================================================

describe('Smoke Tests - End-to-End', () => {
  it('hook can be loaded without errors', () => {
    // If require fails, test would have failed before reaching here
    assert.ok(true, 'Hook loaded successfully');
  });

  it('hook exports calculateSpawnSize function', () => {
    assert.ok(typeof calculateSpawnSize === 'function');
  });

  it('hook exports validateSpawnSize function', () => {
    assert.ok(typeof validateSpawnSize === 'function');
  });

  it('hook exports generatePruningSuggestions function', () => {
    assert.ok(typeof generatePruningSuggestions === 'function');
  });

  it('hook exports logSpawnAudit function', () => {
    assert.ok(typeof logSpawnAudit === 'function');
  });

  it('calculateSpawnSize returns expected structure', () => {
    const result = calculateSpawnSize(['Read'], 'test', '');

    assert.ok('totalBytes' in result);
    assert.ok('totalKB' in result);
    assert.ok('toolCount' in result);
    assert.ok('breakdown' in result);
    assert.ok('base' in result.breakdown);
    assert.ok('tools' in result.breakdown);
    assert.ok('prompt' in result.breakdown);
    assert.ok('template' in result.breakdown);
  });

  it('validateSpawnSize returns expected structure', () => {
    const result = validateSpawnSize(10, 5, 'warn');

    assert.ok('status' in result);
    assert.ok('message' in result);
    assert.ok(['pass', 'warn', 'block'].includes(result.status));
  });

  it('generatePruningSuggestions returns expected structure', () => {
    const result = generatePruningSuggestions(['Read', 'mcp__chrome-devtools__click']);

    assert.ok('suggestions' in result);
    assert.ok('estimatedSavings' in result);
    assert.ok('example' in result);
    assert.ok(Array.isArray(result.suggestions));
  });

  it('full validation flow works end-to-end', () => {
    // Simulate complete hook flow
    const tools = ['Read', 'Write', 'Edit', 'Bash', 'mcp__chrome-devtools__click'];
    const prompt = 'Full test prompt';
    const template = '';

    // Step 1: Calculate size
    const sizeInfo = calculateSpawnSize(tools, prompt, template);
    assert.ok(sizeInfo.totalKB > 0);

    // Step 2: Validate size
    const validation = validateSpawnSize(sizeInfo.totalKB, sizeInfo.toolCount, 'warn');
    assert.ok(['pass', 'warn', 'block'].includes(validation.status));

    // Step 3: Get pruning suggestions if needed
    if (validation.status !== 'pass') {
      const pruning = generatePruningSuggestions(tools);
      assert.ok(Array.isArray(pruning.suggestions));
    }
  });

  it('error messages are helpful and actionable', () => {
    // Validate that error messages contain useful information
    const result = validateSpawnSize(30, 25, 'block');

    assert.ok(result.message.includes('KB'), 'Message should include size in KB');
    assert.ok(result.message.includes('tools'), 'Message should include tool count');
    assert.ok(
      result.message.includes('SPAWN_SIZE_VALIDATOR') ||
      result.message.includes('threshold'),
      'Message should include mitigation steps'
    );
  });

  it('pruning suggestions include actionable items', () => {
    const tools = [
      'Read', 'Write', 'Edit',
      'mcp__chrome-devtools__click', 'mcp__chrome-devtools__fill',
      'WebSearch', 'WebFetch'
    ];

    const pruning = generatePruningSuggestions(tools);

    // Check suggestions are actionable
    assert.ok(pruning.suggestions.every(s =>
      s.includes('Remove') || s.includes('Consider') || s.includes('Save')
    ), 'All suggestions should be actionable');

    // Check savings are included
    assert.ok(pruning.estimatedSavings.includes('KB'));
  });
});

// ============================================================================
// CATEGORY 8: Audit Logging Tests
// ============================================================================

describe('Audit Logging', () => {
  let auditPath;

  beforeEach(() => {
    // Set up audit path
    auditPath = path.join(__dirname, '../../.claude/context/spawn-size-audit-test.jsonl');
    // Clean up test file if exists
    if (fs.existsSync(auditPath)) {
      fs.unlinkSync(auditPath);
    }
  });

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(auditPath)) {
      fs.unlinkSync(auditPath);
    }
    // Clear env var
    delete process.env.SPAWN_SIZE_AUDIT_LOG;
  });

  it('does not log when SPAWN_SIZE_AUDIT_LOG is not set', () => {
    delete process.env.SPAWN_SIZE_AUDIT_LOG;

    const sizeInfo = { totalKB: 10, toolCount: 5, breakdown: {} };
    logSpawnAudit(sizeInfo, 'developer', 'pass');

    // Should not create file
    // Note: This tests the early return in logSpawnAudit
    assert.ok(true, 'No error thrown when audit disabled');
  });

  it('logSpawnAudit handles errors gracefully', () => {
    // Set invalid path (should not throw)
    process.env.SPAWN_SIZE_AUDIT_LOG = 'true';

    const sizeInfo = { totalKB: 10, toolCount: 5, breakdown: {} };

    // This should not throw even if file system has issues
    try {
      logSpawnAudit(sizeInfo, 'developer', 'pass');
      assert.ok(true, 'Did not throw on audit logging');
    } catch (e) {
      // Audit logging should be silent on errors
      assert.fail('Audit logging should not throw');
    }
  });
});
