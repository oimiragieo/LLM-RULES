#!/usr/bin/env node
/**
 * Pre-Spawn Tool Validator Hook - Unit Tests
 * ============================================
 *
 * Tests for the pre-spawn-tool-validator.cjs hook that validates
 * agent tool configurations BEFORE spawning via Task().
 *
 * Test categories:
 * 1. Tool existence checks
 * 2. Tool availability checks (MCP fallbacks)
 * 3. Tool count limits
 * 4. Reserved tool validation
 * 5. Edge cases and backward compatibility
 * 6. Hook integration
 *
 * @module pre-spawn-tool-validator.test
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// We will import the module after it's created
let validator;
const HOOK_PATH = path.join(__dirname, '../../.claude/hooks/routing/pre-spawn-tool-validator.cjs');

// Test data
const VALID_DEVELOPER_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'TaskUpdate',
  'TaskList',
  'TaskCreate',
  'TaskGet',
  'TaskOutput',
  'Skill',
];

const VALID_ORCHESTRATOR_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'Task',
  'TaskUpdate',
  'TaskList',
  'TaskCreate',
  'TaskGet',
  'TaskOutput',
  'Skill',
];

const _ROUTER_RESERVED_TOOLS = ['Task', 'AskUserQuestion'];

describe('pre-spawn-tool-validator', () => {
  beforeEach(() => {
    // Clear require cache to ensure fresh module load
    delete require.cache[HOOK_PATH];

    // Load the module (will fail until we implement it)
    try {
      validator = require(HOOK_PATH);
    } catch (_e) {
      // Module doesn't exist yet - expected during RED phase
      validator = null;
    }
  });

  // ======================================================================
  // 1. Tool Existence Checks
  // ======================================================================

  describe('Tool Existence Validation', () => {
    it('should allow valid developer spawn with default tools', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: VALID_DEVELOPER_TOOLS,
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('should allow valid orchestrator spawn with Task tool', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: VALID_ORCHESTRATOR_TOOLS,
        agentType: 'master-orchestrator',
      });

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('should block spawn with unknown tool name', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'FakeTool123'],
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('FakeTool123')));
      assert.ok(result.errors.some(e => e.includes('not found')));
    });

    it('should report multiple unknown tools', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'FakeA', 'FakeB', 'FakeC'],
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length >= 3);
    });
  });

  // ======================================================================
  // 2. Tool Availability Checks (MCP Fallbacks)
  // ======================================================================

  describe('MCP Tool Availability Validation', () => {
    it('should block spawn with unavailable MCP tool (no fallback)', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'mcp__unknown_server__unknown_tool'],
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('mcp__unknown_server__unknown_tool')));
    });

    it('should warn spawn with unavailable MCP tool (with fallback)', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      // Known MCP tools with fallbacks should warn, not block
      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'mcp__sequential-thinking__sequentialthinking'],
        agentType: 'developer',
      });

      // Should allow but with warning
      assert.strictEqual(result.valid, true);
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some(w => w.includes('fallback') || w.includes('Skill')));
    });

    it('should provide suggestion for known MCP fallbacks', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'mcp__Exa__web_search_exa'],
        agentType: 'researcher',
      });

      // Should suggest using WebSearch as fallback
      assert.ok(result.suggestions || result.warnings);
      const allMessages = [...(result.suggestions || []), ...(result.warnings || [])];
      assert.ok(allMessages.some(m => m.includes('WebSearch') || m.includes('fallback')));
    });
  });

  // ======================================================================
  // 3. Tool Count Limits
  // ======================================================================

  describe('Tool Count Limits', () => {
    it('should block spawn with too many tools (>15 for agent)', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      // Generate 20 tools (over the 15 limit)
      const tooManyTools = [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'TaskUpdate',
        'TaskList',
        'TaskCreate',
        'TaskGet',
        'TaskOutput',
        'TaskStop',
        'Skill',
        'WebSearch',
        'WebFetch',
        'NotebookEdit',
        'EnterPlanMode',
        'ExitPlanMode',
        'AskUserQuestion',
        'Task',
      ];

      const result = validator.validateToolConfig({
        tools: tooManyTools,
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('maximum') || e.includes('15')));
    });

    it('should use correct tool limit for orchestrator (18 vs 15)', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      // 16 tools - over limit for agent (15) but under for orchestrator (18)
      const sixteenTools = [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'Task',
        'TaskUpdate',
        'TaskList',
        'TaskCreate',
        'TaskGet',
        'TaskOutput',
        'TaskStop',
        'Skill',
        'WebSearch',
        'WebFetch',
      ];

      const result = validator.validateToolConfig({
        tools: sixteenTools,
        agentType: 'master-orchestrator',
      });

      // Should be valid for orchestrator (under 18 limit)
      assert.strictEqual(result.valid, true);
    });

    it('should block orchestrator with more than 18 tools', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      // 20 tools - over limit even for orchestrator
      const tooManyTools = [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'Task',
        'TaskUpdate',
        'TaskList',
        'TaskCreate',
        'TaskGet',
        'TaskOutput',
        'TaskStop',
        'Skill',
        'WebSearch',
        'WebFetch',
        'NotebookEdit',
        'EnterPlanMode',
        'ExitPlanMode',
        'AskUserQuestion',
      ];

      const result = validator.validateToolConfig({
        tools: tooManyTools,
        agentType: 'evolution-orchestrator',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('maximum') || e.includes('18')));
    });

    it('should allow exactly 15 tools for standard agent', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const exactlyFifteen = [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'TaskUpdate',
        'TaskList',
        'TaskCreate',
        'TaskGet',
        'TaskOutput',
        'Skill',
        'WebSearch',
        'WebFetch',
        'NotebookEdit',
      ];

      const result = validator.validateToolConfig({
        tools: exactlyFifteen,
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, true);
    });
  });

  // ======================================================================
  // 4. Reserved Tool Validation
  // ======================================================================

  describe('Reserved Tool Validation', () => {
    it('should block developer spawn with Task tool', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'Task'],
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('Task') && e.includes('reserved')));
    });

    it('should block developer spawn with AskUserQuestion', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'AskUserQuestion'],
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('AskUserQuestion') && e.includes('reserved')));
    });

    it('should allow orchestrator spawn with Task tool', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'Task', 'TaskUpdate', 'Skill'],
        agentType: 'master-orchestrator',
      });

      assert.strictEqual(result.valid, true);
    });

    it('should list allowed agents in error message for reserved tools', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Task'],
        agentType: 'qa',
      });

      assert.strictEqual(result.valid, false);
      // Error should mention which agents CAN use Task
      assert.ok(
        result.errors.some(
          e => e.includes('router') || e.includes('orchestrator') || e.includes('reserved for')
        )
      );
    });
  });

  // ======================================================================
  // 5. Edge Cases and Backward Compatibility
  // ======================================================================

  describe('Edge Cases and Backward Compatibility', () => {
    it('should allow backward-compatible spawn (no allowed_tools)', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: null,
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, true);
    });

    it('should allow spawn with empty tools array', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: [],
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, true);
    });

    it('should allow spawn with undefined tools', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: undefined,
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, true);
    });

    it('should use generic limits for unknown agent type', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      // Unknown agent type should use maxToolsPerAgent (15)
      const result = validator.validateToolConfig({
        tools: VALID_DEVELOPER_TOOLS,
        agentType: 'custom-unknown-agent',
      });

      assert.strictEqual(result.valid, true);
    });

    it('should handle mixed valid and invalid tools', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'InvalidTool', 'Edit'],
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('InvalidTool')));
      // Should still report valid tools were found
    });
  });

  // ======================================================================
  // 6. Hook Integration Tests
  // ======================================================================

  describe('Hook Integration', () => {
    it('should export required functions', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      assert.ok(typeof validator.validateToolConfig === 'function');
      assert.ok(typeof validator.extractAgentConfig === 'function');
      assert.ok(typeof validator.generateSuggestions === 'function');
    });

    it('should extract agent config from spawn prompt', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const prompt = `You are DEVELOPER.
+======================================================================+
|  Task ID: 5                                                          |
+======================================================================+
allowed_tools: ['Read', 'Write', 'Edit']
subagent_type: developer`;

      const config = validator.extractAgentConfig(prompt);

      assert.ok(config);
      assert.ok(config.agentType);
    });

    it('should generate actionable suggestions for errors', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const errors = ["Tool 'mcp__sequential-thinking__sequentialthinking' unavailable"];

      const suggestions = validator.generateSuggestions(errors);

      assert.ok(suggestions.length > 0);
      assert.ok(
        suggestions.some(
          s => s.includes('Skill') || s.includes('fallback') || s.includes('sequential-thinking')
        )
      );
    });

    it('should return proper structure on validation success', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write'],
        agentType: 'developer',
      });

      assert.strictEqual(typeof result.valid, 'boolean');
      assert.ok(Array.isArray(result.errors));
      assert.ok(Array.isArray(result.warnings));
    });

    it('should return proper structure on validation failure', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'FakeTool'],
        agentType: 'developer',
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
      assert.strictEqual(typeof result.errors[0], 'string');
    });
  });

  // ======================================================================
  // 7. Mandatory Tools Validation
  // ======================================================================

  describe('Mandatory Tools Validation', () => {
    it('should warn if TaskUpdate is missing from tool list', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'Edit'],
        agentType: 'developer',
      });

      // Should warn about missing mandatory tool
      assert.ok(result.warnings.some(w => w.includes('TaskUpdate')));
    });

    it('should warn if Skill is missing from tool list', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'TaskUpdate'],
        agentType: 'developer',
      });

      // Should warn about missing mandatory tool
      assert.ok(result.warnings.some(w => w.includes('Skill')));
    });

    it('should not warn if both mandatory tools are present', () => {
      if (!validator) {
        assert.fail('Module not implemented yet');
      }

      const result = validator.validateToolConfig({
        tools: ['Read', 'Write', 'TaskUpdate', 'Skill'],
        agentType: 'developer',
      });

      // Should not have mandatory tool warnings
      const mandatoryWarnings = result.warnings.filter(
        w => w.includes('TaskUpdate') || (w.includes('Skill') && w.includes('missing'))
      );
      assert.strictEqual(mandatoryWarnings.length, 0);
    });
  });
});
