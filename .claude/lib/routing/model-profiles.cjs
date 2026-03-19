'use strict';

/**
 * Named Model Profiles
 *
 * Manages model profiles with cost tiers and capability descriptions.
 * Implements the model resolution precedence chain:
 *   1. Explicit override (Task() call)
 *   2. Agent frontmatter model field
 *   3. config.yaml agents.{type}.model
 *   4. Complexity-based default
 *   5. Fallback: sonnet
 *
 * @module model-profiles
 */

const DEFAULT_PROFILES = {
  haiku: {
    id: 'haiku',
    costTier: 1,
    description: 'Fast, low-cost model for simple tasks, compression, and lookups',
    maxTokens: 200000,
    strengths: ['speed', 'cost-efficiency', 'simple-tasks'],
  },
  sonnet: {
    id: 'sonnet',
    costTier: 2,
    description: 'Balanced model for standard implementation, testing, and analysis',
    maxTokens: 200000,
    strengths: ['balance', 'implementation', 'testing'],
  },
  opus: {
    id: 'opus',
    costTier: 3,
    description: 'Most capable model for complex reasoning, security, and architecture',
    maxTokens: 1000000,
    strengths: ['reasoning', 'security', 'architecture', 'orchestration'],
  },
};

class ModelProfiles {
  /**
   * @param {Object} [customProfiles] - Additional profiles to merge with defaults
   */
  constructor(customProfiles) {
    this._profiles = new Map();
    const all = { ...DEFAULT_PROFILES, ...(customProfiles || {}) };
    for (const [id, profile] of Object.entries(all)) {
      this._profiles.set(id, { ...profile });
    }
  }

  /**
   * Get a profile by ID.
   * @param {string} id
   * @returns {Object|null}
   */
  getProfile(id) {
    return this._profiles.has(id) ? { ...this._profiles.get(id) } : null;
  }

  /**
   * List all profiles.
   * @returns {Array<Object>}
   */
  listProfiles() {
    return [...this._profiles.values()].map(p => ({ ...p }));
  }

  /**
   * Add a new profile.
   * @param {{ id: string, costTier: number, description: string }} profile
   */
  addProfile(profile) {
    this._profiles.set(profile.id, { ...profile });
  }

  /**
   * Remove a profile.
   * @param {string} id
   */
  removeProfile(id) {
    this._profiles.delete(id);
  }
}

/**
 * Resolve model using precedence chain.
 *
 * @param {{ explicit?: string, frontmatter?: string, configYaml?: string, complexityDefault?: string }} sources
 * @returns {{ model: string, source: string }}
 */
function resolveModel(sources) {
  if (sources.explicit) return { model: sources.explicit, source: 'explicit' };
  if (sources.frontmatter) return { model: sources.frontmatter, source: 'frontmatter' };
  if (sources.configYaml) return { model: sources.configYaml, source: 'configYaml' };
  if (sources.complexityDefault)
    return { model: sources.complexityDefault, source: 'complexityDefault' };
  return { model: 'sonnet', source: 'fallback' };
}

module.exports = {
  ModelProfiles,
  resolveModel,
  DEFAULT_PROFILES,
};
