'use strict';

/**
 * Plugin Marketplace Git Integration
 *
 * Manages git-based plugin marketplaces:
 * - Clone marketplace repos from a git URL into a local directory
 * - Update (pull) existing marketplace repos
 * - Discover available plugins from all cloned marketplace directories
 *
 * Directory layout managed by this module:
 *   marketplacesDir/
 *     <marketplace-name>/      ← cloned git repo
 *       <plugin-name>/         ← plugin directory
 *         .claude-plugin/
 *           plugin.json        ← plugin manifest (name, description, version, …)
 *     known_marketplaces.json  ← registry of known marketplaces (PluginRegistry)
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { loadManifest } = require('./manifest.cjs');
const { PluginRegistry } = require('./registry.cjs');

const GIT_EXEC_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Allowlist regex for git repository URLs.
 *
 * Accepts only HTTPS URLs from recognized hosts (github.com, gitlab.com,
 * bitbucket.org, codeberg.org, and subdomains thereof) or local absolute
 * filesystem paths (for trusted offline mirrors and tests).
 *
 * This blocks:
 *   - Non-HTTPS protocols (ssh://, git://, file://, http://, javascript:, etc.)
 *   - Shell metacharacters ($, `, ;, &, |, >, <, \n) which cannot appear in
 *     a valid HTTPS URL or absolute path
 *   - Git option injection (anything starting with `-` — handled by the `--`
 *     terminator in the execFileSync call, but rejected here as defense-in-depth)
 *
 * @private
 */
const ALLOWED_GIT_URL_RE =
  /^https:\/\/(?:[\w-]+\.)*(?:github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)\/[\w.\-/]+(?:\.git)?\/?$/i;

/**
 * Allowlist regex for local filesystem paths used as git sources.
 * Supports Windows (C:\... or C:/...) and POSIX (/...) absolute paths.
 * Rejects shell metacharacters.
 *
 * @private
 */
const ALLOWED_LOCAL_PATH_RE = /^(?:[a-zA-Z]:[\\/]|\/)[^$`;&|<>*?"'\n\r]*$/;

/**
 * Validate a git URL/source path against the allowlist.
 *
 * @private
 * @param {string} gitUrl - Git URL or local path to validate
 * @throws {Error} If the URL fails validation
 */
function validateGitSource(gitUrl) {
  if (typeof gitUrl !== 'string' || gitUrl.length === 0) {
    throw new Error('Invalid git source: must be a non-empty string');
  }
  if (gitUrl.length > 2048) {
    throw new Error('Invalid git source: exceeds 2048 characters');
  }
  // Reject anything that starts with '-' to block git option injection
  // (e.g. --upload-pack=..., --config=...). The `--` terminator in the
  // execFileSync call below is the primary defense; this is belt-and-suspenders.
  if (gitUrl.startsWith('-')) {
    throw new Error(`Refusing git source starting with '-' (option injection): ${gitUrl}`);
  }
  if (ALLOWED_GIT_URL_RE.test(gitUrl)) {
    return;
  }
  if (ALLOWED_LOCAL_PATH_RE.test(gitUrl) && fs.existsSync(gitUrl)) {
    return;
  }
  throw new Error(
    `Refusing to clone git source: ${gitUrl}. ` +
      `Only HTTPS URLs on github.com/gitlab.com/bitbucket.org/codeberg.org ` +
      `or existing local absolute paths are permitted.`
  );
}

/**
 * Validate a marketplace name.
 *
 * Marketplace names are used as directory names under marketplacesDir.
 * Restrict to safe characters to prevent path traversal (../) and
 * platform-specific path injection.
 *
 * @private
 * @param {string} name - Marketplace name
 * @throws {Error} If the name fails validation
 */
function validateMarketplaceName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Invalid marketplace name: must be a non-empty string');
  }
  if (name.length > 100) {
    throw new Error('Invalid marketplace name: exceeds 100 characters');
  }
  if (!/^[a-zA-Z0-9][\w.-]*$/.test(name)) {
    throw new Error(
      `Invalid marketplace name: ${name}. ` +
        `Must start with an alphanumeric and contain only [A-Za-z0-9._-].`
    );
  }
  if (name === '.' || name === '..') {
    throw new Error(`Invalid marketplace name: ${name}`);
  }
}

function buildGitExecOptions(extra = {}) {
  return {
    stdio: 'pipe',
    windowsHide: true,
    shell: false,
    timeout: GIT_EXEC_TIMEOUT_MS,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
    },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clone a git repository as a new marketplace and register it.
 *
 * Creates `marketplacesDir/<name>` by running `git clone`, then adds an
 * entry to `known_marketplaces.json` inside `marketplacesDir`.
 *
 * @param {object} options
 * @param {string} options.name            - Marketplace name (becomes the subdirectory name)
 * @param {string} options.gitUrl          - Git repository URL or local path to clone
 * @param {string} options.marketplacesDir - Directory where marketplaces are stored
 * @throws {Error} If git clone fails or the marketplace already exists
 */
function cloneMarketplace({ name, gitUrl, marketplacesDir }) {
  // Validate inputs BEFORE any filesystem or process operation (SEC-H-04).
  // - name restricted to [A-Za-z0-9._-] to prevent directory traversal
  // - gitUrl restricted to HTTPS allowlist or existing local paths
  validateMarketplaceName(name);
  validateGitSource(gitUrl);

  fs.mkdirSync(marketplacesDir, { recursive: true });

  const targetDir = path.join(marketplacesDir, name);

  // SEC-H-04 (CWE-78): Use execFileSync with array args and shell:false.
  // The `--` terminator prevents git from interpreting the URL as an option
  // (blocks --upload-pack=..., --config=..., etc. even if validation is bypassed).
  // shell:false ensures no shell metacharacter interpretation, making this
  // immune to command injection via $(...), `...`, ;, &, |, <, >, \n.
  execFileSync('git', ['clone', '--depth=1', '--', gitUrl, targetDir], buildGitExecOptions());

  // Register the marketplace in known_marketplaces.json
  const registry = new PluginRegistry(marketplacesDir);
  registry.addMarketplace(name, gitUrl);
}

/**
 * Pull the latest changes for an existing marketplace.
 *
 * Runs `git pull` inside `marketplacesDir/<name>` and refreshes the
 * `lastUpdated` timestamp in `known_marketplaces.json`.
 *
 * @param {object} options
 * @param {string} options.name            - Marketplace name
 * @param {string} options.marketplacesDir - Directory where marketplaces are stored
 * @throws {Error} If the marketplace directory does not exist or git pull fails
 */
function updateMarketplace({ name, marketplacesDir }) {
  // Validate name BEFORE building the cwd path (SEC-H-04 defense-in-depth).
  validateMarketplaceName(name);

  const marketplaceDir = path.join(marketplacesDir, name);

  if (!fs.existsSync(marketplaceDir)) {
    throw new Error(`Marketplace "${name}" not found at: ${marketplaceDir}`);
  }

  // SEC-H-04 (CWE-78): Use execFileSync with array args and shell:false.
  // No user input is interpolated into the command, but we still enforce
  // shell:false for consistency and defense-in-depth.
  execFileSync('git', ['pull'], buildGitExecOptions({ cwd: marketplaceDir }));

  // Refresh lastUpdated in the registry
  const registry = new PluginRegistry(marketplacesDir);
  const existing = registry.loadMarketplaces().find(m => m.name === name);
  if (existing) {
    registry.addMarketplace(name, existing.url);
  }
}

/**
 * Discover all available plugins across all cloned marketplace directories.
 *
 * Scans every subdirectory of `marketplacesDir` as a potential marketplace
 * repo, then scans each marketplace's subdirectories for a manifest. Entries
 * with a missing, unparseable, or schema-invalid manifest are silently skipped.
 *
 * @param {string} marketplacesDir - Directory containing cloned marketplace repos
 * @returns {Array<{
 *   name: string,
 *   description: string,
 *   version: string,
 *   marketplace: string,
 *   pluginDir: string
 * }>}  List of discovered plugins with metadata
 */
function discoverPlugins(marketplacesDir) {
  if (!fs.existsSync(marketplacesDir)) {
    return [];
  }

  const plugins = [];

  // List marketplace subdirectories (skip files and hidden dirs like .git)
  let marketplaceEntries;
  try {
    marketplaceEntries = fs
      .readdirSync(marketplacesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'));
  } catch (_err) {
    return [];
  }

  for (const mktEntry of marketplaceEntries) {
    const marketplaceName = mktEntry.name;
    const marketplaceDir = path.join(marketplacesDir, marketplaceName);

    // List potential plugin subdirectories inside this marketplace
    let pluginEntries;
    try {
      pluginEntries = fs
        .readdirSync(marketplaceDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.'));
    } catch (_err) {
      continue;
    }

    for (const pluginEntry of pluginEntries) {
      const pluginDir = path.join(marketplaceDir, pluginEntry.name);
      const { valid, manifest } = loadManifest(pluginDir);
      if (!valid) {
        continue;
      }

      plugins.push({
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        marketplace: marketplaceName,
        pluginDir,
      });
    }
  }

  return plugins;
}

module.exports = {
  cloneMarketplace,
  updateMarketplace,
  discoverPlugins,
  validateGitSource,
  validateMarketplaceName,
  buildGitExecOptions,
};
