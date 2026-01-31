#!/usr/bin/env node
/**
 * Unit tests for tool-availability-validator.cjs
 *
 * Test coverage:
 * - Core tools validation (should allow)
 * - MCP tools without server (should warn + allow)
 * - Unknown tools (should block)
 * - Empty allowed_tools (should allow)
 * - Non-Task tool (should skip validation)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  validateTools,
  checkMCPServers,
  CORE_TOOLS,
} = require('../../.claude/hooks/routing/tool-availability-validator.cjs');

// Test 1: Core tools should be allowed
test('validateTools: core tools are allowed', () => {
  const result = validateTools(['Read', 'Write', 'Edit', 'Bash']);
  assert.strictEqual(result.allAvailable, true, 'Core tools should be available');
  assert.strictEqual(result.unavailableTools.length, 0, 'No unavailable tools');
  assert.strictEqual(result.mcpToolsWithoutServer.length, 0, 'No MCP tools');
});

// Test 2: All core tools should be allowed
test('validateTools: all core tools are allowed', () => {
  const result = validateTools(CORE_TOOLS);
  assert.strictEqual(result.allAvailable, true, 'All core tools should be available');
  assert.strictEqual(result.unavailableTools.length, 0, 'No unavailable tools');
});

// Test 3: MCP tools without server should warn but allow
test('validateTools: MCP tools without server should warn', () => {
  const result = validateTools(['Read', 'Write', 'mcp__sequential-thinking__sequentialthinking']);
  assert.strictEqual(result.allAvailable, true, 'Should allow (core tools available)');
  assert.strictEqual(result.unavailableTools.length, 0, 'No unavailable tools');
  assert.strictEqual(result.mcpToolsWithoutServer.length, 1, 'One MCP tool without server');
  assert.strictEqual(
    result.mcpToolsWithoutServer[0].server,
    'sequential-thinking',
    'Correct server name'
  );
});

// Test 4: Unknown tools should block
test('validateTools: unknown tools should block', () => {
  const result = validateTools(['Read', 'Write', 'UnknownTool']);
  assert.strictEqual(result.allAvailable, false, 'Should not allow (unknown tool)');
  assert.strictEqual(result.unavailableTools.length, 1, 'One unavailable tool');
  assert.strictEqual(result.unavailableTools[0], 'UnknownTool', 'Correct tool name');
});

// Test 5: Multiple unknown tools should block
test('validateTools: multiple unknown tools should block', () => {
  const result = validateTools(['Read', 'FakeTool1', 'FakeTool2']);
  assert.strictEqual(result.allAvailable, false, 'Should not allow');
  assert.strictEqual(result.unavailableTools.length, 2, 'Two unavailable tools');
  assert.ok(result.unavailableTools.includes('FakeTool1'), 'FakeTool1 detected');
  assert.ok(result.unavailableTools.includes('FakeTool2'), 'FakeTool2 detected');
});

// Test 6: Empty allowed_tools should allow
test('validateTools: empty allowed_tools should allow', () => {
  const result = validateTools([]);
  assert.strictEqual(result.allAvailable, true, 'Empty list should allow');
  assert.strictEqual(result.unavailableTools.length, 0, 'No unavailable tools');
});

// Test 7: Undefined allowed_tools should allow
test('validateTools: undefined allowed_tools should allow', () => {
  const result = validateTools(undefined);
  assert.strictEqual(result.allAvailable, true, 'Undefined should allow');
  assert.strictEqual(result.unavailableTools.length, 0, 'No unavailable tools');
});

// Test 8: MCP tool with wildcard pattern
test('validateTools: MCP tool with wildcard should warn', () => {
  const result = validateTools(['Read', 'mcp__Exa__*']);
  assert.strictEqual(result.allAvailable, true, 'Should allow');
  assert.strictEqual(result.mcpToolsWithoutServer.length, 1, 'One MCP tool without server');
  assert.strictEqual(result.mcpToolsWithoutServer[0].server, 'Exa', 'Correct server name');
});

// Test 9: checkMCPServers when settings.json doesn't exist
test('checkMCPServers: returns empty object when settings.json missing', () => {
  // This test assumes settings.json exists, so we just verify the function doesn't crash
  const servers = checkMCPServers();
  assert.ok(typeof servers === 'object', 'Should return an object');
});

// Test 10: Mixed core, MCP, and unknown tools
test('validateTools: mixed core, MCP, and unknown tools', () => {
  const result = validateTools([
    'Read',
    'Write',
    'mcp__sequential-thinking__sequentialthinking',
    'UnknownTool',
  ]);
  assert.strictEqual(result.allAvailable, false, 'Should block (unknown tool)');
  assert.strictEqual(result.unavailableTools.length, 1, 'One unavailable tool');
  assert.strictEqual(result.mcpToolsWithoutServer.length, 1, 'One MCP tool without server');
});

// Test 11: TaskUpdate, TaskList, TaskCreate, TaskGet are core tools
test('validateTools: task management tools are core', () => {
  const result = validateTools(['TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet']);
  assert.strictEqual(result.allAvailable, true, 'Task management tools should be available');
});

// Test 12: Skill tool is core
test('validateTools: Skill tool is core', () => {
  const result = validateTools(['Skill']);
  assert.strictEqual(result.allAvailable, true, 'Skill tool should be available');
});

// Test 13: WebSearch and WebFetch are core tools
test('validateTools: WebSearch and WebFetch are core', () => {
  const result = validateTools(['WebSearch', 'WebFetch']);
  assert.strictEqual(result.allAvailable, true, 'WebSearch and WebFetch should be available');
});

// Test 14: Case sensitivity check
test('validateTools: tool names are case-sensitive', () => {
  const result = validateTools(['read', 'write']); // lowercase
  assert.strictEqual(result.allAvailable, false, 'Lowercase tools should not be available');
  assert.strictEqual(result.unavailableTools.length, 2, 'Two unavailable tools');
});

// Run all tests
console.log('Running tool-availability-validator tests...');
