#!/usr/bin/env node
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { ModelRegistry } = require('../../.claude/lib/routing/model-registry.cjs');

// Sample config for testing — 3 Anthropic models matching MODEL_PRICING from token-accountant.cjs
const SAMPLE_CONFIG = {
  models: [
    {
      id: 'claude-opus-4-6',
      shorthand: 'opus',
      provider: 'anthropic',
      contextWindow: 200000,
      maxOutputTokens: 32000,
      costPer1KInput: 15,
      costPer1KOutput: 75,
      latencyClass: 'slow',
      features: ['tool_use', 'vision', 'reasoning', 'extended_thinking'],
    },
    {
      id: 'claude-sonnet-4-6',
      shorthand: 'sonnet',
      provider: 'anthropic',
      contextWindow: 200000,
      maxOutputTokens: 16384,
      costPer1KInput: 3,
      costPer1KOutput: 15,
      latencyClass: 'medium',
      features: ['tool_use', 'vision'],
    },
    {
      id: 'claude-haiku-4-5-20251001',
      shorthand: 'haiku',
      provider: 'anthropic',
      contextWindow: 200000,
      maxOutputTokens: 8192,
      costPer1KInput: 0.25,
      costPer1KOutput: 1.25,
      latencyClass: 'fast',
      features: ['tool_use'],
    },
  ],
};

let tmpDir;
let tmpConfigPath;

describe('ModelRegistry', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-registry-'));
    tmpConfigPath = path.join(tmpDir, 'model-registry.json');
    fs.writeFileSync(tmpConfigPath, JSON.stringify(SAMPLE_CONFIG, null, 2));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('loads config from provided path', () => {
      const registry = new ModelRegistry(tmpConfigPath);
      const models = registry.listModels();
      assert.strictEqual(models.length, 3);
    });

    it('falls back to defaults when config path is missing (VAL-MR-004)', () => {
      const registry = new ModelRegistry('/nonexistent/path/model-registry.json');
      const models = registry.listModels();
      assert.ok(models.length >= 3, 'Should have at least 3 default models');
    });

    it('falls back to defaults when config contains invalid JSON (VAL-MR-004)', () => {
      const badPath = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(badPath, 'not valid json {{{');
      const stderrChunks = [];
      const origWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = (chunk, ...args) => {
        stderrChunks.push(String(chunk));
        return origWrite(chunk, ...args);
      };
      let registry;
      try {
        registry = new ModelRegistry(badPath);
      } finally {
        process.stderr.write = origWrite;
      }
      const models = registry.listModels();
      assert.ok(models.length >= 3, 'Should have default models on invalid JSON');
      assert.ok(
        stderrChunks.some(c => c.includes('ModelRegistry')),
        'Should warn to stderr on invalid JSON'
      );
    });

    it('uses default config path when no path provided', () => {
      // Should not throw — either loads real config or uses defaults
      const registry = new ModelRegistry();
      const models = registry.listModels();
      assert.ok(Array.isArray(models));
      assert.ok(models.length >= 3);
    });
  });

  describe('getModel', () => {
    let registry;
    before(() => {
      registry = new ModelRegistry(tmpConfigPath);
    });

    it('returns complete ModelEntry for full ID (VAL-MR-001)', () => {
      const entry = registry.getModel('claude-opus-4-6');
      assert.ok(entry !== null);
      assert.strictEqual(entry.id, 'claude-opus-4-6');
      assert.strictEqual(entry.shorthand, 'opus');
      assert.strictEqual(entry.provider, 'anthropic');
      assert.ok(typeof entry.contextWindow === 'number');
      assert.ok(typeof entry.maxOutputTokens === 'number');
      assert.ok(typeof entry.costPer1KInput === 'number');
      assert.ok(typeof entry.costPer1KOutput === 'number');
      assert.ok(typeof entry.latencyClass === 'string');
      assert.ok(Array.isArray(entry.features));
    });

    it('resolves shorthand alias opus to full entry (VAL-MR-002)', () => {
      const entry = registry.getModel('opus');
      assert.ok(entry !== null);
      assert.strictEqual(entry.id, 'claude-opus-4-6');
      assert.strictEqual(entry.shorthand, 'opus');
    });

    it('resolves sonnet shorthand (VAL-MR-002)', () => {
      const entry = registry.getModel('sonnet');
      assert.ok(entry !== null);
      assert.strictEqual(entry.id, 'claude-sonnet-4-6');
    });

    it('resolves haiku shorthand (VAL-MR-002)', () => {
      const entry = registry.getModel('haiku');
      assert.ok(entry !== null);
      assert.strictEqual(entry.id, 'claude-haiku-4-5-20251001');
    });

    it('returns null for nonexistent model', () => {
      const entry = registry.getModel('nonexistent');
      assert.strictEqual(entry, null);
    });

    it('returns null for empty string', () => {
      const entry = registry.getModel('');
      assert.strictEqual(entry, null);
    });

    it('returns null for null input', () => {
      const entry = registry.getModel(null);
      assert.strictEqual(entry, null);
    });
  });

  describe('listModels', () => {
    let registry;
    before(() => {
      registry = new ModelRegistry(tmpConfigPath);
    });

    it('returns all models', () => {
      const models = registry.listModels();
      assert.strictEqual(models.length, 3);
    });

    it('returns models sorted by cost ascending (costPer1KInput)', () => {
      const models = registry.listModels();
      for (let i = 1; i < models.length; i++) {
        assert.ok(
          models[i].costPer1KInput >= models[i - 1].costPer1KInput,
          `Models should be sorted ascending: ${models[i - 1].id} (${models[i - 1].costPer1KInput}) before ${models[i].id} (${models[i].costPer1KInput})`
        );
      }
    });

    it('haiku is cheapest, opus is most expensive', () => {
      const models = registry.listModels();
      assert.strictEqual(models[0].shorthand, 'haiku');
      assert.strictEqual(models[models.length - 1].shorthand, 'opus');
    });
  });

  describe('getModelsByProvider', () => {
    let registry;
    before(() => {
      registry = new ModelRegistry(tmpConfigPath);
    });

    it('returns only models from specified provider', () => {
      const models = registry.getModelsByProvider('anthropic');
      assert.strictEqual(models.length, 3);
      for (const model of models) {
        assert.strictEqual(model.provider, 'anthropic');
      }
    });

    it('returns empty array for unknown provider', () => {
      const models = registry.getModelsByProvider('openai');
      assert.deepStrictEqual(models, []);
    });

    it('returns empty array for empty string provider', () => {
      const models = registry.getModelsByProvider('');
      assert.deepStrictEqual(models, []);
    });
  });

  describe('getCheapestModelForCapability', () => {
    let registry;
    before(() => {
      registry = new ModelRegistry(tmpConfigPath);
    });

    it('returns cheapest model with empty constraints (VAL-MR-003)', () => {
      const model = registry.getCheapestModelForCapability({});
      assert.ok(model !== null);
      assert.strictEqual(model.shorthand, 'haiku');
    });

    it('returns cheapest model meeting minContextWindow (VAL-MR-003)', () => {
      const model = registry.getCheapestModelForCapability({ minContextWindow: 100000 });
      assert.ok(model !== null);
      assert.ok(model.contextWindow >= 100000);
    });

    it('returns null when no model meets minContextWindow (VAL-MR-003)', () => {
      const model = registry.getCheapestModelForCapability({ minContextWindow: 999999999 });
      assert.strictEqual(model, null);
    });

    it('returns cheapest model with required feature tool_use (VAL-MR-003)', () => {
      const model = registry.getCheapestModelForCapability({ features: ['tool_use'] });
      assert.ok(model !== null);
      // haiku has tool_use and is cheapest
      assert.strictEqual(model.shorthand, 'haiku');
    });

    it('returns model with extended_thinking when required (VAL-MR-003)', () => {
      const model = registry.getCheapestModelForCapability({ features: ['extended_thinking'] });
      assert.ok(model !== null);
      assert.ok(model.features.includes('extended_thinking'));
      // only opus has extended_thinking
      assert.strictEqual(model.shorthand, 'opus');
    });

    it('returns null when no model has required features (VAL-MR-003)', () => {
      const model = registry.getCheapestModelForCapability({ features: ['nonexistent_feature'] });
      assert.strictEqual(model, null);
    });

    it('handles combined constraints — vision + context window (VAL-MR-003)', () => {
      const model = registry.getCheapestModelForCapability({
        minContextWindow: 100000,
        features: ['vision'],
      });
      assert.ok(model !== null);
      assert.ok(model.contextWindow >= 100000);
      assert.ok(model.features.includes('vision'));
      // sonnet is cheaper than opus and has vision; haiku lacks vision
      assert.strictEqual(model.shorthand, 'sonnet');
    });

    it('returns null when combined constraints cannot be satisfied (VAL-MR-003)', () => {
      const model = registry.getCheapestModelForCapability({
        minContextWindow: 999999999,
        features: ['tool_use'],
      });
      assert.strictEqual(model, null);
    });

    it('handles call with no argument (defaults to empty constraints)', () => {
      const model = registry.getCheapestModelForCapability();
      assert.ok(model !== null);
    });
  });

  describe('reload', () => {
    it('picks up config changes from disk', () => {
      const reloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-registry-reload-'));
      const reloadPath = path.join(reloadDir, 'model-registry.json');

      // Create initial config with 2 models
      const initialConfig = {
        models: [SAMPLE_CONFIG.models[0], SAMPLE_CONFIG.models[1]],
      };
      fs.writeFileSync(reloadPath, JSON.stringify(initialConfig));

      const registry = new ModelRegistry(reloadPath);
      assert.strictEqual(registry.listModels().length, 2);

      // Update config to add third model
      fs.writeFileSync(reloadPath, JSON.stringify(SAMPLE_CONFIG));

      registry.reload();
      assert.strictEqual(registry.listModels().length, 3);

      fs.rmSync(reloadDir, { recursive: true, force: true });
    });

    it('falls back to defaults when reload finds missing file', () => {
      const reloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-registry-reload2-'));
      const reloadPath = path.join(reloadDir, 'model-registry.json');

      // Create initial valid config
      fs.writeFileSync(reloadPath, JSON.stringify(SAMPLE_CONFIG));
      const registry = new ModelRegistry(reloadPath);
      assert.strictEqual(registry.listModels().length, 3);

      // Delete the config
      fs.unlinkSync(reloadPath);

      // Reload — should fall back to defaults
      registry.reload();
      const models = registry.listModels();
      assert.ok(models.length >= 3, 'Should have default models after reload with missing file');

      fs.rmSync(reloadDir, { recursive: true, force: true });
    });
  });

  describe('immutability — returns copies not references', () => {
    let registry;
    before(() => {
      registry = new ModelRegistry(tmpConfigPath);
    });

    it('getModel returns a copy, not a reference', () => {
      const entry1 = registry.getModel('opus');
      entry1.id = 'modified';

      const entry2 = registry.getModel('opus');
      assert.strictEqual(entry2.id, 'claude-opus-4-6');
    });

    it('listModels returns copies, not references', () => {
      const models = registry.listModels();
      models[0].id = 'modified';

      const models2 = registry.listModels();
      assert.notStrictEqual(models2[0].id, 'modified');
    });

    it('getCheapestModelForCapability returns a copy', () => {
      const model = registry.getCheapestModelForCapability({});
      model.id = 'modified';

      const model2 = registry.getCheapestModelForCapability({});
      assert.notStrictEqual(model2.id, 'modified');
    });

    it('mutating returned features array does not affect internal state', () => {
      const entry = registry.getModel('opus');
      entry.features.push('fake_feature');

      const entry2 = registry.getModel('opus');
      assert.ok(!entry2.features.includes('fake_feature'));
    });
  });

  describe('fallback hardcoded defaults match MODEL_PRICING from token-accountant (VAL-MR-004)', () => {
    it('defaults include opus, sonnet, haiku with correct pricing', () => {
      const registry = new ModelRegistry('/nonexistent/path.json');
      const opus = registry.getModel('opus');
      const sonnet = registry.getModel('sonnet');
      const haiku = registry.getModel('haiku');

      assert.ok(opus !== null);
      assert.ok(sonnet !== null);
      assert.ok(haiku !== null);

      // Match MODEL_PRICING values from token-accountant.cjs
      assert.strictEqual(opus.costPer1KInput, 15);
      assert.strictEqual(opus.costPer1KOutput, 75);
      assert.strictEqual(sonnet.costPer1KInput, 3);
      assert.strictEqual(sonnet.costPer1KOutput, 15);
      assert.strictEqual(haiku.costPer1KInput, 0.25);
      assert.strictEqual(haiku.costPer1KOutput, 1.25);
    });

    it('defaults have all required ModelEntry fields', () => {
      const registry = new ModelRegistry('/nonexistent/path.json');
      const model = registry.getModel('sonnet');

      assert.ok(typeof model.id === 'string');
      assert.ok(typeof model.shorthand === 'string');
      assert.ok(typeof model.provider === 'string');
      assert.ok(typeof model.contextWindow === 'number');
      assert.ok(typeof model.maxOutputTokens === 'number');
      assert.ok(typeof model.costPer1KInput === 'number');
      assert.ok(typeof model.costPer1KOutput === 'number');
      assert.ok(typeof model.latencyClass === 'string');
      assert.ok(Array.isArray(model.features));
    });
  });
});
