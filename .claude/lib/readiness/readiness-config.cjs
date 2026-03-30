'use strict';

/**
 * Readiness Config
 * ================
 *
 * Loads per-project readiness configuration from .claude/readiness.json,
 * merging overrides onto DEFAULT_CONFIG.
 *
 * DEFAULT_CONFIG pillarWeights and levelBoundaries match the values in
 * readiness-scorer.cjs (PILLAR_WEIGHTS, LEVEL_BOUNDARIES).
 *
 * @module readiness-config
 */

const fs = require('fs');
const path = require('path');

/**
 * Default pillar weights — must match PILLAR_WEIGHTS in readiness-scorer.cjs
 */
const DEFAULT_PILLAR_WEIGHTS = {
  styleAndValidation: 1.0,
  buildSystem: 1.0,
  testing: 1.5,
  documentation: 0.8,
  developmentEnvironment: 0.8,
  debuggingAndObservability: 1.0,
  security: 1.2,
  taskDiscovery: 0.7,
  productAndExperimentation: 0.5,
};

/**
 * Default level boundaries — must match LEVEL_BOUNDARIES in readiness-scorer.cjs
 */
const DEFAULT_LEVEL_BOUNDARIES = [
  { name: 'L1', min: 0, max: 39 },
  { name: 'L2', min: 40, max: 59 },
  { name: 'L3', min: 60, max: 79 },
  { name: 'L4', min: 80, max: 94 },
  { name: 'L5', min: 95, max: 100 },
];

/**
 * Default readiness configuration
 */
const DEFAULT_CONFIG = {
  gateThreshold: 80,
  pillarWeights: { ...DEFAULT_PILLAR_WEIGHTS },
  levelBoundaries: DEFAULT_LEVEL_BOUNDARIES.map(b => ({ ...b })),
};

/**
 * Load readiness configuration for a project directory.
 *
 * Reads .claude/readiness.json if it exists and performs a deep merge onto
 * DEFAULT_CONFIG (individual pillar weights can be overridden without
 * specifying all pillars).
 *
 * Missing config file → returns DEFAULT_CONFIG without error.
 * Invalid JSON → logs a warning and returns DEFAULT_CONFIG.
 *
 * @param {string} projectDir - Root directory of the project
 * @returns {object} Merged config object
 */
function loadConfig(projectDir) {
  const configPath = path.join(projectDir, '.claude', 'readiness.json');

  if (!fs.existsSync(configPath)) {
    return {
      gateThreshold: DEFAULT_CONFIG.gateThreshold,
      pillarWeights: { ...DEFAULT_CONFIG.pillarWeights },
      levelBoundaries: DEFAULT_CONFIG.levelBoundaries.map(b => ({ ...b })),
    };
  }

  let userConfig;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    userConfig = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[readiness-config] Warning: invalid JSON in ${configPath}: ${err.message}. Using defaults.`
    );
    return {
      gateThreshold: DEFAULT_CONFIG.gateThreshold,
      pillarWeights: { ...DEFAULT_CONFIG.pillarWeights },
      levelBoundaries: DEFAULT_CONFIG.levelBoundaries.map(b => ({ ...b })),
    };
  }

  // Deep merge pillarWeights (individual pillars override without replacing whole object)
  const mergedWeights = {
    ...DEFAULT_CONFIG.pillarWeights,
    ...(userConfig.pillarWeights || {}),
  };

  return {
    gateThreshold:
      userConfig.gateThreshold !== undefined
        ? userConfig.gateThreshold
        : DEFAULT_CONFIG.gateThreshold,
    pillarWeights: mergedWeights,
    levelBoundaries:
      userConfig.levelBoundaries !== undefined
        ? userConfig.levelBoundaries
        : DEFAULT_CONFIG.levelBoundaries.map(b => ({ ...b })),
  };
}

/**
 * Get the pass threshold for a specific pillar.
 *
 * Returns pillarThresholds[pillar] if present, otherwise falls back to
 * config.gateThreshold, then DEFAULT_CONFIG.gateThreshold.
 *
 * @param {object} config - Loaded config object from loadConfig()
 * @param {string} pillar - Pillar name
 * @returns {number} Pass threshold (0-100)
 */
function getThreshold(config, pillar) {
  if (config && config.pillarThresholds && config.pillarThresholds[pillar] !== undefined) {
    return config.pillarThresholds[pillar];
  }
  return config ? config.gateThreshold : DEFAULT_CONFIG.gateThreshold;
}

/**
 * Get the pillar weight map from a config.
 *
 * Returns a copy of config.pillarWeights, falling back to DEFAULT_PILLAR_WEIGHTS.
 *
 * @param {object} config - Loaded config object from loadConfig()
 * @returns {object} Pillar weight map
 */
function getPillarWeights(config) {
  if (config && config.pillarWeights) {
    return { ...config.pillarWeights };
  }
  return { ...DEFAULT_CONFIG.pillarWeights };
}

module.exports = {
  loadConfig,
  getThreshold,
  getPillarWeights,
  DEFAULT_CONFIG,
  DEFAULT_PILLAR_WEIGHTS,
  DEFAULT_LEVEL_BOUNDARIES,
};
