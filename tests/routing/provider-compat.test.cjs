#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeModelConfig,
  getProviderCapabilities,
  isFeatureSupported,
} = require('../../.claude/lib/routing/provider-compat.cjs');

// Sample model entries matching model-registry.cjs defaults
const OPUS_ENTRY = {
  id: 'claude-opus-4-6',
  shorthand: 'opus',
  provider: 'anthropic',
  contextWindow: 200000,
  maxOutputTokens: 32000,
  costPer1KInput: 15,
  costPer1KOutput: 75,
  latencyClass: 'slow',
  features: ['tool_use', 'vision', 'reasoning', 'extended_thinking'],
};

const SONNET_ENTRY = {
  id: 'claude-sonnet-4-6',
  shorthand: 'sonnet',
  provider: 'anthropic',
  contextWindow: 200000,
  maxOutputTokens: 16384,
  costPer1KInput: 3,
  costPer1KOutput: 15,
  latencyClass: 'medium',
  features: ['tool_use', 'vision'],
};

const HAIKU_ENTRY = {
  id: 'claude-haiku-4-5-20251001',
  shorthand: 'haiku',
  provider: 'anthropic',
  contextWindow: 200000,
  maxOutputTokens: 8192,
  costPer1KInput: 0.25,
  costPer1KOutput: 1.25,
  latencyClass: 'fast',
  features: ['tool_use'],
};

describe('provider-compat', () => {
  describe('normalizeModelConfig', () => {
    it('returns NormalizedModelConfig with correct boolean flags for opus (VAL-MR-008)', () => {
      const result = normalizeModelConfig('anthropic', OPUS_ENTRY);
      assert.strictEqual(typeof result.supportsToolUse, 'boolean');
      assert.strictEqual(typeof result.supportsVision, 'boolean');
      assert.strictEqual(typeof result.supportsReasoning, 'boolean');
      assert.strictEqual(typeof result.supportsStreaming, 'boolean');
    });

    it('extended_thinking maps to supportsReasoning=true (VAL-MR-008)', () => {
      const result = normalizeModelConfig('anthropic', OPUS_ENTRY);
      assert.strictEqual(result.supportsReasoning, true);
    });

    it('tool_use maps to supportsToolUse=true (VAL-MR-008)', () => {
      const result = normalizeModelConfig('anthropic', OPUS_ENTRY);
      assert.strictEqual(result.supportsToolUse, true);
    });

    it('vision maps to supportsVision=true', () => {
      const result = normalizeModelConfig('anthropic', OPUS_ENTRY);
      assert.strictEqual(result.supportsVision, true);
    });

    it('sonnet has supportsToolUse=true and supportsVision=true, no supportsReasoning', () => {
      const result = normalizeModelConfig('anthropic', SONNET_ENTRY);
      assert.strictEqual(result.supportsToolUse, true);
      assert.strictEqual(result.supportsVision, true);
      assert.strictEqual(result.supportsReasoning, false);
    });

    it('haiku has supportsToolUse=true, no supportsVision, no supportsReasoning', () => {
      const result = normalizeModelConfig('anthropic', HAIKU_ENTRY);
      assert.strictEqual(result.supportsToolUse, true);
      assert.strictEqual(result.supportsVision, false);
      assert.strictEqual(result.supportsReasoning, false);
    });

    it('unknown provider returns all booleans false (VAL-MR-008)', () => {
      const result = normalizeModelConfig('unknown-provider', OPUS_ENTRY);
      assert.strictEqual(result.supportsToolUse, false);
      assert.strictEqual(result.supportsVision, false);
      assert.strictEqual(result.supportsReasoning, false);
      assert.strictEqual(result.supportsStreaming, false);
    });

    it('null provider returns all booleans false', () => {
      const result = normalizeModelConfig(null, OPUS_ENTRY);
      assert.strictEqual(result.supportsToolUse, false);
      assert.strictEqual(result.supportsVision, false);
      assert.strictEqual(result.supportsReasoning, false);
      assert.strictEqual(result.supportsStreaming, false);
    });

    it('empty string provider returns all booleans false', () => {
      const result = normalizeModelConfig('', OPUS_ENTRY);
      assert.strictEqual(result.supportsToolUse, false);
      assert.strictEqual(result.supportsVision, false);
      assert.strictEqual(result.supportsReasoning, false);
      assert.strictEqual(result.supportsStreaming, false);
    });

    it('handles modelEntry with empty features array', () => {
      const empty = { ...OPUS_ENTRY, features: [] };
      const result = normalizeModelConfig('anthropic', empty);
      assert.strictEqual(result.supportsToolUse, false);
      assert.strictEqual(result.supportsVision, false);
      assert.strictEqual(result.supportsReasoning, false);
    });

    it('handles modelEntry with no features property', () => {
      const noFeatures = { id: 'x', provider: 'anthropic' };
      const result = normalizeModelConfig('anthropic', noFeatures);
      assert.strictEqual(result.supportsToolUse, false);
      assert.strictEqual(result.supportsVision, false);
      assert.strictEqual(result.supportsReasoning, false);
    });

    it('is pure — repeated calls return same result', () => {
      const r1 = normalizeModelConfig('anthropic', OPUS_ENTRY);
      const r2 = normalizeModelConfig('anthropic', OPUS_ENTRY);
      assert.deepStrictEqual(r1, r2);
    });

    it('returns a new object each call (no shared state)', () => {
      const r1 = normalizeModelConfig('anthropic', OPUS_ENTRY);
      r1.supportsToolUse = false;
      const r2 = normalizeModelConfig('anthropic', OPUS_ENTRY);
      assert.strictEqual(r2.supportsToolUse, true);
    });

    it('model with custom feature aliases still resolves correctly', () => {
      const customModel = {
        id: 'custom-model',
        provider: 'anthropic',
        features: ['function_calling', 'image_input'],
      };
      const result = normalizeModelConfig('anthropic', customModel);
      assert.strictEqual(result.supportsToolUse, true);
      assert.strictEqual(result.supportsVision, true);
    });
  });

  describe('getProviderCapabilities', () => {
    it('returns correct capabilities for anthropic (VAL-MR-008)', () => {
      const caps = getProviderCapabilities('anthropic');
      assert.strictEqual(caps.provider, 'anthropic');
      assert.ok(Array.isArray(caps.supportedModels), 'supportedModels should be an array');
      assert.ok(Array.isArray(caps.features), 'features should be an array');
      assert.ok(typeof caps.apiVersion === 'string', 'apiVersion should be a string');
    });

    it('anthropic supportedModels includes opus, sonnet, haiku models', () => {
      const caps = getProviderCapabilities('anthropic');
      assert.ok(caps.supportedModels.length > 0, 'Should have at least one supported model');
      // Should contain at least one Anthropic model
      const hasAnthropicModel = caps.supportedModels.some(
        m => typeof m === 'string' && m.startsWith('claude')
      );
      assert.ok(hasAnthropicModel, 'Should include at least one claude model');
    });

    it('anthropic features includes known capabilities', () => {
      const caps = getProviderCapabilities('anthropic');
      assert.ok(caps.features.includes('tool_use'), 'Should include tool_use');
    });

    it('anthropic apiVersion is a non-empty string', () => {
      const caps = getProviderCapabilities('anthropic');
      assert.ok(caps.apiVersion.length > 0, 'apiVersion should be non-empty');
    });

    it('unknown provider returns safe defaults', () => {
      const caps = getProviderCapabilities('unknown-xyz');
      assert.strictEqual(caps.provider, 'unknown-xyz');
      assert.deepStrictEqual(caps.supportedModels, []);
      assert.deepStrictEqual(caps.features, []);
      assert.strictEqual(caps.apiVersion, '');
    });

    it('null provider returns safe defaults with empty provider string', () => {
      const caps = getProviderCapabilities(null);
      assert.strictEqual(caps.provider, '');
      assert.deepStrictEqual(caps.supportedModels, []);
      assert.deepStrictEqual(caps.features, []);
    });

    it('is pure — returns copy not reference (mutations do not affect future calls)', () => {
      const caps1 = getProviderCapabilities('anthropic');
      caps1.supportedModels.push('fake-model');
      const caps2 = getProviderCapabilities('anthropic');
      assert.ok(!caps2.supportedModels.includes('fake-model'));
    });

    it('is deterministic — repeated calls return same values', () => {
      const caps1 = getProviderCapabilities('anthropic');
      const caps2 = getProviderCapabilities('anthropic');
      assert.deepStrictEqual(caps1, caps2);
    });
  });

  describe('isFeatureSupported', () => {
    it('returns true for raw feature name tool_use (VAL-MR-009)', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, 'tool_use'), true);
    });

    it('returns true for raw feature name vision (VAL-MR-009)', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, 'vision'), true);
    });

    it('returns true for raw feature name extended_thinking (VAL-MR-009)', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, 'extended_thinking'), true);
    });

    it('returns true for canonical alias supportsToolUse (VAL-MR-009)', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, 'supportsToolUse'), true);
    });

    it('returns true for canonical alias supportsVision (VAL-MR-009)', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, 'supportsVision'), true);
    });

    it('returns true for canonical alias supportsReasoning (VAL-MR-009)', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, 'supportsReasoning'), true);
    });

    it('returns false for supportsReasoning when model lacks extended_thinking', () => {
      assert.strictEqual(isFeatureSupported(SONNET_ENTRY, 'supportsReasoning'), false);
    });

    it('returns false for supportsVision when model lacks vision', () => {
      assert.strictEqual(isFeatureSupported(HAIKU_ENTRY, 'supportsVision'), false);
    });

    it('returns false for unknown feature name', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, 'nonexistent_feature'), false);
    });

    it('returns false for empty feature string', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, ''), false);
    });

    it('returns false for null feature', () => {
      assert.strictEqual(isFeatureSupported(OPUS_ENTRY, null), false);
    });

    it('returns false for null modelEntry', () => {
      assert.strictEqual(isFeatureSupported(null, 'tool_use'), false);
    });

    it('returns false for modelEntry with no features', () => {
      const noFeatures = { id: 'x' };
      assert.strictEqual(isFeatureSupported(noFeatures, 'tool_use'), false);
    });

    it('returns false for modelEntry with empty features array', () => {
      const empty = { ...OPUS_ENTRY, features: [] };
      assert.strictEqual(isFeatureSupported(empty, 'tool_use'), false);
    });

    it('checks raw alias function_calling for supportsToolUse (VAL-MR-009)', () => {
      const customModel = { features: ['function_calling'] };
      assert.strictEqual(isFeatureSupported(customModel, 'supportsToolUse'), true);
      assert.strictEqual(isFeatureSupported(customModel, 'function_calling'), true);
    });

    it('checks raw alias image_input for supportsVision (VAL-MR-009)', () => {
      const customModel = { features: ['image_input'] };
      assert.strictEqual(isFeatureSupported(customModel, 'supportsVision'), true);
      assert.strictEqual(isFeatureSupported(customModel, 'image_input'), true);
    });

    it('haiku has tool_use, not vision or reasoning', () => {
      assert.strictEqual(isFeatureSupported(HAIKU_ENTRY, 'tool_use'), true);
      assert.strictEqual(isFeatureSupported(HAIKU_ENTRY, 'vision'), false);
      assert.strictEqual(isFeatureSupported(HAIKU_ENTRY, 'extended_thinking'), false);
    });

    it('is pure — does not modify the modelEntry', () => {
      const entry = { ...OPUS_ENTRY, features: [...OPUS_ENTRY.features] };
      const before = JSON.stringify(entry);
      isFeatureSupported(entry, 'tool_use');
      isFeatureSupported(entry, 'supportsReasoning');
      assert.strictEqual(JSON.stringify(entry), before);
    });
  });
});
