#!/usr/bin/env node
/**
 * Config Model Validator Hook Tests
 * ==================================
 *
 * TDD tests for config-model-validator.cjs (ADR-075 implementation)
 *
 * Hook validates that Task() spawn model matches config.yaml configuration.
 *
 * Modes:
 * - block: Prevent spawn if model mismatch
 * - warn: Log warning but allow spawn
 * - off: No validation
 */

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Test will fail until we implement the module
const {
  validateModelConfig,
  extractAgentTypeFromPrompt,
  extractModelFromToolInput,
  formatAuditEntry,
} = require('../../.claude/hooks/routing/config-model-validator.cjs');

// Test fixtures
const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(__dirname)));

describe('config-model-validator', () => {
  describe('extractAgentTypeFromPrompt', () => {
    it('should extract agent type from "You are PLANNER" pattern', () => {
      const prompt = 'You are PLANNER. Design the authentication system.';
      const result = extractAgentTypeFromPrompt(prompt);
      assert.strictEqual(result, 'planner');
    });

    it('should extract agent type from "You are the DEVELOPER" pattern', () => {
      const prompt = 'You are the DEVELOPER agent. Implement the feature.';
      const result = extractAgentTypeFromPrompt(prompt);
      assert.strictEqual(result, 'developer');
    });

    it('should extract agent type from "You are SECURITY-ARCHITECT" pattern', () => {
      const prompt = 'You are SECURITY-ARCHITECT. Review security implications.';
      const result = extractAgentTypeFromPrompt(prompt);
      assert.strictEqual(result, 'security-architect');
    });

    it('should extract agent type from "You are QA" pattern', () => {
      const prompt = 'You are QA. Test the implementation thoroughly.';
      const result = extractAgentTypeFromPrompt(prompt);
      assert.strictEqual(result, 'qa');
    });

    it('should extract agent type from agent file path', () => {
      const prompt = 'Read: .claude/agents/core/planner.md\nThen execute the task.';
      const result = extractAgentTypeFromPrompt(prompt);
      assert.strictEqual(result, 'planner');
    });

    it('should extract agent type from specialized agent path', () => {
      const prompt = 'Read: .claude/agents/specialized/security-architect.md';
      const result = extractAgentTypeFromPrompt(prompt);
      assert.strictEqual(result, 'security-architect');
    });

    it('should extract agent type from subagent_type hint', () => {
      const prompt = '[subagent_type: developer] Implement the feature.';
      const result = extractAgentTypeFromPrompt(prompt);
      assert.strictEqual(result, 'developer');
    });

    it('should return null for prompts without agent type', () => {
      const prompt = 'Execute this task without any agent specification.';
      const result = extractAgentTypeFromPrompt(prompt);
      assert.strictEqual(result, null);
    });

    it('should handle null/undefined prompts', () => {
      assert.strictEqual(extractAgentTypeFromPrompt(null), null);
      assert.strictEqual(extractAgentTypeFromPrompt(undefined), null);
      assert.strictEqual(extractAgentTypeFromPrompt(''), null);
    });
  });

  describe('extractModelFromToolInput', () => {
    it('should extract model from tool_input.model', () => {
      const toolInput = { model: 'opus', prompt: 'You are PLANNER.' };
      const result = extractModelFromToolInput(toolInput);
      assert.strictEqual(result, 'opus');
    });

    it('should return null if no model specified', () => {
      const toolInput = { prompt: 'You are PLANNER.' };
      const result = extractModelFromToolInput(toolInput);
      assert.strictEqual(result, null);
    });

    it('should handle full model IDs', () => {
      const toolInput = { model: 'claude-opus-4-5-20251101', prompt: 'Test' };
      const result = extractModelFromToolInput(toolInput);
      assert.strictEqual(result, 'claude-opus-4-5-20251101');
    });

    it('should handle null/undefined toolInput', () => {
      assert.strictEqual(extractModelFromToolInput(null), null);
      assert.strictEqual(extractModelFromToolInput(undefined), null);
      assert.strictEqual(extractModelFromToolInput({}), null);
    });
  });

  describe('validateModelConfig', () => {
    it('should return allow when model matches config (planner with opus)', () => {
      const toolInput = { model: 'opus', prompt: 'You are PLANNER. Design the system.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // planner is configured with opus in config.yaml
      assert.strictEqual(result.decision, 'allow');
      assert.ok(!result.mismatch);
    });

    it('should return allow when model matches config (developer with sonnet)', () => {
      const toolInput = { model: 'sonnet', prompt: 'You are DEVELOPER. Implement the feature.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // developer is configured with sonnet in config.yaml
      assert.strictEqual(result.decision, 'allow');
      assert.ok(!result.mismatch);
    });

    it('should detect mismatch when planner spawned with sonnet', () => {
      const toolInput = { model: 'sonnet', prompt: 'You are PLANNER. Design the system.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // planner should be opus, not sonnet
      assert.ok(result.mismatch, 'Should detect model mismatch');
      assert.strictEqual(result.configuredModel, 'opus');
      assert.strictEqual(result.spawnModel, 'sonnet');
    });

    it('should detect mismatch when developer spawned with opus', () => {
      const toolInput = { model: 'opus', prompt: 'You are DEVELOPER. Implement the feature.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // developer should be sonnet, not opus
      assert.ok(result.mismatch, 'Should detect model mismatch');
      assert.strictEqual(result.configuredModel, 'sonnet');
      assert.strictEqual(result.spawnModel, 'opus');
    });

    it('should detect mismatch when qa spawned with haiku', () => {
      const toolInput = { model: 'haiku', prompt: 'You are QA. Test the implementation.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // qa should be opus, not haiku
      assert.ok(result.mismatch, 'Should detect model mismatch');
      assert.strictEqual(result.configuredModel, 'opus');
      assert.strictEqual(result.spawnModel, 'haiku');
    });

    it('should allow spawn without model specified (uses configured default)', () => {
      const toolInput = { prompt: 'You are PLANNER. Design the system.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // No model specified - cannot compare, allow
      assert.strictEqual(result.decision, 'allow');
      assert.ok(!result.mismatch);
    });

    it('should allow spawn when agent type cannot be determined', () => {
      const toolInput = { model: 'sonnet', prompt: 'Execute generic task.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // No agent type - cannot validate, allow
      assert.strictEqual(result.decision, 'allow');
      assert.ok(!result.mismatch);
    });

    it('should handle full model IDs in comparison', () => {
      const toolInput = {
        model: 'claude-opus-4-5-20251101',
        prompt: 'You are PLANNER. Design.',
      };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // Full ID should match shorthand opus
      assert.strictEqual(result.decision, 'allow');
      assert.ok(!result.mismatch);
    });

    it('should include detailed audit information', () => {
      const toolInput = { model: 'sonnet', prompt: 'You are PLANNER. Design.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      assert.ok(result.agentType, 'Should include agentType');
      assert.ok(result.spawnModel, 'Should include spawnModel');
      assert.ok(result.configuredModel, 'Should include configuredModel');
      assert.ok(result.source, 'Should include config source');
    });
  });

  describe('formatAuditEntry', () => {
    it('should format mismatch audit entry', () => {
      const validation = {
        mismatch: true,
        agentType: 'planner',
        spawnModel: 'sonnet',
        configuredModel: 'opus',
        source: 'config.yaml',
        decision: 'warn',
      };
      const entry = formatAuditEntry(validation);

      assert.ok(entry.hook === 'config-model-validator');
      assert.ok(entry.event === 'model_mismatch');
      assert.ok(entry.agentType === 'planner');
      assert.ok(entry.spawnModel === 'sonnet');
      assert.ok(entry.configuredModel === 'opus');
      assert.ok(entry.timestamp);
    });

    it('should format match audit entry', () => {
      const validation = {
        mismatch: false,
        agentType: 'developer',
        spawnModel: 'sonnet',
        configuredModel: 'sonnet',
        source: 'config.yaml',
        decision: 'allow',
      };
      const entry = formatAuditEntry(validation);

      assert.ok(entry.event === 'model_validated');
    });
  });

  describe('enforcement modes', () => {
    const originalEnv = process.env.CONFIG_MODEL_VALIDATOR;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.CONFIG_MODEL_VALIDATOR;
      } else {
        process.env.CONFIG_MODEL_VALIDATOR = originalEnv;
      }
    });

    it('should default to warn mode', () => {
      delete process.env.CONFIG_MODEL_VALIDATOR;
      const toolInput = { model: 'sonnet', prompt: 'You are PLANNER.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      // Mismatch should return warn, not block
      if (result.mismatch) {
        assert.strictEqual(result.decision, 'warn');
      }
    });

    it('should block on mismatch when CONFIG_MODEL_VALIDATOR=block', () => {
      process.env.CONFIG_MODEL_VALIDATOR = 'block';
      const toolInput = { model: 'sonnet', prompt: 'You are PLANNER.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      // Mismatch should block
      if (result.mismatch) {
        assert.strictEqual(result.decision, 'block');
      }
    });

    it('should skip validation when CONFIG_MODEL_VALIDATOR=off', () => {
      process.env.CONFIG_MODEL_VALIDATOR = 'off';
      const toolInput = { model: 'sonnet', prompt: 'You are PLANNER.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);

      // Should always allow when off
      assert.strictEqual(result.decision, 'allow');
      assert.ok(!result.mismatch, 'Should not flag mismatch when off');
    });
  });

  describe('edge cases', () => {
    it('should handle agent type with hyphens (security-architect)', () => {
      const toolInput = { model: 'opus', prompt: 'You are SECURITY-ARCHITECT.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      // security-architect defaults to opus via complexity defaults
      assert.strictEqual(result.agentType, 'security-architect');
    });

    it('should handle case-insensitive agent matching', () => {
      const toolInput = { model: 'opus', prompt: 'you are planner' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      assert.strictEqual(result.agentType, 'planner');
    });

    it('should handle orchestrator agents', () => {
      const toolInput = { model: 'opus', prompt: 'You are master-orchestrator.' };
      const result = validateModelConfig(toolInput, PROJECT_ROOT);
      assert.strictEqual(result.agentType, 'master-orchestrator');
    });

    it('should not crash on malformed input', () => {
      assert.doesNotThrow(() => validateModelConfig(null, PROJECT_ROOT));
      assert.doesNotThrow(() => validateModelConfig({}, PROJECT_ROOT));
      assert.doesNotThrow(() => validateModelConfig({ model: 123 }, PROJECT_ROOT));
      assert.doesNotThrow(() => validateModelConfig({ prompt: [] }, PROJECT_ROOT));
    });
  });
});
