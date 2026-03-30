'use strict';

/**
 * Plugin Registry
 *
 * Tracks plugin installations and known marketplaces.
 *
 * Files managed:
 * - installed_plugins.json: array of { id, version, installedAt, scope } entries
 * - known_marketplaces.json: array of { name, url, lastUpdated } entries
 *
 * All writes are atomic (write to .tmp-<random> then rename) via atomicWriteJSONSync,
 * preventing data corruption if the process crashes mid-write.
 */

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');

/** Filename for the installed-plugins registry. */
const INSTALLED_FILE = 'installed_plugins.json';

/** Filename for the known-marketplaces registry. */
const MARKETPLACES_FILE = 'known_marketplaces.json';

/**
 * Plugin Registry for tracking plugin installations and known marketplaces.
 *
 * @example
 * const { PluginRegistry } = require('.claude/lib/plugins/registry.cjs');
 * const registry = new PluginRegistry('/path/to/registry-dir');
 *
 * registry.install('my-plugin', 'user', { version: 'abc123' });
 * console.log(registry.isInstalled('my-plugin')); // true
 */
class PluginRegistry {
  /**
   * @param {string} registryDir - Directory where registry JSON files are stored.
   *   Created automatically on first write if it does not exist.
   */
  constructor(registryDir) {
    this.registryDir = registryDir;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Ensure the registry directory exists (idempotent).
   * @private
   */
  _ensureDir() {
    fs.mkdirSync(this.registryDir, { recursive: true });
  }

  /**
   * Read a JSON array from a registry file.
   * Returns an empty array when the file does not exist or cannot be parsed.
   *
   * @private
   * @param {string} filename - Filename only (not a full path).
   * @returns {Array}
   */
  _readArray(filename) {
    const filePath = path.join(this.registryDir, filename);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (_err) {
      return [];
    }
  }

  /**
   * Write a JSON array to a registry file atomically.
   * Ensures the registry directory exists before writing.
   *
   * @private
   * @param {string} filename - Filename only (not a full path).
   * @param {Array} data - Array data to persist.
   */
  _writeArray(filename, data) {
    this._ensureDir();
    atomicWriteJSONSync(path.join(this.registryDir, filename), data);
  }

  // ---------------------------------------------------------------------------
  // Installed plugins
  // ---------------------------------------------------------------------------

  /**
   * Load installed plugins from installed_plugins.json.
   *
   * @returns {Array<{id: string, version: string, installedAt: string, scope: string}>}
   *   Entries for all currently-installed plugins.
   */
  loadInstalled() {
    return this._readArray(INSTALLED_FILE);
  }

  /**
   * Install (or re-install) a plugin.
   *
   * Adds a new entry to installed_plugins.json if the plugin is not already
   * present, or replaces the existing entry if it is.  The entry always
   * contains at minimum: id, version, installedAt, and scope.
   *
   * @param {string} pluginId - Unique plugin identifier.
   * @param {string} scope    - Installation scope: 'project' | 'user' | 'org'.
   * @param {object} metadata - Additional metadata (e.g. { version: 'abc123' }).
   */
  install(pluginId, scope, metadata) {
    const existing = this._readArray(INSTALLED_FILE);
    const idx = existing.findIndex(e => e.id === pluginId);

    const entry = {
      id: pluginId,
      version: (metadata && metadata.version) || '',
      installedAt: new Date().toISOString(),
      scope,
    };

    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.push(entry);
    }

    this._writeArray(INSTALLED_FILE, existing);
  }

  /**
   * Uninstall a plugin by removing its entry from installed_plugins.json.
   * Does not throw if the plugin is not found.
   *
   * @param {string} pluginId - Unique plugin identifier.
   */
  uninstall(pluginId) {
    const existing = this._readArray(INSTALLED_FILE);
    const updated = existing.filter(e => e.id !== pluginId);
    this._writeArray(INSTALLED_FILE, updated);
  }

  /**
   * Check whether a plugin is currently installed.
   *
   * @param {string} pluginId - Unique plugin identifier.
   * @returns {boolean} `true` if an entry exists for `pluginId`.
   */
  isInstalled(pluginId) {
    return this._readArray(INSTALLED_FILE).some(e => e.id === pluginId);
  }

  // ---------------------------------------------------------------------------
  // Marketplaces
  // ---------------------------------------------------------------------------

  /**
   * Load known marketplaces from known_marketplaces.json.
   *
   * @returns {Array<{name: string, url: string, lastUpdated: string}>}
   *   Entries for all known plugin marketplaces.
   */
  loadMarketplaces() {
    return this._readArray(MARKETPLACES_FILE);
  }

  /**
   * Add (or update) a marketplace entry in known_marketplaces.json.
   *
   * @param {string} name - Marketplace name (acts as unique identifier).
   * @param {string} url  - Git repository URL for the marketplace.
   */
  addMarketplace(name, url) {
    const existing = this._readArray(MARKETPLACES_FILE);
    const idx = existing.findIndex(m => m.name === name);

    const entry = {
      name,
      url,
      lastUpdated: new Date().toISOString(),
    };

    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.push(entry);
    }

    this._writeArray(MARKETPLACES_FILE, existing);
  }

  /**
   * Remove a marketplace entry from known_marketplaces.json.
   * Does not throw if the marketplace name is not found.
   *
   * @param {string} name - Marketplace name.
   */
  removeMarketplace(name) {
    const existing = this._readArray(MARKETPLACES_FILE);
    const updated = existing.filter(m => m.name !== name);
    this._writeArray(MARKETPLACES_FILE, updated);
  }
}

module.exports = {
  PluginRegistry,
};
