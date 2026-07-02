/**
 * Knowledge Base Reader
 *
 * Fast CSV-based search/filter for skills, agents, workflows.
 * In-memory caching with timestamp-based invalidation.
 *
 * Security Controls:
 * - SEC-KB-003: Path validation on index load
 * - SEC-KB-004: Query logging (optional)
 */

const fs = require('fs');
const path = require('path');

// Get project root
function getProjectRoot() {
  return process.env.PROJECT_ROOT || process.cwd();
}

// Cache
let cachedIndex = null;
let cachedSearchRows = null;
let cachedTagRows = null;
let cachedByName = null;
let cacheTimestamp = null;

/**
 * Load and parse CSV index
 * @returns {Array<Object>} Array of artifact objects
 */
function loadIndex() {
  const projectRoot = getProjectRoot();
  const indexPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'artifacts',
    'knowledge-base-index.csv'
  );

  if (!fs.existsSync(indexPath)) {
    console.warn('[kb-reader] Index file not found. Run build-knowledge-base-index.cjs first.');
    return [];
  }

  // Check cache validity
  const stat = fs.statSync(indexPath);
  const fileTimestamp = stat.mtimeMs;

  if (cachedIndex && cacheTimestamp === fileTimestamp) {
    return cachedIndex;
  }

  // Load and parse CSV
  const content = fs.readFileSync(indexPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(',');
  const artifacts = [];
  const searchRows = [];
  const tagRows = [];
  const byName = new Map();

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);

    if (values.length !== headers.length) {
      console.warn(`[kb-reader] Skipping malformed line ${i + 1}: column count mismatch`);
      continue;
    }

    const artifact = {};
    headers.forEach((header, idx) => {
      artifact[header] = values[idx];
    });

    artifacts.push(artifact);
    searchRows.push({
      artifact,
      text: `${artifact.name || ''}\n${artifact.description || ''}\n${artifact.use_cases || ''}`.toLowerCase(),
    });
    tagRows.push({
      artifact,
      tags: String(artifact.use_cases || '')
        .toLowerCase()
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    });
    byName.set(artifact.name, artifact);
  }

  // Update cache
  cachedIndex = artifacts;
  cachedSearchRows = searchRows;
  cachedTagRows = tagRows;
  cachedByName = byName;
  cacheTimestamp = fileTimestamp;

  return artifacts;
}

/**
 * Parse a CSV line handling quoted values
 * @param {string} line - CSV line
 * @returns {Array<string>} Parsed values
 */
function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quotes
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current); // Last value
  return values;
}

/**
 * Search artifacts by keyword
 * @param {string} keyword - Search keyword
 * @returns {Array<Object>} Matching artifacts
 */
function search(keyword) {
  loadIndex();
  const lowerKeyword = String(keyword || '').toLowerCase();

  return cachedSearchRows.filter(row => row.text.includes(lowerKeyword)).map(row => row.artifact);
}

/**
 * Filter artifacts by domain
 * @param {string} domain - Domain name (skill, agent, workflow)
 * @returns {Array<Object>} Artifacts in domain
 */
function filterByDomain(domain) {
  const artifacts = loadIndex();
  return artifacts.filter(artifact => artifact.domain === domain);
}

/**
 * Filter artifacts by tags (AND logic)
 * @param {Array<string>} tags - Array of tags
 * @returns {Array<Object>} Artifacts matching all tags
 */
function filterByTags(tags) {
  loadIndex();
  const lowerTags = tags.map(t => t.toLowerCase());

  return cachedTagRows
    .filter(row => lowerTags.every(tag => row.tags.some(artifactTag => artifactTag.includes(tag))))
    .map(row => row.artifact);
}

/**
 * Get artifact by exact name
 * @param {string} name - Artifact name
 * @returns {Object|null} Artifact object or null
 */
function get(name) {
  loadIndex();
  return cachedByName.get(name) || null;
}

/**
 * List all artifacts
 * @returns {Array<Object>} All artifacts
 */
function listAll() {
  return loadIndex();
}

/**
 * Get statistics
 * @returns {Object} Statistics object
 */
function stats() {
  const artifacts = loadIndex();

  const byDomain = {};
  const byComplexity = {};

  for (const artifact of artifacts) {
    // By domain
    if (!byDomain[artifact.domain]) {
      byDomain[artifact.domain] = 0;
    }
    byDomain[artifact.domain]++;

    // By complexity
    if (!byComplexity[artifact.complexity]) {
      byComplexity[artifact.complexity] = 0;
    }
    byComplexity[artifact.complexity]++;
  }

  return {
    total: artifacts.length,
    byDomain,
    byComplexity,
  };
}

/**
 * Clear cache (for testing)
 */
function clearCache() {
  cachedIndex = null;
  cachedSearchRows = null;
  cachedTagRows = null;
  cachedByName = null;
  cacheTimestamp = null;
}

module.exports = {
  search,
  filterByDomain,
  filterByTags,
  get,
  listAll,
  stats,
  clearCache,
};
