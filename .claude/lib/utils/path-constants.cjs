'use strict';
/**
 * Path Constants — Single Source of Truth (W-1)
 * ================================================
 * CJS-compatible (require()-able from hooks and creators).
 * All paths normalised to forward slashes for Windows compatibility.
 *
 * Usage:
 *   const { SKILL_INDEX_PATH, INTEGRATION_QUEUE_PATH, resolveProjectPath }
 *     = require('.claude/lib/utils/path-constants.cjs');
 */

const path = require('path');
const { PROJECT_ROOT: _rawRoot } = require('./project-root.cjs');

// Normalize separator: always forward slashes, even on Windows
const norm = p => p.replace(/\\/g, '/');

const _root = norm(_rawRoot);
const _dot = norm(path.join(_rawRoot, '.claude'));
const _ctx = norm(path.join(_rawRoot, '.claude', 'context'));
const _cfg = norm(path.join(_rawRoot, '.claude', 'config'));

// --- Directory constants ---
const HOOKS_DIR = norm(path.join(_dot, 'hooks'));
const SKILLS_DIR = norm(path.join(_dot, 'skills'));
const AGENTS_DIR = norm(path.join(_dot, 'agents'));
const CONFIG_DIR = _cfg;
const CONTEXT_DIR = _ctx;
const SCHEMAS_DIR = norm(path.join(_dot, 'schemas'));
const TOOLS_DIR = norm(path.join(_dot, 'tools'));

// --- File constants ---
const SKILL_INDEX_PATH = norm(path.join(_cfg, 'skill-index.json'));
const CATALOG_PATH = norm(path.join(_dot, 'docs', 'skill-catalog.md'));
const AGENT_REGISTRY_PATH = norm(path.join(_ctx, 'agent-registry.json'));
const ACTIVE_CREATORS_PATH = norm(path.join(_ctx, 'runtime', 'active-creators.json'));
const INTEGRATION_QUEUE_PATH = norm(path.join(_ctx, 'runtime', 'integration-queue.jsonl'));

/**
 * Resolve a project-relative path to an absolute, normalised path.
 * Throws on null/empty input or path traversal.
 *
 * @param {string} relativePath
 * @returns {string} absolute, forward-slash normalised path
 */
function resolveProjectPath(relativePath) {
  if (!relativePath) throw new Error('relativePath is required');
  const resolved = norm(path.resolve(_rawRoot, relativePath));
  if (!resolved.startsWith(_root)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}

module.exports = {
  PROJECT_ROOT: _root,
  HOOKS_DIR,
  SKILLS_DIR,
  AGENTS_DIR,
  CONFIG_DIR,
  CONTEXT_DIR,
  SCHEMAS_DIR,
  TOOLS_DIR,
  SKILL_INDEX_PATH,
  CATALOG_PATH,
  AGENT_REGISTRY_PATH,
  ACTIVE_CREATORS_PATH,
  INTEGRATION_QUEUE_PATH,
  resolveProjectPath,
};
