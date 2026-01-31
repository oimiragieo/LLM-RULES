#!/usr/bin/env node
/**
 * Agent Config Reader Tests
 * ========================
 *
 * TDD tests for agent-config-reader.cjs (ADR-075 implementation)
 *
 * Tests cover:
 * - Model resolution from config.yaml
 * - Model resolution from agent frontmatter
 * - Complexity-based defaults
 * - Model normalization (shorthand to full ID)
 * - Precedence order validation
 * - Error handling and graceful degradation
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Test will fail until we implement the module
const {
  resolveAgentModel,
  normalizeModel,
  getAgentConfig,
  getModelFromConfig,
  getModelFromFrontmatter,
  MODEL_ALIASES,
  COMPLEXITY_DEFAULTS,
} = require('../../../.claude/lib/utils/agent-config-reader.cjs');

// Test fixtures
const PROJECT_ROOT = path.dirname(path.dirname(path.dirname(__dirname)));

describe('agent-config-reader', () => {
  describe('normalizeModel', () => {
    it('should normalize opus shorthand to full model ID', () => {
      assert.strictEqual(normalizeModel('opus'), 'claude-opus-4-5-20251101');
    });

    it('should normalize sonnet shorthand to full model ID', () => {
      assert.strictEqual(normalizeModel('sonnet'), 'claude-sonnet-4-5');
    });

    it('should normalize haiku shorthand to full model ID', () => {
      assert.strictEqual(normalizeModel('haiku'), 'claude-haiku-4-5');
    });

    it('should pass through full model IDs unchanged', () => {
      assert.strictEqual(normalizeModel('claude-opus-4-5-20251101'), 'claude-opus-4-5-20251101');
      assert.strictEqual(normalizeModel('claude-sonnet-4-5'), 'claude-sonnet-4-5');
      assert.strictEqual(normalizeModel('claude-haiku-4-5'), 'claude-haiku-4-5');
    });

    it('should handle unknown models by returning input', () => {
      assert.strictEqual(normalizeModel('unknown-model'), 'unknown-model');
    });

    it('should handle null/undefined by returning sonnet default', () => {
      assert.strictEqual(normalizeModel(null), 'claude-sonnet-4-5');
      assert.strictEqual(normalizeModel(undefined), 'claude-sonnet-4-5');
      assert.strictEqual(normalizeModel(''), 'claude-sonnet-4-5');
    });
  });

  describe('MODEL_ALIASES', () => {
    it('should have bidirectional mapping for opus', () => {
      assert.ok(MODEL_ALIASES['opus']);
      assert.ok(MODEL_ALIASES['claude-opus-4-5-20251101']);
    });

    it('should have bidirectional mapping for sonnet', () => {
      assert.ok(MODEL_ALIASES['sonnet']);
      assert.ok(MODEL_ALIASES['claude-sonnet-4-5']);
    });

    it('should have bidirectional mapping for haiku', () => {
      assert.ok(MODEL_ALIASES['haiku']);
      assert.ok(MODEL_ALIASES['claude-haiku-4-5']);
    });
  });

  describe('COMPLEXITY_DEFAULTS', () => {
    it('should default planner to opus', () => {
      assert.strictEqual(COMPLEXITY_DEFAULTS['planner'], 'opus');
    });

    it('should default architect to opus', () => {
      assert.strictEqual(COMPLEXITY_DEFAULTS['architect'], 'opus');
    });

    it('should default qa to opus', () => {
      assert.strictEqual(COMPLEXITY_DEFAULTS['qa'], 'opus');
    });

    it('should default security-architect to opus', () => {
      assert.strictEqual(COMPLEXITY_DEFAULTS['security-architect'], 'opus');
    });

    it('should default context-compressor to haiku', () => {
      assert.strictEqual(COMPLEXITY_DEFAULTS['context-compressor'], 'haiku');
    });

    it('should have sonnet as default fallback', () => {
      assert.strictEqual(COMPLEXITY_DEFAULTS['default'], 'sonnet');
    });
  });

  describe('getModelFromConfig', () => {
    it('should read planner model from config.yaml', () => {
      const model = getModelFromConfig('planner', PROJECT_ROOT);
      // config.yaml has planner: model: claude-opus-4-5-20251101
      assert.strictEqual(model, 'claude-opus-4-5-20251101');
    });

    it('should read developer model from config.yaml', () => {
      const model = getModelFromConfig('developer', PROJECT_ROOT);
      // config.yaml has developer: model: claude-sonnet-4-5
      assert.strictEqual(model, 'claude-sonnet-4-5');
    });

    it('should read qa model from config.yaml', () => {
      const model = getModelFromConfig('qa', PROJECT_ROOT);
      // config.yaml has qa: model: claude-opus-4-5-20251101
      assert.strictEqual(model, 'claude-opus-4-5-20251101');
    });

    it('should read architect model from config.yaml', () => {
      const model = getModelFromConfig('architect', PROJECT_ROOT);
      // config.yaml has architect: model: claude-opus-4-5-20251101
      assert.strictEqual(model, 'claude-opus-4-5-20251101');
    });

    it('should return null for agent not in config.yaml', () => {
      const model = getModelFromConfig('security-architect', PROJECT_ROOT);
      // security-architect is not in config.yaml agents section
      assert.strictEqual(model, null);
    });

    it('should return null for invalid project root', () => {
      const model = getModelFromConfig('planner', '/nonexistent/path');
      assert.strictEqual(model, null);
    });
  });

  describe('getModelFromFrontmatter', () => {
    it('should read model from planner frontmatter', () => {
      const model = getModelFromFrontmatter('planner', PROJECT_ROOT);
      // planner.md has model: opus in frontmatter
      assert.ok(model === 'opus' || model === 'claude-opus-4-5-20251101');
    });

    it('should read model from developer frontmatter', () => {
      const model = getModelFromFrontmatter('developer', PROJECT_ROOT);
      // developer.md has model: sonnet in frontmatter
      assert.ok(model === 'sonnet' || model === 'claude-sonnet-4-5');
    });

    it('should return null for agent without model in frontmatter', () => {
      // Some agents may not have model field
      const model = getModelFromFrontmatter('nonexistent-agent', PROJECT_ROOT);
      assert.strictEqual(model, null);
    });

    it('should search across agent categories', () => {
      // security-architect is in specialized/ not core/
      const model = getModelFromFrontmatter('security-architect', PROJECT_ROOT);
      // Should find it in .claude/agents/specialized/
      assert.ok(model === 'opus' || model === null); // Depends on frontmatter
    });
  });

  describe('resolveAgentModel', () => {
    it('should return config.yaml model for configured agent (planner)', () => {
      const result = resolveAgentModel('planner', PROJECT_ROOT);
      // Planner is in config.yaml with opus
      assert.strictEqual(result.model, 'claude-opus-4-5-20251101');
      assert.strictEqual(result.source, 'config.yaml');
    });

    it('should return config.yaml model for configured agent (developer)', () => {
      const result = resolveAgentModel('developer', PROJECT_ROOT);
      // Developer is in config.yaml with sonnet
      assert.strictEqual(result.model, 'claude-sonnet-4-5');
      assert.strictEqual(result.source, 'config.yaml');
    });

    it('should return config.yaml model for configured agent (qa)', () => {
      const result = resolveAgentModel('qa', PROJECT_ROOT);
      // QA is in config.yaml with opus
      assert.strictEqual(result.model, 'claude-opus-4-5-20251101');
      assert.strictEqual(result.source, 'config.yaml');
    });

    it('should fall back to frontmatter for unconfigured agent', () => {
      const result = resolveAgentModel('security-architect', PROJECT_ROOT);
      // security-architect not in config.yaml, should use frontmatter
      assert.ok(
        result.source === 'frontmatter' || result.source === 'complexity-default',
        `Expected frontmatter or complexity-default, got: ${result.source}`
      );
    });

    it('should fall back to complexity default for unknown agent', () => {
      const result = resolveAgentModel('unknown-agent', PROJECT_ROOT);
      // Unknown agent should use complexity default (sonnet)
      assert.strictEqual(result.source, 'complexity-default');
      assert.strictEqual(result.model, 'claude-sonnet-4-5');
    });

    it('should return shorthand and normalized model', () => {
      const result = resolveAgentModel('planner', PROJECT_ROOT);
      assert.ok(result.shorthand, 'Should have shorthand property');
      assert.ok(result.model, 'Should have model property');
      // Shorthand should be opus, haiku, or sonnet
      assert.ok(['opus', 'sonnet', 'haiku'].includes(result.shorthand));
    });
  });

  describe('getAgentConfig', () => {
    it('should return full agent config from config.yaml', () => {
      const config = getAgentConfig('planner', PROJECT_ROOT);
      assert.ok(config, 'Should return config object');
      assert.ok(config.model, 'Should have model property');
      assert.ok(config.path, 'Should have path property');
    });

    it('should return null for agent not in config.yaml', () => {
      const config = getAgentConfig('nonexistent-agent', PROJECT_ROOT);
      assert.strictEqual(config, null);
    });

    it('should include extended_thinking if present', () => {
      const config = getAgentConfig('planner', PROJECT_ROOT);
      // planner has extended_thinking: true in config.yaml
      assert.strictEqual(config.extended_thinking, true);
    });
  });

  describe('precedence order', () => {
    it('should follow precedence: config.yaml > frontmatter > complexity-default', () => {
      // Planner is in config.yaml, so config.yaml wins
      const plannerResult = resolveAgentModel('planner', PROJECT_ROOT);
      assert.strictEqual(plannerResult.source, 'config.yaml');

      // Unknown agent should fall to complexity-default
      const unknownResult = resolveAgentModel('totally-unknown', PROJECT_ROOT);
      assert.strictEqual(unknownResult.source, 'complexity-default');
    });
  });

  describe('error handling', () => {
    it('should handle missing config.yaml gracefully', () => {
      const result = resolveAgentModel('planner', '/nonexistent/path');
      // Should fall through to complexity default
      assert.ok(result.model);
      assert.ok(['frontmatter', 'complexity-default'].includes(result.source));
    });

    it('should not throw on any input', () => {
      assert.doesNotThrow(() => resolveAgentModel(null, PROJECT_ROOT));
      assert.doesNotThrow(() => resolveAgentModel(undefined, PROJECT_ROOT));
      assert.doesNotThrow(() => resolveAgentModel('', PROJECT_ROOT));
      assert.doesNotThrow(() => resolveAgentModel(123, PROJECT_ROOT));
    });
  });
});
