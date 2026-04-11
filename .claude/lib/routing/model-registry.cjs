'use strict';

/**
 * Model Registry
 *
 * Central registry of available AI models with capabilities, pricing, and
 * provider metadata. Loads from .claude/config/model-registry.json with
 * fallback to hardcoded defaults that match MODEL_PRICING in token-accountant.cjs.
 *
 * Hardcoded defaults (per 1K tokens, USD):
 *   haiku:  input=$0.25, output=$1.25
 *   sonnet: input=$3,    output=$15
 *   opus:   input=$15,   output=$75
 *
 * @module model-registry
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');

/** Default config path relative to this file */
const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../config/model-registry.json');

/**
 * Hardcoded defaults — must stay in sync with MODEL_PRICING in token-accountant.cjs.
 * Used when config file is missing or corrupt.
 *
 * @type {ModelEntry[]}
 */
const HARDCODED_DEFAULTS = [
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
];

/**
 * @typedef {Object} ModelEntry
 * @property {string} id                 - Full model ID (e.g., 'claude-opus-4-6')
 * @property {string} shorthand          - Short alias (e.g., 'opus')
 * @property {string} provider           - Provider name (e.g., 'anthropic')
 * @property {number} contextWindow      - Max context window in tokens
 * @property {number} maxOutputTokens    - Max output tokens
 * @property {number} costPer1KInput     - Cost in USD per 1K input tokens
 * @property {number} costPer1KOutput    - Cost in USD per 1K output tokens
 * @property {string} latencyClass       - Latency tier: 'fast' | 'medium' | 'slow'
 * @property {string[]} features         - Supported capabilities
 */

/**
 * @typedef {Object} CapabilityConstraints
 * @property {number} [minContextWindow] - Minimum required context window
 * @property {string[]} [features]       - Required feature names
 */

/**
 * ModelRegistry loads and exposes model definitions from a JSON config file.
 * All methods return deep copies so callers cannot mutate internal state.
 */
class ModelRegistry {
  /**
   * @param {string} [configPath] - Path to model-registry.json.
   *        Defaults to .claude/config/model-registry.json
   */
  constructor(configPath) {
    this._configPath = configPath || DEFAULT_CONFIG_PATH;
    /** @type {ModelEntry[]} */
    this._models = [];
    this._load();
  }

  /**
   * Load (or reload) models from the config file.
   * Falls back to HARDCODED_DEFAULTS if the file is missing or corrupt.
   * @private
   */
  _load() {
    try {
      if (!fs.existsSync(this._configPath)) {
        this._models = this._copyDefaults();
        return;
      }

      const content = fs.readFileSync(this._configPath, 'utf8');
      const data = safeParseJSON(content, {});

      if (!data || !Array.isArray(data.models) || data.models.length === 0) {
        this._models = this._copyDefaults();
        return;
      }

      this._models = data.models;
    } catch (err) {
      process.stderr.write(
        `ModelRegistry: Failed to load config from ${this._configPath}: ${err.message}\n`
      );
      this._models = this._copyDefaults();
    }
  }

  /**
   * Return deep copies of the hardcoded defaults.
   * @private
   * @returns {ModelEntry[]}
   */
  _copyDefaults() {
    return HARDCODED_DEFAULTS.map(m => this._copy(m));
  }

  /**
   * Return a deep copy of a ModelEntry so callers cannot mutate internal state.
   * @private
   * @param {ModelEntry} entry
   * @returns {ModelEntry}
   */
  _copy(entry) {
    return { ...entry, features: [...entry.features] };
  }

  /**
   * Look up a model by its full ID or shorthand alias.
   *
   * @param {string} name - Full model ID (e.g., 'claude-opus-4-6') or shorthand ('opus')
   * @returns {ModelEntry|null} A copy of the matching ModelEntry, or null if not found
   */
  getModel(name) {
    if (!name || typeof name !== 'string') return null;
    const model = this._models.find(m => m.id === name || m.shorthand === name);
    return model ? this._copy(model) : null;
  }

  /**
   * Return all registered models sorted by cost ascending (costPer1KInput).
   *
   * @returns {ModelEntry[]} Sorted copies of all model entries
   */
  listModels() {
    return [...this._models]
      .sort((a, b) => a.costPer1KInput - b.costPer1KInput)
      .map(m => this._copy(m));
  }

  /**
   * Return all models from the specified provider.
   *
   * @param {string} provider - Provider name (e.g., 'anthropic')
   * @returns {ModelEntry[]} Copies of matching model entries
   */
  getModelsByProvider(provider) {
    if (!provider || typeof provider !== 'string') return [];
    return this._models.filter(m => m.provider === provider).map(m => this._copy(m));
  }

  /**
   * Return the cheapest model that satisfies all given constraints.
   *
   * @param {CapabilityConstraints} [constraints={}]
   * @returns {ModelEntry|null} Copy of cheapest matching entry, or null if none satisfy constraints
   */
  getCheapestModelForCapability(constraints = {}) {
    const { minContextWindow, features } = constraints;

    const sorted = [...this._models].sort((a, b) => a.costPer1KInput - b.costPer1KInput);

    for (const model of sorted) {
      if (minContextWindow !== undefined && model.contextWindow < minContextWindow) {
        continue;
      }
      if (Array.isArray(features) && features.length > 0) {
        const hasAll = features.every(f => model.features.includes(f));
        if (!hasAll) continue;
      }
      return this._copy(model);
    }

    return null;
  }

  /**
   * Re-read the config file from disk, picking up any changes.
   * Falls back to hardcoded defaults if the file is now missing or corrupt.
   */
  reload() {
    this._load();
  }
}

module.exports = { ModelRegistry, DEFAULT_CONFIG_PATH };
