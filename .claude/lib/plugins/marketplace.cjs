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
 *         plugin.json          ← plugin manifest (name, description, version, …)
 *     known_marketplaces.json  ← registry of known marketplaces (PluginRegistry)
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { PluginRegistry } = require('./registry.cjs');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a path in double-quotes for safe shell interpolation.
 * Works on both POSIX and Windows (cmd.exe).
 *
 * @private
 * @param {string} p - File-system path
 * @returns {string}
 */
function q(p) {
  return `"${p.replace(/\\/g, '/').replace(/"/g, '\\"')}"`;
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
  fs.mkdirSync(marketplacesDir, { recursive: true });

  const targetDir = path.join(marketplacesDir, name);

  // Clone the repository into marketplacesDir/<name>.
  // q() wraps each argument in double-quotes and escapes internal quotes,
  // making the command safe for cmd.exe on Windows and POSIX shells alike.
  execSync('git clone ' + q(gitUrl) + ' ' + q(targetDir), { stdio: 'pipe', windowsHide: true });

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
  const marketplaceDir = path.join(marketplacesDir, name);

  if (!fs.existsSync(marketplaceDir)) {
    throw new Error(`Marketplace "${name}" not found at: ${marketplaceDir}`);
  }

  execSync('git pull', { cwd: marketplaceDir, stdio: 'pipe', windowsHide: true });

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
 * repo, then scans each marketplace's subdirectories for a `plugin.json`
 * manifest.  Entries with a missing, unparseable, or incomplete manifest
 * (missing name / description / version) are silently skipped.
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
      const manifestPath = path.join(pluginDir, 'plugin.json');

      // Skip directories without a plugin.json
      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      // Parse the manifest; skip on JSON errors
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (_err) {
        continue;
      }

      // Skip manifests missing required fields
      if (
        typeof manifest.name !== 'string' ||
        !manifest.name ||
        typeof manifest.description !== 'string' ||
        !manifest.description ||
        typeof manifest.version !== 'string' ||
        !manifest.version
      ) {
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
};
