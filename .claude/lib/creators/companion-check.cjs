'use strict';
const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { isValidArtifactName, normalizePath } = require('../utils/path-helpers.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Load the companion matrix from ecosystem-impact-graph.json
 * @param {string} [graphPath] - Optional custom path to graph file
 * @returns {Object} The companionMatrix section
 */
function loadCompanionMatrix(graphPath) {
  const defaultPath = path.join(PROJECT_ROOT, '.claude/context/data/ecosystem-impact-graph.json');
  const filePath = graphPath || defaultPath;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Ecosystem impact graph not found at ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const graph = safeParseJSON(content);

  if (!graph) {
    throw new Error(`Failed to parse ecosystem impact graph at ${filePath}`);
  }

  if (!graph.companionMatrix) {
    throw new Error(`companionMatrix key not found in ${filePath}`);
  }

  return graph.companionMatrix;
}

/**
 * Check companions for a given artifact
 * @param {string} artifactType - Type of artifact (agent, skill, hook, etc.)
 * @param {string} artifactName - Name of the artifact
 * @param {Object} [opts={}] - Options
 * @param {string} [opts.graphPath] - Custom graph path
 * @param {string} [opts.projectRoot] - Custom project root
 * @returns {Object} Companion check results
 */
function checkCompanions(artifactType, artifactName, opts = {}) {
  const projectRoot = opts.projectRoot || PROJECT_ROOT;

  // SEC-ICE-001: Validate artifact name
  if (!isValidArtifactName(artifactName)) {
    throw new Error(`Invalid artifact name: ${artifactName} (path traversal or reserved name detected)`);
  }

  const matrix = loadCompanionMatrix(opts.graphPath);

  if (!matrix[artifactType]) {
    throw new Error(`Unknown artifact type: ${artifactType}`);
  }

  const companions = matrix[artifactType];
  const result = {
    artifactType,
    artifactName,
    required: [],
    recommended: [],
    optional: [],
    summary: {
      total: 0,
      found: 0,
      missing: 0
    }
  };

  // Check each companion category
  for (const category of ['required', 'recommended', 'optional']) {
    const categoryCompanions = companions[category] || [];

    for (const companion of categoryCompanions) {
      const checkResult = runCompanionCheck(companion, artifactName, projectRoot);
      result[category].push(checkResult);

      result.summary.total++;
      if (checkResult.exists) {
        result.summary.found++;
      } else {
        result.summary.missing++;
      }
    }
  }

  return result;
}

/**
 * Run a specific companion check
 * @param {Object} companion - Companion definition
 * @param {string} artifactName - Name of the artifact
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Check result with exists flag and details
 */
function runCompanionCheck(companion, artifactName, projectRoot) {
  const checkResult = {
    ...companion,
    exists: false,
    details: ''
  };

  const targetPath = companion.target ? companion.target.replace(/\{name\}/g, artifactName) : '';
  const pattern = companion.pattern ? companion.pattern.replace(/\{name\}/g, artifactName) : artifactName;

  try {
    switch (companion.check) {
      case 'file-exists':
        checkResult.exists = checkFileExists(targetPath, projectRoot);
        checkResult.details = checkResult.exists
          ? `File found: ${targetPath}`
          : `File not found: ${targetPath}`;
        break;

      case 'grep-in-file':
        checkResult.exists = checkGrepInFile(targetPath, pattern, projectRoot);
        checkResult.details = checkResult.exists
          ? `Pattern "${pattern}" found in ${targetPath}`
          : `Pattern "${pattern}" not found in ${targetPath}`;
        break;

      case 'json-key-exists':
        checkResult.exists = checkJSONKeyExists(targetPath, artifactName, projectRoot);
        checkResult.details = checkResult.exists
          ? `Key "${artifactName}" found in ${targetPath}`
          : `Key "${artifactName}" not found in ${targetPath}`;
        break;

      case 'glob-match':
        checkResult.exists = checkGlobMatch(pattern, projectRoot);
        checkResult.details = checkResult.exists
          ? `Files matching "${pattern}" found`
          : `No files matching "${pattern}" found`;
        break;

      case 'settings-registered':
        checkResult.exists = checkSettingsRegistered(artifactName, projectRoot);
        checkResult.details = checkResult.exists
          ? `Hook "${artifactName}" registered in settings.json`
          : `Hook "${artifactName}" not registered in settings.json`;
        break;

      default:
        checkResult.details = `Unknown check strategy: ${companion.check}`;
    }
  } catch (error) {
    checkResult.details = `Error during check: ${error.message}`;
  }

  return checkResult;
}

/**
 * Check if a file exists
 */
function checkFileExists(targetPath, projectRoot) {
  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(projectRoot, targetPath);
  return fs.existsSync(fullPath);
}

/**
 * Check if a pattern exists in a file (supports glob patterns in target)
 */
function checkGrepInFile(targetPath, pattern, projectRoot) {
  // Handle glob patterns in targetPath
  if (targetPath.includes('*')) {
    const files = globSync(targetPath, projectRoot);
    for (const file of files) {
      if (checkGrepInSingleFile(file, pattern)) {
        return true;
      }
    }
    return false;
  }

  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(projectRoot, targetPath);

  return checkGrepInSingleFile(fullPath, pattern);
}

function checkGrepInSingleFile(filePath, pattern) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const regex = new RegExp(pattern, 'i');
    return regex.test(content);
  } catch (_error) {
    return false;
  }
}

/**
 * Check if a key exists in a JSON file
 */
function checkJSONKeyExists(targetPath, key, projectRoot) {
  const fullPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(projectRoot, targetPath);

  if (!fs.existsSync(fullPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const json = safeParseJSON(content);

    if (!json) {
      return false;
    }

    // Check if key exists at any level (for nested objects)
    return hasKey(json, key);
  } catch (_error) {
    return false;
  }
}

function hasKey(obj, key) {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  if (key in obj) {
    return true;
  }

  for (const prop in obj) {
    if (hasKey(obj[prop], key)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if any files match a glob pattern
 */
function checkGlobMatch(pattern, projectRoot) {
  const files = globSync(pattern, projectRoot);
  return files.length > 0;
}

/**
 * Simple glob implementation using fs recursive scan
 */
function globSync(pattern, projectRoot) {
  const results = [];
  const baseDir = extractBaseDir(pattern);
  const regexPattern = globToRegex(pattern);

  const searchDir = path.isAbsolute(baseDir)
    ? baseDir
    : path.join(projectRoot, baseDir);

  if (!fs.existsSync(searchDir)) {
    return results;
  }

  function scan(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(projectRoot, fullPath);
        const normalizedPath = normalizePath(relativePath);

        if (regexPattern.test(normalizedPath)) {
          results.push(fullPath);
        }

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(fullPath);
        }
      }
    } catch (_error) {
      // Skip directories we can't read
    }
  }

  scan(searchDir);
  return results;
}

function extractBaseDir(pattern) {
  const parts = pattern.split('/');
  const baseIndex = parts.findIndex(p => p.includes('*'));
  if (baseIndex === -1) {
    return path.dirname(pattern);
  }
  return parts.slice(0, baseIndex).join('/') || '.';
}

function globToRegex(pattern) {
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*');

  return new RegExp(`^${regex}$`);
}

/**
 * Check if a hook is registered in settings.json
 */
function checkSettingsRegistered(hookName, projectRoot) {
  const settingsPath = path.join(projectRoot, '.claude/settings.json');

  if (!fs.existsSync(settingsPath)) {
    return false;
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf8');
    const settings = safeParseJSON(content);

    if (!settings || !settings.hooks) {
      return false;
    }

    // Check if hook is registered in any event type
    // settings.hooks structure:
    // {
    //   "PreToolUse": [
    //     { "matcher": "", "hooks": [{ "type": "command", "command": "node .claude/hooks/..." }] }
    //   ]
    // }
    for (const eventType in settings.hooks) {
      const eventHooks = settings.hooks[eventType];
      if (!Array.isArray(eventHooks)) {
        continue;
      }

      for (const hookGroup of eventHooks) {
        if (!hookGroup.hooks || !Array.isArray(hookGroup.hooks)) {
          continue;
        }

        for (const hook of hookGroup.hooks) {
          if (hook.command && hook.command.includes(hookName)) {
            return true;
          }
        }
      }
    }

    return false;
  } catch (_error) {
    return false;
  }
}

/**
 * Format companion check results as a markdown checklist
 * @param {Object} result - Results from checkCompanions
 * @returns {string} Markdown formatted checklist
 */
function formatCompanionChecklist(result) {
  const lines = [];

  lines.push(`## Companion Check: ${result.artifactType} "${result.artifactName}"`);
  lines.push('');

  lines.push('### Required');
  for (const companion of result.required) {
    const checkbox = companion.exists ? '[x]' : '[ ]';
    lines.push(`- ${checkbox} ${companion.type} — ${companion.details}`);
  }
  lines.push('');

  lines.push('### Recommended');
  for (const companion of result.recommended) {
    const checkbox = companion.exists ? '[x]' : '[ ]';
    lines.push(`- ${checkbox} ${companion.type} — ${companion.details}`);
  }
  lines.push('');

  lines.push('### Optional');
  for (const companion of result.optional) {
    const checkbox = companion.exists ? '[x]' : '[ ]';
    lines.push(`- ${checkbox} ${companion.type} — ${companion.details}`);
  }
  lines.push('');

  lines.push('### Summary');
  lines.push(`- Total companions: ${result.summary.total}`);
  lines.push(`- Found: ${result.summary.found}`);
  lines.push(`- Missing: ${result.summary.missing}`);

  return lines.join('\n');
}

/**
 * Get auto-spawn suggestions for missing companions
 * SEC-ICE-002: Auto-spawn safety with depth limits and cycle detection
 * @param {Object} result - Results from checkCompanions
 * @param {Object} [opts={}] - Options
 * @param {number} [opts.maxDepth=2] - Maximum spawn depth
 * @param {number} [opts.maxPerEvent=5] - Maximum spawns per event
 * @param {Set} [opts.spawnedTypes] - Set of already spawned types for cycle detection
 * @param {number} [opts.currentDepth=0] - Current recursion depth
 * @returns {Array} Array of spawn suggestions
 */
function getAutoSpawnSuggestions(result, opts = {}) {
  const maxDepth = opts.maxDepth || 2;
  const maxPerEvent = opts.maxPerEvent || 5;
  const spawnedTypes = opts.spawnedTypes || new Set();
  const currentDepth = opts.currentDepth || 0;

  // Check kill switch
  const autoSpawn = process.env.AUTO_COMPANION_SPAWN || 'off';
  if (autoSpawn === 'off') {
    return [];
  }

  // Check depth limit
  if (currentDepth >= maxDepth) {
    return [];
  }

  const suggestions = [];

  // Only suggest missing required companions
  for (const companion of result.required) {
    if (!companion.exists && suggestions.length < maxPerEvent) {
      // Cycle detection
      if (spawnedTypes.has(companion.type)) {
        continue;
      }

      suggestions.push({
        companionType: companion.type,
        artifactType: result.artifactType,
        artifactName: result.artifactName,
        description: companion.description,
        target: companion.target,
        depth: currentDepth
      });
    }
  }

  return suggestions.slice(0, maxPerEvent);
}

module.exports = {
  loadCompanionMatrix,
  checkCompanions,
  formatCompanionChecklist,
  getAutoSpawnSuggestions
};
