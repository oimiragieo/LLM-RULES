#!/usr/bin/env node
/**
 * Ecosystem Impact Analyzer
 * =========================
 *
 * Analyzes the downstream integration impact of creating a new artifact.
 * Uses the ecosystem-impact-graph.json to determine what must-have,
 * should-have, and nice-to-have integrations are needed.
 *
 * Replaces advisory "consider if companion creators are needed" with
 * structured, automated impact analysis.
 *
 * @module ecosystem-impact-analyzer
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');

// Path to the impact graph data file
const IMPACT_GRAPH_PATH = path.join(
  PROJECT_ROOT, '.claude', 'context', 'data', 'ecosystem-impact-graph.json'
);

/**
 * Safe JSON parse with prototype pollution prevention
 * @param {string} str - JSON string
 * @returns {Object|null} Parsed object or null
 */
function safeParseJSON(str) {
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const clean = Object.create(null);
      for (const key of Object.keys(parsed)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }
        clean[key] = parsed[key];
      }
      return Object.assign({}, clean);
    }
    return parsed;
  } catch (_e) {
    return null;
  }
}

/**
 * Load the ecosystem impact graph from disk.
 * Returns null on failure (graceful degradation).
 *
 * @returns {Object|null} The impact graph or null
 */
function loadImpactGraph() {
  try {
    if (!fs.existsSync(IMPACT_GRAPH_PATH)) {
      return null;
    }
    const raw = fs.readFileSync(IMPACT_GRAPH_PATH, 'utf8');
    return safeParseJSON(raw);
  } catch (_err) {
    return null;
  }
}

/**
 * Analyze the downstream impact of creating a new artifact.
 *
 * Loads the ecosystem-impact-graph.json and returns a structured
 * report of what integrations are needed.
 *
 * @param {string} artifactType - Type of artifact (agent, skill, hook, etc.)
 * @param {string} artifactPath - Path to the artifact
 * @returns {{ artifactType: string, artifactPath: string, mustHave: Object[], shouldHave: Object[], niceToHave: Object[], completionScore: number }}
 */
function analyzeImpact(artifactType, artifactPath) {
  const result = {
    artifactType,
    artifactPath,
    mustHave: [],
    shouldHave: [],
    niceToHave: [],
    completionScore: 0,
  };

  const graph = loadImpactGraph();
  if (!graph || !graph.artifactTypes) {
    return result;
  }

  const typeConfig = graph.artifactTypes[artifactType];
  if (!typeConfig) {
    return result;
  }

  // Map impact items with status tracking
  if (typeConfig.mustHave) {
    result.mustHave = typeConfig.mustHave.map(item => ({
      ...item,
      status: 'pending',
    }));
  }

  if (typeConfig.shouldHave) {
    result.shouldHave = typeConfig.shouldHave.map(item => ({
      ...item,
      status: 'pending',
    }));
  }

  if (typeConfig.niceToHave) {
    result.niceToHave = typeConfig.niceToHave.map(item => ({
      ...item,
      status: 'pending',
    }));
  }

  // Calculate completion score (0-1)
  // All items start as pending, so score is 0
  // This will be updated by checkMustHaveCompletion
  if (result.mustHave.length > 0) {
    const completed = result.mustHave.filter(item => item.status === 'completed').length;
    result.completionScore = completed / result.mustHave.length;
  } else {
    result.completionScore = 1; // No must-have items = complete
  }

  return result;
}

/**
 * Check if must-have integration items are actually present.
 *
 * For each must-have action, checks if the integration has been
 * completed (e.g., catalog entry exists, registry entry exists).
 *
 * @param {string} artifactType - Type of artifact
 * @param {string} artifactPath - Path to the artifact
 * @returns {{ complete: boolean, missing: string[], present: string[] }}
 */
function checkMustHaveCompletion(artifactType, artifactPath) {
  const missing = [];
  const present = [];

  const graph = loadImpactGraph();
  if (!graph || !graph.artifactTypes) {
    return { complete: true, missing, present };
  }

  const typeConfig = graph.artifactTypes[artifactType];
  if (!typeConfig || !typeConfig.mustHave) {
    return { complete: true, missing, present };
  }

  // Extract artifact name from path for catalog lookups
  const artifactName = path.basename(artifactPath, path.extname(artifactPath))
    .replace(/\.schema$/, '') // Remove .schema from schema files
    .replace(/^SKILL$/, '') // Remove SKILL for skill files
    .toLowerCase();

  // Get parent directory name for skill lookups
  const parentDir = path.basename(path.dirname(artifactPath)).toLowerCase();

  for (const item of typeConfig.mustHave) {
    const isPresent = checkSingleItem(item, artifactPath, artifactName, parentDir);
    if (isPresent) {
      present.push(item.action);
    } else {
      missing.push(item.action);
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    present,
  };
}

/**
 * Check if a single must-have item is completed.
 *
 * @param {Object} item - The must-have item from impact graph
 * @param {string} artifactPath - Path to the artifact
 * @param {string} artifactName - Extracted artifact name
 * @param {string} parentDir - Parent directory name
 * @returns {boolean} True if the item is present/completed
 */
function checkSingleItem(item, artifactPath, artifactName, parentDir) {
  // For items with a target file, check if the artifact is referenced in it
  if (item.target && typeof item.target === 'string') {
    const targetPath = path.join(PROJECT_ROOT, item.target);
    if (!fs.existsSync(targetPath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(targetPath, 'utf8');
      const searchName = parentDir || artifactName;
      // Check if artifact name appears in the target file
      return content.toLowerCase().includes(searchName);
    } catch (_err) {
      return false;
    }
  }

  // For items without a target (validation-type items), assume not done
  return false;
}

module.exports = {
  analyzeImpact,
  checkMustHaveCompletion,
  // Internal exports for testing
  loadImpactGraph,
  safeParseJSON,
  IMPACT_GRAPH_PATH,
};
