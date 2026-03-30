'use strict';

/**
 * Provider Compatibility Layer
 *
 * Pure functions for normalizing model capabilities across providers into a
 * unified interface. No classes, no side effects, no file I/O.
 *
 * Feature name mapping resolves provider-specific feature arrays (e.g.,
 * 'extended_thinking', 'tool_use', 'vision') to canonical boolean flags
 * (supportsReasoning, supportsToolUse, supportsVision, supportsStreaming).
 *
 * @module provider-compat
 */

/**
 * Known provider configurations.
 * Each entry declares the models, raw feature names, and API version for a
 * provider. Unknown providers fall back to safe defaults (all flags false).
 *
 * @type {Record<string, {supportedModels: string[], features: string[], apiVersion: string}>}
 */
const PROVIDER_CONFIGS = {
  anthropic: {
    supportedModels: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    features: [
      'tool_use',
      'vision',
      'extended_thinking',
      'reasoning',
      'streaming',
      'function_calling',
      'image_input',
    ],
    apiVersion: '2023-06-01',
  },
};

/**
 * Mapping from canonical boolean flag name to the list of raw provider
 * feature strings that indicate support for that capability.
 *
 * Any raw feature name in a model's `features` array that matches one of
 * these aliases will set the corresponding flag to true.
 *
 * @type {Record<string, string[]>}
 */
const FLAG_TO_RAW_FEATURES = {
  supportsToolUse: ['tool_use', 'tools', 'function_calling'],
  supportsVision: ['vision', 'image_input', 'multimodal'],
  supportsReasoning: ['extended_thinking', 'reasoning', 'chain_of_thought'],
  supportsStreaming: ['streaming'],
};

/**
 * Reverse mapping: raw feature name -> canonical boolean flag name.
 * Built automatically from FLAG_TO_RAW_FEATURES so it always stays in sync.
 *
 * @type {Record<string, string>}
 */
const RAW_FEATURE_TO_FLAG = {};
for (const [flag, aliases] of Object.entries(FLAG_TO_RAW_FEATURES)) {
  for (const alias of aliases) {
    RAW_FEATURE_TO_FLAG[alias] = flag;
  }
}

/**
 * Safe default NormalizedModelConfig returned when a provider is unknown.
 * All capabilities are conservatively set to false.
 */
const SAFE_BOOLEAN_DEFAULTS = {
  supportsToolUse: false,
  supportsVision: false,
  supportsReasoning: false,
  supportsStreaming: false,
};

/**
 * @typedef {Object} NormalizedModelConfig
 * @property {boolean} supportsToolUse   - Whether the model supports tool/function use
 * @property {boolean} supportsVision    - Whether the model supports image/vision input
 * @property {boolean} supportsReasoning - Whether the model supports extended reasoning
 * @property {boolean} supportsStreaming - Whether the model supports streaming output
 */

/**
 * @typedef {Object} ProviderCapabilities
 * @property {string}   provider        - Provider name (e.g., 'anthropic')
 * @property {string[]} supportedModels - Full model IDs supported by this provider
 * @property {string[]} features        - Raw feature names supported by this provider
 * @property {string}   apiVersion      - Provider API version string
 */

/**
 * Return true if the provider name maps to a known configuration.
 *
 * @param {string} provider
 * @returns {boolean}
 */
function _isKnownProvider(provider) {
  return (
    typeof provider === 'string' && Object.prototype.hasOwnProperty.call(PROVIDER_CONFIGS, provider)
  );
}

/**
 * Normalize a model entry's capabilities into a unified boolean flag interface.
 *
 * Resolves provider-specific feature strings (e.g., 'extended_thinking',
 * 'tool_use', 'vision') to canonical boolean flags. For unknown providers,
 * returns safe defaults where all flags are false.
 *
 * This function is pure: it has no side effects and always returns the same
 * output for the same inputs.
 *
 * @param {string} provider   - Provider name (e.g., 'anthropic')
 * @param {Object} modelEntry - Model entry object with a `features` string array
 * @returns {NormalizedModelConfig}
 */
function normalizeModelConfig(provider, modelEntry) {
  if (!_isKnownProvider(provider)) {
    return { ...SAFE_BOOLEAN_DEFAULTS };
  }

  const features =
    modelEntry != null && Array.isArray(modelEntry.features) ? modelEntry.features : [];

  const result = {};
  for (const [flag, aliases] of Object.entries(FLAG_TO_RAW_FEATURES)) {
    result[flag] = aliases.some(alias => features.includes(alias));
  }

  return result;
}

/**
 * Return capability metadata for a provider.
 *
 * For unknown providers, returns a safe default object with empty arrays and
 * an empty apiVersion string. The returned object is a copy — mutations do not
 * affect future calls (pure function).
 *
 * @param {string} provider - Provider name (e.g., 'anthropic')
 * @returns {ProviderCapabilities}
 */
function getProviderCapabilities(provider) {
  if (!_isKnownProvider(provider)) {
    return {
      provider: typeof provider === 'string' ? provider : '',
      supportedModels: [],
      features: [],
      apiVersion: '',
    };
  }

  const config = PROVIDER_CONFIGS[provider];
  return {
    provider,
    supportedModels: [...config.supportedModels],
    features: [...config.features],
    apiVersion: config.apiVersion,
  };
}

/**
 * Check whether a model entry supports a given feature.
 *
 * Checks both raw provider feature names (e.g., 'tool_use', 'extended_thinking')
 * AND canonical boolean flag names (e.g., 'supportsToolUse', 'supportsReasoning').
 *
 * This function is pure: it does not modify the modelEntry and always returns
 * the same result for the same inputs.
 *
 * @param {Object|null|undefined} modelEntry - Model entry with a `features` array
 * @param {string|null|undefined} feature    - Feature name to check (raw or canonical)
 * @returns {boolean}
 */
function isFeatureSupported(modelEntry, feature) {
  if (!feature || typeof feature !== 'string') return false;

  const features =
    modelEntry != null && Array.isArray(modelEntry.features) ? modelEntry.features : [];

  // 1. Direct raw feature name match (e.g., 'tool_use', 'extended_thinking')
  if (features.includes(feature)) return true;

  // 2. Canonical flag name match (e.g., 'supportsToolUse', 'supportsReasoning')
  //    Check all raw aliases registered for that canonical flag.
  if (Object.prototype.hasOwnProperty.call(FLAG_TO_RAW_FEATURES, feature)) {
    return FLAG_TO_RAW_FEATURES[feature].some(alias => features.includes(alias));
  }

  return false;
}

module.exports = {
  normalizeModelConfig,
  getProviderCapabilities,
  isFeatureSupported,
};
