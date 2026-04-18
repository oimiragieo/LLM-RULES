'use strict';

/**
 * hook-file-validator.cjs
 *
 * Validates that hook files referenced in .claude/settings.json
 * actually exist on disk and are tracked by git.
 *
 * Used by pre-spawn-hook-check to detect "phantom hooks" that would
 * cause silent failures in git worktrees.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { safeParseJSON } = require('./safe-json.cjs');

/**
 * Returns the set of git-tracked files for the repository root, or null when
 * git metadata is unavailable.
 *
 * Uses a single `git ls-files -z` call so hook validation stays fast even when
 * dozens of hooks are registered.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {Set<string>|null}
 */
function listTrackedFiles(projectRoot) {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'buffer',
      windowsHide: true,
    });
    return new Set(
      output
        .toString('utf8')
        .split('\0')
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => item.replace(/\\/g, '/'))
    );
  } catch {
    return null;
  }
}

/**
 * Extracts hook file paths from a settings.json file.
 *
 * Scans all hook command strings for patterns like:
 *   node .claude/hooks/foo/bar.cjs
 *   node ".claude/hooks/foo/bar.cjs"
 *
 * @param {string} settingsPath - Absolute path to .claude/settings.json
 * @returns {string[]} Array of relative hook paths (e.g. ".claude/hooks/...")
 */
function extractHookPaths(settingsPath) {
  if (!fs.existsSync(settingsPath)) {
    return [];
  }

  let raw;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    return [];
  }

  const parsed = safeParseJSON(raw, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  // Collect all command strings from hooks object
  const commands = [];
  const hooksObj = parsed.hooks || {};

  for (const eventHooks of Object.values(hooksObj)) {
    if (!Array.isArray(eventHooks)) continue;
    for (const entry of eventHooks) {
      if (!entry || !Array.isArray(entry.hooks)) continue;
      for (const hook of entry.hooks) {
        if (hook && typeof hook.command === 'string') {
          commands.push(hook.command);
        }
      }
    }
  }

  // Extract node script paths from command strings
  // Matches: node <path>.cjs|.js|.mjs  (with or without surrounding quotes)
  const NODE_SCRIPT_RE = /node\s+["']?([^\s"']+\.(?:cjs|js|mjs))["']?/g;
  const paths = new Set();

  for (const cmd of commands) {
    let match;
    NODE_SCRIPT_RE.lastIndex = 0;
    while ((match = NODE_SCRIPT_RE.exec(cmd)) !== null) {
      paths.add(match[1]);
    }
  }

  return Array.from(paths);
}

/**
 * Validates hook files: checks existence on disk and git tracking.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{
 *   valid: boolean,
 *   missing: string[],
 *   untracked: string[],
 *   total: number
 * }}
 */
function validateHookFiles(projectRoot) {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const hookPaths = extractHookPaths(settingsPath);
  const trackedFiles = listTrackedFiles(projectRoot);

  const missing = [];
  const untracked = [];

  for (const hp of hookPaths) {
    const abs = path.join(projectRoot, hp);

    if (!fs.existsSync(abs)) {
      missing.push(hp);
      continue;
    }

    if (trackedFiles && !trackedFiles.has(hp.replace(/\\/g, '/'))) {
      untracked.push(hp);
    }
  }

  const valid = missing.length === 0 && untracked.length === 0;

  return {
    valid,
    missing,
    untracked,
    total: hookPaths.length,
  };
}

module.exports = { extractHookPaths, listTrackedFiles, validateHookFiles };
