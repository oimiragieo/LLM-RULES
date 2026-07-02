'use strict';

/**
 * Plugin CLI Commands
 *
 * Provides programmatic CLI-style commands for plugin management:
 * - installPlugin  – validates manifest, copies plugin to scope dir, updates registry
 * - uninstallPlugin – removes plugin files and registry entry
 * - updatePlugin   – returns current plugin info (entry point for future git-pull integration)
 * - listPlugins    – returns formatted list of installed plugins
 *
 * All operations are idempotent:
 * - Double install overwrites the existing installation
 * - Double uninstall is a no-op
 *
 * Directory layout managed by this module:
 *   pluginsDir/<scope>/<pluginId>/     ← installed plugin files
 *   registryDir/installed_plugins.json ← installation registry
 */

const fs = require('node:fs');
const path = require('node:path');

const { loadManifest } = require('./manifest.cjs');
const { PluginRegistry } = require('./registry.cjs');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Recursively copy a directory tree from src to dest.
 * Destination is created if it does not exist.
 * Uses fs.cpSync when available (Node 16.7+), falls back to manual recursion.
 *
 * @param {string} src
 * @param {string} dest
 */
function copyDirSync(src, dest) {
  if (typeof fs.cpSync === 'function') {
    fs.cpSync(src, dest, { recursive: true, force: true });
  } else {
    // Fallback for older Node versions
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

/**
 * Valid installation scopes.
 * @type {Set<string>}
 */
const VALID_PLUGIN_SCOPES = new Set(['project', 'user', 'org']);

/**
 * Plugin ids must be simple identifiers — no path separators, no leading dot,
 * so they can never be used to traverse outside the plugins directory.
 */
const PLUGIN_ID_RE = /^[a-zA-Z0-9][\w.-]*$/;

/**
 * Derive the installed path for a plugin given its registered scope.
 *
 * Validates both `scope` (allowlist) and `pluginId` (safe-identifier regex) and
 * asserts the resolved destination stays inside `pluginsDir`, preventing path
 * traversal / arbitrary write or delete (e.g. pluginId = '../../evil').
 *
 * @param {string} pluginsDir
 * @param {string} scope       'project' | 'user' | 'org'
 * @param {string} pluginId
 * @returns {string}
 */
function pluginInstallPath(pluginsDir, scope, pluginId) {
  if (!VALID_PLUGIN_SCOPES.has(String(scope))) {
    throw new Error(`Invalid plugin scope: ${scope}. Expected project, user, or org.`);
  }
  if (typeof pluginId !== 'string' || !PLUGIN_ID_RE.test(pluginId)) {
    throw new Error(`Invalid plugin id: ${pluginId}`);
  }
  const dest = path.join(pluginsDir, scope, pluginId);
  const resolvedBase = path.resolve(pluginsDir);
  const resolvedDest = path.resolve(dest);
  if (resolvedDest !== resolvedBase && !resolvedDest.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Plugin path escapes plugins directory: ${pluginId}`);
  }
  return dest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Install a plugin into the specified scope.
 *
 * Steps:
 *  1. Validate the plugin manifest in sourceDir
 *  2. Copy sourceDir → pluginsDir/<scope>/<pluginId>
 *  3. Add / update entry in installed_plugins.json
 *
 * Idempotent: calling this again for the same pluginId overwrites the existing
 * installation and refreshes the registry entry.
 *
 * @param {object} options
 * @param {string} options.pluginId   - Unique plugin identifier
 * @param {string} options.scope      - Installation scope: 'project' | 'user' | 'org'
 * @param {string} options.registryDir - Directory containing installed_plugins.json
 * @param {string} options.pluginsDir  - Base directory for installed plugin trees
 * @param {string} options.sourceDir   - Source directory of the plugin to install
 * @throws {Error} If the plugin manifest is missing or invalid
 */
function installPlugin({ pluginId, scope, registryDir, pluginsDir, sourceDir }) {
  // 1. Validate manifest
  const { valid, errors, manifest } = loadManifest(sourceDir);
  if (!valid) {
    const detail = errors && errors.length > 0 ? errors[0].message : 'unknown error';
    throw new Error(`Invalid plugin manifest for "${pluginId}": ${detail}`);
  }

  // 2. Copy plugin files to destination
  const destDir = pluginInstallPath(pluginsDir, scope, pluginId);
  copyDirSync(sourceDir, destDir);

  // 3. Update registry
  const registry = new PluginRegistry(registryDir);
  registry.install(pluginId, scope, { version: manifest.version });
}

/**
 * Uninstall a plugin.
 *
 * Steps:
 *  1. Look up the plugin's scope in the registry
 *  2. Remove the plugin directory from pluginsDir/<scope>/<pluginId>
 *  3. Remove the entry from installed_plugins.json
 *
 * Idempotent: calling this when the plugin is not installed is a no-op.
 *
 * @param {object} options
 * @param {string} options.pluginId    - Unique plugin identifier
 * @param {string} options.registryDir - Directory containing installed_plugins.json
 * @param {string} options.pluginsDir  - Base directory for installed plugin trees
 */
function uninstallPlugin({ pluginId, registryDir, pluginsDir }) {
  const registry = new PluginRegistry(registryDir);
  const installed = registry.loadInstalled();
  const entry = installed.find(e => e.id === pluginId);

  if (entry) {
    // Remove plugin files
    const destDir = pluginInstallPath(pluginsDir, entry.scope, pluginId);
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
  }

  // Remove registry entry (no-op if not found)
  registry.uninstall(pluginId);
}

/**
 * Check for updates to an installed plugin.
 *
 * Returns the current registry entry for the plugin.  In future versions this
 * will perform a git-pull on the plugin's source repository.
 *
 * @param {object} options
 * @param {string} options.pluginId    - Unique plugin identifier
 * @param {string} options.registryDir - Directory containing installed_plugins.json
 * @returns {{ id: string, version: string, scope: string, installedAt: string }}
 * @throws {Error} If the plugin is not currently installed
 */
function updatePlugin({ pluginId, registryDir }) {
  const registry = new PluginRegistry(registryDir);
  const installed = registry.loadInstalled();
  const entry = installed.find(e => e.id === pluginId);

  if (!entry) {
    throw new Error(`Plugin "${pluginId}" is not installed`);
  }

  // Return current registry info.
  // Future: pull latest version from marketplace git repo here.
  return {
    id: entry.id,
    version: entry.version,
    scope: entry.scope,
    installedAt: entry.installedAt,
  };
}

/**
 * List all installed plugins.
 *
 * @param {string} registryDir - Directory containing installed_plugins.json
 * @returns {Array<{ id: string, version: string, scope: string, installedAt: string }>}
 */
function listPlugins(registryDir) {
  const registry = new PluginRegistry(registryDir);
  return registry.loadInstalled();
}

module.exports = {
  installPlugin,
  uninstallPlugin,
  updatePlugin,
  listPlugins,
};
