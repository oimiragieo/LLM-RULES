/**
 * SPEC-021: Adapter Registry
 *
 * Manages adapter instances and lifecycle
 * Supports versioned adapter lookup with fallback to compatible versions
 */

class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this.factories = new Map();
  }

  /**
   * Register an adapter instance
   * @param {string} system - System name
   * @param {string} version - System version
   * @param {Object} adapter - Adapter instance
   */
  register(system, version, adapter) {
    const key = this._makeKey(system, version);
    this.adapters.set(key, adapter);
  }

  /**
   * Register a factory function for lazy loading
   * @param {string} system - System name
   * @param {string} version - System version
   * @param {Function} factory - Factory function
   */
  registerFactory(system, version, factory) {
    const key = this._makeKey(system, version);
    this.factories.set(key, factory);
  }

  /**
   * Get adapter by system and version
   * @param {string} system - System name
   * @param {string} version - System version
   * @param {Object} options - Options
   * @param {boolean} options.fallbackToCompatible - Fallback to compatible version
   * @returns {Object|null} Adapter instance or null
   */
  get(system, version, options = {}) {
    const key = this._makeKey(system, version);

    // Try exact match
    if (this.adapters.has(key)) {
      return this.adapters.get(key);
    }

    // Try fallback to compatible version
    if (options.fallbackToCompatible) {
      const compatible = this._findCompatibleAdapter(system, version);
      if (compatible) {
        return compatible;
      }
    }

    return null;
  }

  /**
   * Load adapter (from factory if needed)
   * @param {string} system - System name
   * @param {string} version - System version
   * @returns {Promise<Object>} Adapter instance
   */
  async load(system, version) {
    const key = this._makeKey(system, version);

    // Check if already loaded
    if (this.adapters.has(key)) {
      return this.adapters.get(key);
    }

    // Load from factory
    if (this.factories.has(key)) {
      const factory = this.factories.get(key);
      const adapter = factory();
      this.adapters.set(key, adapter);
      return adapter;
    }

    throw new Error(`Adapter not found: ${system}@${version}`);
  }

  /**
   * Deregister an adapter
   * @param {string} system - System name
   * @param {string} version - System version
   */
  deregister(system, version) {
    const key = this._makeKey(system, version);
    this.adapters.delete(key);
    this.factories.delete(key);
  }

  /**
   * Find compatible adapter (same major version)
   * @private
   */
  _findCompatibleAdapter(system, version) {
    const requestedMajor = this._parseMajor(version);

    for (const [key, adapter] of this.adapters.entries()) {
      const [sys, ver] = key.split('@');
      if (sys === system) {
        const major = this._parseMajor(ver);
        if (major === requestedMajor) {
          return adapter;
        }
      }
    }

    return null;
  }

  /**
   * Parse major version from semver
   * @private
   */
  _parseMajor(version) {
    const match = version.match(/^(\d+)\./);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Make registry key
   * @private
   */
  _makeKey(system, version) {
    return `${system}@${version}`;
  }
}

module.exports = AdapterRegistry;
