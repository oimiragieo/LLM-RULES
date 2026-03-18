'use strict';

/**
 * Codebase Mapper
 *
 * Categorizes and tracks files in the agent-studio codebase by type
 * (agent, skill, hook, lib, test, schema, config, other).
 *
 * Used by ecosystem-auditor and project-analyzer for codebase discovery.
 *
 * @module codebase-mapper
 */

const CATEGORY_AGENT = 'agent';
const CATEGORY_SKILL = 'skill';
const CATEGORY_HOOK = 'hook';
const CATEGORY_LIB = 'lib';
const CATEGORY_TEST = 'test';
const CATEGORY_SCHEMA = 'schema';
const CATEGORY_CONFIG = 'config';
const CATEGORY_OTHER = 'other';

const ALL_CATEGORIES = [
  CATEGORY_AGENT,
  CATEGORY_SKILL,
  CATEGORY_HOOK,
  CATEGORY_LIB,
  CATEGORY_TEST,
  CATEGORY_SCHEMA,
  CATEGORY_CONFIG,
  CATEGORY_OTHER,
];

/**
 * Pattern rules for auto-categorization (order matters — first match wins).
 * Paths are normalized to forward slashes before matching.
 */
const CATEGORY_RULES = [
  { pattern: /\.claude\/agents\//, category: CATEGORY_AGENT },
  { pattern: /\.claude\/skills\//, category: CATEGORY_SKILL },
  { pattern: /\.claude\/hooks\//, category: CATEGORY_HOOK },
  { pattern: /\.claude\/lib\//, category: CATEGORY_LIB },
  { pattern: /\.claude\/schemas\//, category: CATEGORY_SCHEMA },
  { pattern: /\.claude\/config\//, category: CATEGORY_CONFIG },
  { pattern: /tests\//, category: CATEGORY_TEST },
];

class CodebaseMapper {
  constructor() {
    /** @type {Map<string, Set<string>>} category → set of file paths */
    this._map = new Map();
    for (const cat of ALL_CATEGORIES) {
      this._map.set(cat, new Set());
    }
  }

  /**
   * Determine the category for a file path.
   *
   * @param {string} filePath
   * @returns {string} Category constant
   */
  categorizeFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return CATEGORY_OTHER;

    // Normalize backslashes (SE-01: Windows paths)
    const normalized = filePath.replace(/\\/g, '/');

    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(normalized)) {
        return rule.category;
      }
    }

    return CATEGORY_OTHER;
  }

  /**
   * Register a file in the codebase map.
   *
   * @param {string} filePath
   * @param {string} [category] - Optional explicit category override
   */
  registerFile(filePath, category) {
    if (!filePath || typeof filePath !== 'string') return;

    // Normalize backslashes
    const normalized = filePath.replace(/\\/g, '/');
    const cat =
      category && ALL_CATEGORIES.includes(category) ? category : this.categorizeFile(normalized);

    this._map.get(cat).add(normalized);
  }

  /**
   * Get the full map as a plain object (arrays, not Sets).
   *
   * @returns {Object.<string, string[]>}
   */
  getMap() {
    const result = {};
    for (const [cat, files] of this._map) {
      result[cat] = [...files].sort();
    }
    return result;
  }

  /**
   * Get counts per category plus total.
   *
   * @returns {Object.<string, number> & { total: number }}
   */
  getSummary() {
    const result = { total: 0 };
    for (const cat of ALL_CATEGORIES) {
      const count = this._map.get(cat).size;
      result[cat] = count;
      result.total += count;
    }
    return result;
  }

  /**
   * Serialize to JSON-friendly object.
   *
   * @returns {{ map: Object, summary: Object, updatedAt: string }}
   */
  toJSON() {
    return {
      map: this.getMap(),
      summary: this.getSummary(),
      updatedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  CodebaseMapper,
  CATEGORY_AGENT,
  CATEGORY_SKILL,
  CATEGORY_HOOK,
  CATEGORY_LIB,
  CATEGORY_TEST,
  CATEGORY_SCHEMA,
  CATEGORY_CONFIG,
  CATEGORY_OTHER,
  ALL_CATEGORIES,
};
