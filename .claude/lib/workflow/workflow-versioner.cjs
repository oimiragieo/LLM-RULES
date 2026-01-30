/**
 * Workflow Versioner
 *
 * Semantic versioning management for workflows with
 * version parsing, comparison, constraints, and compatibility checking.
 *
 * Features:
 * - Semantic version parsing (major.minor.patch)
 * - Version comparison and ordering
 * - Constraint validation (semver ranges)
 * - Breaking change detection
 * - Version registry with metadata
 * - Backward/forward compatibility checking
 * - Upgrade path calculation
 */

class WorkflowVersioner {
  constructor() {
    this.registry = new Map(); // workflowId -> Map(version -> metadata)
    this.activeVersions = new Map(); // workflowId -> activeVersion
  }

  /**
   * Parse semantic version string to components
   * @param {string} versionString - Version string (e.g., "2.1.3")
   * @returns {object} Parsed version { major, minor, patch, string }
   */
  parseVersion(versionString) {
    const parts = versionString.split('.');
    return {
      major: parseInt(parts[0], 10),
      minor: parseInt(parts[1], 10),
      patch: parseInt(parts[2], 10),
      string: versionString,
    };
  }

  /**
   * Compare two versions
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(v1, v2) {
    const parsed1 = this.parseVersion(v1);
    const parsed2 = this.parseVersion(v2);

    if (parsed1.major !== parsed2.major) {
      return parsed1.major < parsed2.major ? -1 : 1;
    }
    if (parsed1.minor !== parsed2.minor) {
      return parsed1.minor < parsed2.minor ? -1 : 1;
    }
    if (parsed1.patch !== parsed2.patch) {
      return parsed1.patch < parsed2.patch ? -1 : 1;
    }
    return 0;
  }

  /**
   * Check if version satisfies constraint (semver range)
   * @param {string} version - Version to check
   * @param {string} constraint - Constraint (e.g., ">=2.0.0", "^2.0.0")
   * @returns {boolean} True if satisfies
   */
  satisfies(version, constraint) {
    const parsed = this.parseVersion(version);

    // Handle >= constraint
    if (constraint.startsWith('>=')) {
      const minVersion = constraint.substring(2);
      return this.compareVersions(version, minVersion) >= 0;
    }

    // Handle ^ constraint (caret: compatible with same major version)
    if (constraint.startsWith('^')) {
      const baseVersion = constraint.substring(1);
      const baseParsed = this.parseVersion(baseVersion);

      // Same major version
      if (parsed.major !== baseParsed.major) {
        return false;
      }

      // Greater or equal minor/patch
      return this.compareVersions(version, baseVersion) >= 0;
    }

    // Exact match
    return version === constraint;
  }

  /**
   * Detect if upgrade is a breaking change (major version increment)
   * @param {string} fromVersion - Old version
   * @param {string} toVersion - New version
   * @returns {boolean} True if breaking change
   */
  isBreakingChange(fromVersion, toVersion) {
    const from = this.parseVersion(fromVersion);
    const to = this.parseVersion(toVersion);

    return to.major > from.major;
  }

  /**
   * Register workflow version with metadata
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
   * Get version metadata
   * @param {string} workflowId - Workflow identifier
   * @param {string} version - Version string
   * @returns {object} Version metadata
   */
  get(workflowId, version) {
    const versions = this.registry.get(workflowId);
    return versions ? versions.get(version) : null;
  }

  /**
   * List all versions for workflow (sorted)
   * @param {string} workflowId - Workflow identifier
   * @returns {string[]} Sorted version strings
   */
  listVersions(workflowId) {
    const versions = this.registry.get(workflowId);
    if (!versions) return [];

    return Array.from(versions.keys()).sort((a, b) => this.compareVersions(a, b));
  }

  /**
   * Get latest version for workflow
   * @param {string} workflowId - Workflow identifier
   * @returns {object} Latest version metadata
   */
  getLatest(workflowId) {
    const versions = this.listVersions(workflowId);
    if (versions.length === 0) return null;

    const latestVersion = versions[versions.length - 1];
    return this.get(workflowId, latestVersion);
  }

  /**
   * Set active version (for blue-green deployment)
   * @param {string} workflowId - Workflow identifier
   * @param {string} version - Version to set as active
   */
  async setActive(workflowId, version) {
    this.activeVersions.set(workflowId, version);
  }

  /**
   * Get active version (defaults to latest)
   * @param {string} workflowId - Workflow identifier
   * @returns {object} Active version metadata
   */
  getActive(workflowId) {
    const activeVersion = this.activeVersions.get(workflowId);
    if (activeVersion) {
      return this.get(workflowId, activeVersion);
    }

    // Default to latest
    return this.getLatest(workflowId);
  }

  /**
   * Check backward compatibility
   * @param {string} workflowId - Workflow identifier
   * @param {string} oldVersion - Old version
   * @param {string} newVersion - New version
   * @returns {boolean} True if backward compatible
   */
  isBackwardCompatible(workflowId, oldVersion, newVersion) {
    const newMeta = this.get(workflowId, newVersion);
    if (!newMeta || !newMeta.minCompatibleVersion) {
      // No constraint means no compatibility guarantee
      return false;
    }

    return this.compareVersions(oldVersion, newMeta.minCompatibleVersion) >= 0;
  }

  /**
   * Check if state can be migrated from old version
   * @param {object} state - Workflow state
   * @param {string} toVersion - Target version
   * @returns {boolean} True if migration possible
   */
  canMigrate(state, toVersion) {
    // Extract workflow ID from state or use default
    const workflowId = state.workflowId || 'feature-dev'; // TODO: Better extraction

    return this.isBackwardCompatible(workflowId, state.workflowVersion, toVersion);
  }

  /**
   * Calculate upgrade path (list of required migrations)
   * @param {string} workflowId - Workflow identifier
   * @param {string} fromVersion - Starting version
   * @param {string} toVersion - Target version
   * @returns {object[]} Migration steps
   */
  getUpgradePath(workflowId, fromVersion, toVersion) {
    // Check if downgrade
    if (this.compareVersions(fromVersion, toVersion) > 0) {
      throw new Error('Downgrade not supported without rollback migration');
    }

    const path = [];
    const versions = this.listVersions(workflowId);

    // Find versions between from and to
    for (const version of versions) {
      if (
        this.compareVersions(version, fromVersion) > 0 &&
        this.compareVersions(version, toVersion) <= 0
      ) {
        const meta = this.get(workflowId, version);
        if (meta.migrations) {
          path.push(...meta.migrations);
        }
      }
    }

    return path;
  }
}

module.exports = WorkflowVersioner;
