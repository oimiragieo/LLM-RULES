'use strict';

/**
 * agent-registry-loader.cjs - Unified Agent Registry Reader
 *
 * Reads split registry files and merges into unified format.
 * Supports:
 *   - loadAll() -> full merged registry (for validation scripts)
 *   - loadCategory(category) -> single category (for routing, saves tokens)
 *   - findAgent(agentId) -> single agent lookup (most efficient)
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const REGISTRY_DIR = path.join(PROJECT_ROOT, '.claude', 'context');
const INDEX_FILE = path.join(REGISTRY_DIR, 'agent-registry-index.json');

let cache = null;

function loadIndex() {
  const raw = fs.readFileSync(INDEX_FILE, 'utf8');
  return safeParseJSON(raw);
}

function loadCategory(category) {
  const index = loadIndex();
  const entry = index.metadata.registryFiles.find(f => f.category === category);
  if (!entry) return { agents: {} };
  const filePath = path.join(REGISTRY_DIR, entry.path);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return safeParseJSON(raw);
  } catch (err) {
    console.error(`[agent-registry-loader] Failed to load category ${category}:`, err.message);
    return { agents: {} };
  }
}

function loadAll() {
  if (cache) return cache;
  const index = loadIndex();
  const merged = {
    version: index.version,
    generatedAt: index.generatedAt,
    metadata: { totalAgents: index.metadata.totalAgents },
    agents: {},
  };
  for (const entry of index.metadata.registryFiles) {
    const filePath = path.join(REGISTRY_DIR, entry.path);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = safeParseJSON(raw);
      if (parsed.agents) {
        Object.assign(merged.agents, parsed.agents);
      }
    } catch (err) {
      console.error(`[agent-registry-loader] Failed to load ${entry.path}:`, err.message);
    }
  }
  cache = merged;
  return merged;
}

function findAgent(agentId) {
  const all = loadAll();
  return all.agents[agentId] ?? null;
}

function clearCache() {
  cache = null;
}

module.exports = { loadAll, loadCategory, findAgent, loadIndex, clearCache };
