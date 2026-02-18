#!/usr/bin/env node
/**
 * Agent Config Reader
 * ====================
 *
 * Resolves agent models from configuration sources with proper precedence.
 *
 * ADR-075: Router Model Selection from Configuration
 *
 * PRECEDENCE ORDER (highest to lowest):
 * 1. Explicit Task() spawn parameter (handled by caller, not this module)
 * 2. Agent frontmatter model: field
 * 3. config.yaml agents.{type}.model entry
 * 4. Complexity-based default (opus for planners, haiku for compressors)
 * 5. Fallback: sonnet
 *
 * Usage:
 *   const { resolveAgentModel, normalizeModel } = require('./agent-config-reader.cjs');
 *   const result = resolveAgentModel('planner', projectRoot);
 *   // result: { model: 'claude-opus-4-5-20251101', shorthand: 'opus', source: 'config.yaml' }
 *
 * @module agent-config-reader
 */

'use strict';

const fs = require('fs');
const path = require('path');

// =============================================================================
// MODEL ALIASES (shorthand <-> full ID)
// =============================================================================

/**
 * Bidirectional mapping between model shorthand and full IDs.
 * Used by router and hooks to normalize model names.
 */
const MODEL_ALIASES = {
  // Shorthand to full ID
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5',
  // Full ID to shorthand
  'claude-opus-4-5-20251101': 'opus',
  'claude-sonnet-4-5': 'sonnet',
  'claude-haiku-4-5': 'haiku',
};

// =============================================================================
// COMPLEXITY DEFAULTS (agent type -> default model shorthand)
// =============================================================================

/**
 * Default models by agent type based on task complexity.
 * Used as fallback when no configuration is found.
 *
 * High complexity (opus):
 * - planner, architect, qa, security-architect
 * - orchestrators
 * - domain experts needing deep reasoning
 *
 * Low complexity (haiku):
 * - context-compressor (simple summarization)
 *
 * Default (sonnet):
 * - All other agents
 */
const COMPLEXITY_DEFAULTS = {
  // Opus agents (high complexity, architecture/security/planning)
  planner: 'opus',
  architect: 'opus',
  qa: 'opus',
  'security-architect': 'opus',

  // Haiku agents (low complexity, simple tasks)
  'context-compressor': 'haiku',

  // Sonnet is default for everything else
  default: 'sonnet',
};

const yaml = require('js-yaml');

// =============================================================================
// CONFIG READING FUNCTIONS
// =============================================================================

/**
 * Load and parse config.yaml.
 * Uses js-yaml for robust parsing.
 *
 * @param {string} projectRoot - Project root directory
 * @returns {Object|null} Parsed config object or null if not found
 */
function loadConfig(projectRoot) {
  try {
    const env = process.env.AGENT_STUDIO_ENV;
    const baseDir = path.join(projectRoot, '.claude');
    const stagingPath = path.join(baseDir, 'config.staging.yaml');
    const defaultPath = path.join(baseDir, 'config.yaml');
    const configPath = env === 'staging' && fs.existsSync(stagingPath) ? stagingPath : defaultPath;
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const content = fs.readFileSync(configPath, 'utf8');
    // SEC-LIB-003 FIX: Use safe YAML schema to prevent deserialization attacks
    return yaml.load(content, { schema: yaml.CORE_SCHEMA });
  } catch (_e) {
    return null;
  }
}

/**
 * Get model from config.yaml for a specific agent type.
 *
 * @param {string} agentType - Agent type (e.g., 'planner', 'developer')
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Model string or null if not found
 */
function getModelFromConfig(agentType, projectRoot) {
  const config = loadConfig(projectRoot);
  if (!config || !config.agents || !config.agents[agentType]) {
    return null;
  }
  return config.agents[agentType].model || null;
}

/**
 * Get full agent configuration from config.yaml.
 *
 * @param {string} agentType - Agent type (e.g., 'planner', 'developer')
 * @param {string} projectRoot - Project root directory
 * @returns {Object|null} Agent config object or null
 */
function getAgentConfig(agentType, projectRoot) {
  const config = loadConfig(projectRoot);
  if (!config || !config.agents || !config.agents[agentType]) {
    return null;
  }
  return config.agents[agentType];
}

// =============================================================================
// FRONTMATTER READING FUNCTIONS
// =============================================================================

/**
 * Agent category directories to search.
 */
const AGENT_CATEGORIES = ['core', 'specialized', 'domain', 'orchestrators'];

/**
 * Get model from agent frontmatter.
 * Searches across all agent categories.
 *
 * @param {string} agentType - Agent type (e.g., 'planner', 'developer')
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Model string or null if not found
 */
function getModelFromFrontmatter(agentType, projectRoot) {
  try {
    // Search all agent categories
    for (const category of AGENT_CATEGORIES) {
      const agentPath = path.join(projectRoot, '.claude', 'agents', category, `${agentType}.md`);

      if (fs.existsSync(agentPath)) {
        const content = fs.readFileSync(agentPath, 'utf8');

        // Extract YAML frontmatter
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];

          // Extract model field
          const modelMatch = frontmatter.match(/^model:\s*(\S+)/m);
          if (modelMatch) {
            return modelMatch[1];
          }
        }
      }
    }

    return null;
  } catch (_e) {
    return null;
  }
}

// =============================================================================
// MODEL NORMALIZATION
// =============================================================================

/**
 * Normalize model string to full model ID.
 * Accepts shorthand (opus, sonnet, haiku) or full IDs.
 *
 * @param {string|null|undefined} model - Model string (shorthand or full ID)
 * @returns {string} Normalized full model ID
 */
function normalizeModel(model) {
  // Handle null/undefined/empty
  if (!model || typeof model !== 'string' || model.trim() === '') {
    return MODEL_ALIASES['sonnet']; // Default to sonnet
  }

  const trimmed = model.trim();

  // If it's a shorthand, convert to full ID
  if (MODEL_ALIASES[trimmed] && !trimmed.startsWith('claude-')) {
    return MODEL_ALIASES[trimmed];
  }

  // If it's already a full ID or unknown, return as-is
  return trimmed;
}

/**
 * Get shorthand from model string.
 *
 * @param {string} model - Model string (shorthand or full ID)
 * @returns {string} Model shorthand (opus, sonnet, haiku) or the input if unknown
 */
function getShorthand(model) {
  if (!model) return 'sonnet';

  const trimmed = model.trim();

  // If it's a full ID, convert to shorthand
  if (trimmed.startsWith('claude-') && MODEL_ALIASES[trimmed]) {
    return MODEL_ALIASES[trimmed];
  }

  // If it's already a shorthand, return as-is
  if (['opus', 'sonnet', 'haiku'].includes(trimmed)) {
    return trimmed;
  }

  return 'sonnet'; // Default
}

// =============================================================================
// MAIN RESOLUTION FUNCTION
// =============================================================================

/**
 * Resolve the model for an agent type.
 *
 * Precedence order:
 * 1. Agent frontmatter model: field
 * 2. config.yaml agents.{type}.model
 * 3. Complexity-based default
 *
 * @param {string} agentType - Agent type (e.g., 'planner', 'developer')
 * @param {string} [projectRoot=process.cwd()] - Project root directory
 * @returns {{ model: string, shorthand: string, source: string, raw: string|null }}
 */
function resolveAgentModel(agentType, projectRoot = process.cwd()) {
  // Validate input
  if (!agentType || typeof agentType !== 'string') {
    return {
      model: MODEL_ALIASES['sonnet'],
      shorthand: 'sonnet',
      source: 'complexity-default',
      raw: null,
    };
  }

  const normalizedAgent = agentType.trim().toLowerCase();

  // Step 1: Try agent frontmatter
  const frontmatterModel = getModelFromFrontmatter(normalizedAgent, projectRoot);
  if (frontmatterModel) {
    return {
      model: normalizeModel(frontmatterModel),
      shorthand: getShorthand(frontmatterModel),
      source: 'frontmatter',
      raw: frontmatterModel,
    };
  }

  // Step 2: Try config.yaml
  const configModel = getModelFromConfig(normalizedAgent, projectRoot);
  if (configModel) {
    return {
      model: normalizeModel(configModel),
      shorthand: getShorthand(configModel),
      source: 'config.yaml',
      raw: configModel,
    };
  }

  // Step 3: Use complexity-based default
  const complexityDefault = COMPLEXITY_DEFAULTS[normalizedAgent] || COMPLEXITY_DEFAULTS['default'];
  return {
    model: normalizeModel(complexityDefault),
    shorthand: complexityDefault,
    source: 'complexity-default',
    raw: null,
  };
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================

module.exports = {
  // Main resolution function
  resolveAgentModel,

  // Model normalization
  normalizeModel,
  getShorthand,

  // Config reading functions
  getAgentConfig,
  getModelFromConfig,
  getModelFromFrontmatter,

  // Constants
  MODEL_ALIASES,
  COMPLEXITY_DEFAULTS,
  AGENT_CATEGORIES,
};
