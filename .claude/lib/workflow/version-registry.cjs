/**
 * Version Registry
 *
 * Manages workflow version metadata, compatibility checking,
 * and upgrade path validation.
 *
 * Features:
 * - Version registration with metadata
 * - Forward/backward compatibility checking
 * - Breaking change detection
 * - Upgrade path validation
 * - API signature comparison
 */

class VersionRegistry {
  constructor() {
    this.registry = new Map(); // workflowId -> Map(version -> metadata)
  }

  /**
   * Register workflow version
   * @param {string} workflowId - Workflow identifier
   * @param {string} version - Version string
   * @param {object} metadata - Version metadata
   */
  async register(workflowId, version, metadata) {
    if (!this.registry.has(workflowId)) {
      this.registry.set(workflowId, new Map());
    }

    const versions = this.registry.get(workflowId);
    versions.set(version, {
      version,
      ...metadata,
    });
  }

  /**
   * Check forward compatibility (old version on new runtime)
   * @param {string} workflowId - Workflow identifier
   * @param {string} oldVersion - Old version
   * @param {string} newRuntime - New runtime version
   * @returns {boolean} True if forward compatible
   */
  isForwardCompatible(workflowId, oldVersion, newRuntime) {
    const oldMeta = this._get(workflowId, oldVersion);
    const newMeta = this._get(workflowId, newRuntime);

    if (!oldMeta) return false;

    // Check maxCompatibleVersion if set
    if (oldMeta.maxCompatibleVersion) {
      if (this._compareVersions(newRuntime, oldMeta.maxCompatibleVersion) > 0) {
        return false;
      }
    }

    // Check API signatures (additive changes are compatible, removals are not)
    if (newMeta && oldMeta.apiSignature && newMeta.apiSignature) {
      return this._isApiAdditive(oldMeta.apiSignature, newMeta.apiSignature);
    }

    // Default: forward compatible within same major version
    return true;
  }

  /**
   * Check if API changes are additive (no removals)
   * @param {object} oldApi - Old API signature
   * @param {object} newApi - New API signature
   * @returns {boolean} True if only additions
   */
  _isApiAdditive(oldApi, newApi) {
    for (const [phase, tasks] of Object.entries(oldApi)) {
      if (!newApi[phase]) {
        return false; // Phase removed
      }

      for (const task of tasks) {
        if (!newApi[phase].includes(task)) {
          return false; // Task removed
        }
      }
    }

    return true; // Only additions
  }

  /**
   * Check backward compatibility (new version with old state)
   * @param {string} workflowId - Workflow identifier
   * @param {string} oldVersion - Old state version
   * @param {string} newVersion - New workflow version
   * @returns {boolean} True if backward compatible
   */
  isBackwardCompatible(workflowId, oldVersion, newVersion) {
    const newMeta = this._get(workflowId, newVersion);
    if (!newMeta) return false;

    if (!newMeta.minCompatibleVersion) {
      return false; // No constraint means no guarantee
    }

    return this._compareVersions(oldVersion, newMeta.minCompatibleVersion) >= 0;
  }

  /**
   * Check if migration path exists
   * @param {string} workflowId - Workflow identifier
   * @param {object} state - State object
   * @param {string} toVersion - Target version
   * @returns {boolean} True if migration possible
   */
  canMigrate(workflowId, state, toVersion) {
    return this.isBackwardCompatible(workflowId, state.workflowVersion, toVersion);
  }

  /**
   * Detect breaking changes between versions
   * @param {string} workflowId - Workflow identifier
   * @param {string} fromVersion - Old version
   * @param {string} toVersion - New version
   * @returns {string[]} Breaking changes
   */
  detectBreakingChanges(workflowId, fromVersion, toVersion) {
    const fromMeta = this._get(workflowId, fromVersion);
    const toMeta = this._get(workflowId, toVersion);

    if (!fromMeta || !toMeta) return [];

    const breaking = [];

    // Check removed phases
    if (fromMeta.phases && toMeta.phases) {
      for (const phase of fromMeta.phases) {
        if (!toMeta.phases.includes(phase)) {
          breaking.push(`Removed phase: ${phase}`);
        }
      }
    }

    // Check removed tasks
    if (fromMeta.tasks && toMeta.tasks) {
      for (const [phase, tasks] of Object.entries(fromMeta.tasks)) {
        if (toMeta.tasks[phase]) {
          for (const task of tasks) {
            if (!toMeta.tasks[phase].includes(task)) {
              breaking.push(`Removed task: ${task}`);
            }
          }
        }
      }
    }

    // Check explicit breaking changes
    if (toMeta.breakingChanges) {
      breaking.push(...toMeta.breakingChanges);
    }

    return breaking;
  }

  /**
   * Check if upgrade path exists
   * @param {string} workflowId - Workflow identifier
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {boolean} True if path exists
   */
  hasUpgradePath(workflowId, fromVersion, toVersion) {
    // Check if backward compatible (simplest path)
    if (this.isBackwardCompatible(workflowId, fromVersion, toVersion)) {
      return true;
    }

    // Check if migrations exist
    const toMeta = this._get(workflowId, toVersion);
    if (toMeta && toMeta.migrations && toMeta.migrations.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Get upgrade path (list of migrations)
   * @param {string} workflowId - Workflow identifier
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {object[]} Migration steps
   */
  getUpgradePath(workflowId, fromVersion, toVersion) {
    const versions = this.registry.get(workflowId);
    if (!versions) return [];

    const path = [];
    let currentVersion = fromVersion;

    // Build chain of migrations
    while (this._compareVersions(currentVersion, toVersion) < 0) {
      let nextMigration = null;

      // Find next migration in chain
      for (const [version, meta] of versions.entries()) {
        if (
          this._compareVersions(version, currentVersion) > 0 &&
          this._compareVersions(version, toVersion) <= 0 &&
          meta.migrations
        ) {
          // Check if any migration applies to current version
          for (const migration of meta.migrations) {
            if (this._matchesPattern(currentVersion, migration.from)) {
              nextMigration = migration;
              currentVersion = version;
              break;
            }
          }
          if (nextMigration) break;
        }
      }

      if (!nextMigration) {
        break; // No more migrations found
      }

      path.push(nextMigration);
    }

    return path;
  }

  /**
   * Match version against pattern (e.g., "1.x.x")
   * @param {string} version - Version to check
   * @param {string} pattern - Pattern
   * @returns {boolean} True if matches
   */
  _matchesPattern(version, pattern) {
    const versionParts = version.split('.');
    const patternParts = pattern.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === 'x') {
        continue;
      }
      if (versionParts[i] !== patternParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Estimate upgrade duration
   * @param {string} workflowId - Workflow identifier
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {number} Estimated duration (ms)
   */
  estimateUpgradeDuration(workflowId, fromVersion, toVersion) {
    const path = this.getUpgradePath(workflowId, fromVersion, toVersion);

    let total = 0;
    for (const migration of path) {
      total += migration.estimatedDuration || 0;
    }

    return total;
  }

  /**
   * Get version metadata
   * @param {string} workflowId - Workflow identifier
   * @param {string} version - Version string
   * @returns {object} Version metadata
   */
  _get(workflowId, version) {
    const versions = this.registry.get(workflowId);
    return versions ? versions.get(version) : null;
  }

  /**
   * Compare versions (simple implementation)
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  _compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (parts1[i] < parts2[i]) return -1;
      if (parts1[i] > parts2[i]) return 1;
    }

    return 0;
  }
}

module.exports = VersionRegistry;
