'use strict';

/**
 * Smart Duplicate Detection Library
 * Phase 1: Core library — 3-layer duplicate detection for creator skill ecosystem.
 *
 * Layers:
 *   1. Filesystem — canonical path existence check
 *   2. Registry  — catalog/registry name lookup
 *   3. Fuzzy     — Jaccard similarity with abbreviation expansion
 *
 * Security: SE-01 (path normalization), SE-02 (safeParseJSON only, no raw JSON.parse)
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { tokenize, jaccardSimilarity } = require('../routing/fuzzy-intent-matcher.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD = parseFloat(process.env.DUPLICATE_DETECTION_THRESHOLD) || 0.55;
const DEFAULT_MAX_CANDIDATES = 10;

/** Normalize a path to forward slashes (SE-01). */
function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/');
}

/** Abbreviation expansions applied before fuzzy comparison. */
const ABBREVIATIONS = {
  js: 'javascript',
  ts: 'typescript',
  k8s: 'kubernetes',
  db: 'database',
  auth: 'authentication',
  msg: 'message',
  cfg: 'config',
  mgr: 'manager',
  gen: 'generator',
};

/** Common suffixes stripped before comparison. */
const STRIP_SUFFIXES = ['-creator', '-pro', '-expert', '-specialist', '-updater'];

/**
 * Expand abbreviations and strip common suffixes from a name string.
 * @param {string} name
 * @returns {string}
 */
function normalizeForFuzzy(name) {
  let normalized = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  // Strip common suffixes
  for (const suffix of STRIP_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, normalized.length - suffix.length);
      break; // only strip one suffix
    }
  }

  // Expand abbreviations in hyphen-separated segments
  const parts = normalized.split('-').filter(Boolean);
  const expanded = parts.map(p => ABBREVIATIONS[p] || p);
  return expanded.join('-');
}

// ---------------------------------------------------------------------------
// Layer 1: Filesystem check
// ---------------------------------------------------------------------------

/**
 * Layer 1: Check if an artifact already exists at its canonical filesystem path.
 *
 * @param {string} artifactType  - 'skill'|'agent'|'hook'|'workflow'|'template'|'schema'
 * @param {string} name          - Artifact name (kebab-case)
 * @param {string} projectRoot   - Absolute project root path
 * @returns {{ found: boolean, matchedPath: string|null }}
 */
function checkFilesystem(artifactType, name, projectRoot) {
  try {
    const root = normalizePath(projectRoot);
    const candidates = getCanonicalPaths(artifactType, name, root);

    for (const candidate of candidates) {
      const normalized = normalizePath(candidate);
      if (fs.existsSync(normalized)) {
        return { found: true, matchedPath: normalized };
      }
    }
    return { found: false, matchedPath: null };
  } catch (err) {
    process.stderr.write(`[duplicate-detector] checkFilesystem error: ${err.message}\n`);
    return { found: false, matchedPath: null };
  }
}

/**
 * Build the list of canonical filesystem paths to check for a given artifact type and name.
 * @param {string} artifactType
 * @param {string} name
 * @param {string} root - Normalized project root
 * @returns {string[]}
 */
function getCanonicalPaths(artifactType, name, root) {
  switch (artifactType) {
    case 'skill':
      return [`${root}/.claude/skills/${name}/SKILL.md`];

    case 'agent':
      return [
        `${root}/.claude/agents/core/${name}.md`,
        `${root}/.claude/agents/domain/${name}.md`,
        `${root}/.claude/agents/specialized/${name}.md`,
        `${root}/.claude/agents/orchestrators/${name}.md`,
      ];

    case 'hook':
      return findRecursive(`${root}/.claude/hooks`, `${name}.cjs`);

    case 'workflow':
      return findRecursive(`${root}/.claude/workflows`, `${name}.md`);

    case 'template':
      return findRecursive(`${root}/.claude/templates`, `${name}.md`);

    case 'schema':
      return [
        `${root}/.claude/schemas/${name}.schema.json`,
        `${root}/.claude/schemas/skill-${name}-output.schema.json`,
        `${root}/.claude/schemas/${name}.json`,
      ];

    default:
      return [];
  }
}

/**
 * Walk a directory recursively and collect all files matching the given filename.
 * Returns paths as forward-slash strings (SE-01).
 * @param {string} dir
 * @param {string} filename
 * @returns {string[]}
 */
function findRecursive(dir, filename) {
  const results = [];
  try {
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = normalizePath(path.join(dir, entry.name));
      if (entry.isDirectory()) {
        results.push(...findRecursive(fullPath, filename));
      } else if (entry.name === filename) {
        results.push(fullPath);
      }
    }
  } catch (_err) {
    // Silently return partial results on permission errors
  }
  return results;
}

// ---------------------------------------------------------------------------
// Layer 2: Registry check
// ---------------------------------------------------------------------------

/**
 * Layer 2: Check registries and catalogs for an existing artifact by name.
 *
 * @param {string} artifactType
 * @param {string} name
 * @param {string} projectRoot
 * @returns {{ found: boolean, matchedPath: string|null }}
 */
function checkRegistry(artifactType, name, projectRoot) {
  try {
    const root = normalizePath(projectRoot);

    switch (artifactType) {
      case 'agent':
        return checkAgentRegistry(name, root);
      case 'skill':
        return checkSkillRegistry(name, root);
      case 'hook':
        return checkHookRegistry(name, root);
      case 'workflow':
        return checkCatalogText(
          name,
          `${root}/.claude/context/artifacts/catalogs/workflow-catalog.md`
        );
      case 'template':
        return checkCatalogText(
          name,
          `${root}/.claude/context/artifacts/catalogs/template-catalog.md`
        );
      case 'schema':
        return checkCatalogText(
          name,
          `${root}/.claude/context/artifacts/catalogs/schema-catalog.md`
        );
      default:
        return { found: false, matchedPath: null };
    }
  } catch (err) {
    process.stderr.write(`[duplicate-detector] checkRegistry error: ${err.message}\n`);
    return { found: false, matchedPath: null };
  }
}

/**
 * Check the agent-registry.json for an agent by name.
 */
function checkAgentRegistry(name, root) {
  const registryPath = normalizePath(`${root}/.claude/context/agent-registry.json`);
  if (!fs.existsSync(registryPath)) {
    return { found: false, matchedPath: null };
  }

  let content;
  try {
    content = fs.readFileSync(registryPath, 'utf-8');
  } catch (_err) {
    return { found: false, matchedPath: null };
  }

  const data = safeParseJSON(content, null);
  const agents = data && data.agents;
  if (!agents || typeof agents !== 'object') {
    return { found: false, matchedPath: null };
  }

  const normalizedName = String(name).toLowerCase();
  for (const key of Object.keys(agents)) {
    if (String(key).toLowerCase() === normalizedName) {
      const filePath =
        agents[key] && agents[key].filePath ? normalizePath(String(agents[key].filePath)) : null;
      return { found: true, matchedPath: filePath };
    }
  }
  return { found: false, matchedPath: null };
}

/**
 * Check skill-index.json and skill-catalog.md for a skill by name.
 */
function checkSkillRegistry(name, root) {
  const skillIndexPath = normalizePath(
    `${root}/.claude/config/skill-index.json`
  );
  const normalizedName = String(name).toLowerCase();

  // Try skill-index.json first
  if (fs.existsSync(skillIndexPath)) {
    try {
      const content = fs.readFileSync(skillIndexPath, 'utf-8');
      const data = safeParseJSON(content, null);

      // skill-index may be an object with skills as keys or an array
      if (data && typeof data === 'object') {
        const entries = Array.isArray(data) ? data : Object.keys(data);
        for (const entry of entries) {
          const entryName = typeof entry === 'string' ? entry : entry && entry.name;
          if (entryName && String(entryName).toLowerCase() === normalizedName) {
            return { found: true, matchedPath: skillIndexPath };
          }
        }
      }
    } catch (_err) {
      // Fall through to catalog text search
    }
  }

  // Fallback: search skill-catalog.md
  const catalogPath = normalizePath(`${root}/.claude/docs/skill-catalog.md`);
  if (fs.existsSync(catalogPath)) {
    try {
      const content = fs.readFileSync(catalogPath, 'utf-8');
      const pattern = new RegExp(`\\b${escapeRegex(normalizedName)}\\b`, 'i');
      if (pattern.test(content)) {
        return { found: true, matchedPath: catalogPath };
      }
    } catch (_err) {
      // Silently fall through
    }
  }

  return { found: false, matchedPath: null };
}

/**
 * Check settings.json hook command paths for a hook by name.
 */
function checkHookRegistry(name, root) {
  const settingsPath = normalizePath(`${root}/.claude/settings.json`);
  if (!fs.existsSync(settingsPath)) {
    return { found: false, matchedPath: null };
  }

  let content;
  try {
    content = fs.readFileSync(settingsPath, 'utf-8');
  } catch (_err) {
    return { found: false, matchedPath: null };
  }

  const normalizedName = String(name).toLowerCase();
  // Simple text search for the hook filename in the settings file
  const searchTerm = `${normalizedName}.cjs`;
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes(searchTerm)) {
    return { found: true, matchedPath: settingsPath };
  }
  return { found: false, matchedPath: null };
}

/**
 * Search a markdown catalog file for a table row containing the artifact name.
 * Looks for patterns like `| {name} |` in the file.
 */
function checkCatalogText(name, catalogPath) {
  const normalizedCatalogPath = normalizePath(catalogPath);
  if (!fs.existsSync(normalizedCatalogPath)) {
    return { found: false, matchedPath: null };
  }

  try {
    const content = fs.readFileSync(normalizedCatalogPath, 'utf-8');
    const normalizedName = String(name).toLowerCase();
    // Match table rows: | name | or ` name ` patterns
    const rowPattern = new RegExp(`\\|\\s*${escapeRegex(normalizedName)}\\s*\\|`, 'i');
    if (rowPattern.test(content)) {
      return { found: true, matchedPath: normalizedCatalogPath };
    }
  } catch (_err) {
    // Silently return not-found on read error
  }
  return { found: false, matchedPath: null };
}

/** Escape special regex characters in a string. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Layer 3: Fuzzy matching
// ---------------------------------------------------------------------------

/**
 * Layer 3: Fuzzy matching against existing artifacts of the same type.
 *
 * @param {string} artifactType
 * @param {string} name           - Proposed artifact name
 * @param {string} description    - Proposed artifact description (optional)
 * @param {string[]} keywords     - Proposed artifact keywords (optional)
 * @param {string} projectRoot
 * @param {number} [threshold]    - Similarity threshold (default: DUPLICATE_DETECTION_THRESHOLD)
 * @param {number} [maxCandidates]
 * @returns {Array<{name: string, path: string, score: number}>}
 */
function checkFuzzy(
  artifactType,
  name,
  description,
  keywords,
  projectRoot,
  threshold,
  maxCandidates
) {
  try {
    const t = threshold != null ? threshold : DEFAULT_THRESHOLD;
    const maxC = maxCandidates != null ? maxCandidates : DEFAULT_MAX_CANDIDATES;
    const root = normalizePath(projectRoot);

    const corpus = buildCorpus(artifactType, name, root);
    if (corpus.length === 0) return [];

    const normalizedProposed = normalizeForFuzzy(name);
    const proposedNameTokens = tokenize(normalizedProposed);
    const proposedDescTokens = description ? tokenize(String(description)) : [];
    const proposedKeywordTokens = Array.isArray(keywords)
      ? keywords.flatMap(k => tokenize(String(k)))
      : [];
    const proposedCombinedTokens = [...proposedNameTokens, ...proposedKeywordTokens];

    const results = [];
    for (const item of corpus) {
      const itemNormalized = normalizeForFuzzy(item.name);
      const itemNameTokens = tokenize(itemNormalized);
      const itemDescTokens = item.description ? tokenize(String(item.description)) : [];
      const itemCombinedTokens = [
        ...itemNameTokens,
        ...(item.triggerPhrases || []).flatMap(p => tokenize(String(p))),
      ];

      // Name similarity (primary)
      const nameScore = jaccardSimilarity(proposedNameTokens, itemNameTokens);

      // Description similarity (secondary), only if both have descriptions
      let descScore = 0;
      if (proposedDescTokens.length > 0 && itemDescTokens.length > 0) {
        descScore = jaccardSimilarity(proposedDescTokens, itemDescTokens);
      } else if (proposedCombinedTokens.length > 0 && itemCombinedTokens.length > 0) {
        descScore = jaccardSimilarity(proposedCombinedTokens, itemCombinedTokens);
      }

      const combinedScore = nameScore * 0.7 + descScore * 0.3;

      if (combinedScore >= t) {
        results.push({
          name: item.name,
          path: item.path,
          score: Math.round(combinedScore * 1000) / 1000,
        });
      }
    }

    // Sort by score descending, return top N
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxC);
  } catch (err) {
    process.stderr.write(`[duplicate-detector] checkFuzzy error: ${err.message}\n`);
    return [];
  }
}

/**
 * Build a corpus of existing artifacts for the given type from the filesystem and registry.
 * @param {string} artifactType
 * @param {string} proposedName  - Excluded from corpus
 * @param {string} root
 * @returns {Array<{name: string, path: string, description?: string, triggerPhrases?: string[]}>}
 */
function buildCorpus(artifactType, proposedName, root) {
  const corpus = [];
  const seenNames = new Set();

  // Add entries from agent registry for agents (includes triggerPhrases and description)
  if (artifactType === 'agent') {
    const registryPath = normalizePath(`${root}/.claude/context/agent-registry.json`);
    if (fs.existsSync(registryPath)) {
      try {
        const content = fs.readFileSync(registryPath, 'utf-8');
        const data = safeParseJSON(content, null);
        const agents = data && data.agents;
        if (agents && typeof agents === 'object') {
          for (const [agentName, agentData] of Object.entries(agents)) {
            if (
              !agentName ||
              String(agentName).toLowerCase() === String(proposedName).toLowerCase()
            )
              continue;
            if (seenNames.has(agentName)) continue;
            seenNames.add(agentName);

            const caps = Array.isArray(agentData && agentData.capabilities)
              ? agentData.capabilities
              : [];
            const firstCap = caps[0] || {};
            corpus.push({
              name: agentName,
              path:
                agentData && agentData.filePath ? normalizePath(String(agentData.filePath)) : '',
              description: firstCap.description || '',
              triggerPhrases: Array.isArray(firstCap.triggerPhrases) ? firstCap.triggerPhrases : [],
            });
          }
        }
      } catch (_err) {
        // Silently continue with empty agent corpus
      }
    }
  }

  // Scan filesystem directories for other types
  const scanDirs = getScanDirs(artifactType, root);
  for (const { dir, pattern } of scanDirs) {
    const normalizedDir = normalizePath(dir);
    if (!fs.existsSync(normalizedDir)) continue;

    try {
      const entries = collectArtifactEntries(normalizedDir, pattern);
      for (const entry of entries) {
        if (String(entry.name).toLowerCase() === String(proposedName).toLowerCase()) continue;
        if (seenNames.has(entry.name)) continue;
        seenNames.add(entry.name);
        corpus.push(entry);
      }
    } catch (_err) {
      // Silently continue
    }
  }

  return corpus;
}

/**
 * Get directory scan configuration per artifact type.
 */
function getScanDirs(artifactType, root) {
  switch (artifactType) {
    case 'skill':
      return [{ dir: `${root}/.claude/skills`, pattern: 'directory' }];
    case 'agent':
      return [
        { dir: `${root}/.claude/agents/core`, pattern: '.md' },
        { dir: `${root}/.claude/agents/domain`, pattern: '.md' },
        { dir: `${root}/.claude/agents/specialized`, pattern: '.md' },
        { dir: `${root}/.claude/agents/orchestrators`, pattern: '.md' },
      ];
    case 'hook':
      return [{ dir: `${root}/.claude/hooks`, pattern: '.cjs' }];
    case 'workflow':
      return [{ dir: `${root}/.claude/workflows`, pattern: '.md' }];
    case 'template':
      return [{ dir: `${root}/.claude/templates`, pattern: '.md' }];
    case 'schema':
      return [{ dir: `${root}/.claude/schemas`, pattern: '.json' }];
    default:
      return [];
  }
}

/**
 * Collect artifact entries from a directory.
 * For skills: uses subdirectory names (each skill is a directory containing SKILL.md).
 * For others: uses file names without extension.
 */
function collectArtifactEntries(dir, pattern) {
  const entries = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (pattern === 'directory') {
        // Skill directories
        if (item.isDirectory()) {
          const skillMd = normalizePath(path.join(dir, item.name, 'SKILL.md'));
          if (fs.existsSync(skillMd)) {
            entries.push({ name: item.name, path: skillMd });
          }
        }
      } else if (item.isFile() && item.name.endsWith(pattern)) {
        // Files matching extension
        const name = item.name.slice(0, item.name.length - pattern.length);
        if (name) {
          entries.push({ name, path: normalizePath(path.join(dir, item.name)) });
        }
      } else if (item.isDirectory()) {
        // Recurse into subdirectories for hooks/workflows/templates/schemas
        const subEntries = collectArtifactEntries(
          normalizePath(path.join(dir, item.name)),
          pattern
        );
        entries.push(...subEntries);
      }
    }
  } catch (_err) {
    // Return partial results on permission errors
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Main entry point: checkDuplicate
// ---------------------------------------------------------------------------

/**
 * Run all configured duplicate detection layers in sequence.
 * Returns on first positive match.
 *
 * @param {Object} options
 * @param {string} options.artifactType  - 'skill'|'agent'|'hook'|'workflow'|'template'|'schema'
 * @param {string} options.name          - Proposed artifact name
 * @param {string} [options.description] - Proposed artifact description
 * @param {string[]} [options.keywords]  - Proposed artifact keywords
 * @param {string} options.projectRoot   - Absolute project root path
 * @param {number} [options.threshold]   - Fuzzy similarity threshold (default 0.55)
 * @param {number} [options.maxCandidates] - Max fuzzy candidates (default 10)
 * @returns {{
 *   decision: 'EXACT_MATCH'|'REGISTRY_MATCH'|'SIMILAR_FOUND'|'NO_MATCH',
 *   matchedPath: string|null,
 *   candidates: Array<{name: string, path: string, score: number}>,
 *   message: string
 * }}
 */
function checkDuplicate(options) {
  const {
    artifactType,
    name,
    description = '',
    keywords = [],
    projectRoot = process.cwd(),
    threshold,
    maxCandidates,
  } = options || {};

  // Kill switch: skip all checks if disabled
  const enabled = String(process.env.DUPLICATE_DETECTION_ENABLED || 'true').toLowerCase();
  if (enabled === 'false' || enabled === '0') {
    return {
      decision: 'NO_MATCH',
      matchedPath: null,
      candidates: [],
      message: 'Duplicate detection disabled via DUPLICATE_DETECTION_ENABLED env var.',
    };
  }

  // Determine which layers to run
  const layersEnv = process.env.DUPLICATE_DETECTION_LAYERS || 'filesystem,registry,fuzzy';
  const layers = layersEnv
    .split(',')
    .map(l => l.trim().toLowerCase())
    .filter(Boolean);

  // Layer 1: Filesystem
  if (layers.includes('filesystem')) {
    try {
      const fsResult = checkFilesystem(artifactType, name, projectRoot);
      if (fsResult.found) {
        return {
          decision: 'EXACT_MATCH',
          matchedPath: fsResult.matchedPath,
          candidates: [],
          message: `Exact filesystem match found at: ${fsResult.matchedPath}`,
        };
      }
    } catch (err) {
      process.stderr.write(`[duplicate-detector] Layer 1 error: ${err.message}\n`);
    }
  }

  // Layer 2: Registry
  if (layers.includes('registry')) {
    try {
      const regResult = checkRegistry(artifactType, name, projectRoot);
      if (regResult.found) {
        return {
          decision: 'REGISTRY_MATCH',
          matchedPath: regResult.matchedPath,
          candidates: [],
          message: `Registry match found at: ${regResult.matchedPath}`,
        };
      }
    } catch (err) {
      process.stderr.write(`[duplicate-detector] Layer 2 error: ${err.message}\n`);
    }
  }

  // Layer 3: Fuzzy
  if (layers.includes('fuzzy')) {
    try {
      const fuzzyCandidates = checkFuzzy(
        artifactType,
        name,
        description,
        keywords,
        projectRoot,
        threshold,
        maxCandidates
      );
      if (fuzzyCandidates.length > 0) {
        return {
          decision: 'SIMILAR_FOUND',
          matchedPath: fuzzyCandidates[0].path || null,
          candidates: fuzzyCandidates,
          message: `Similar artifacts found: ${fuzzyCandidates.map(c => `${c.name} (${(c.score * 100).toFixed(0)}%)`).join(', ')}`,
        };
      }
    } catch (err) {
      process.stderr.write(`[duplicate-detector] Layer 3 error: ${err.message}\n`);
    }
  }

  return {
    decision: 'NO_MATCH',
    matchedPath: null,
    candidates: [],
    message: `No duplicate found for ${artifactType} '${name}'.`,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkDuplicate,
  checkFilesystem,
  checkRegistry,
  checkFuzzy,
};
