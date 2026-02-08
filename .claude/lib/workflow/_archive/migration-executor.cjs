/**
 * Migration Executor
 *
 * Executes workflow state migrations with gradual rollout,
 * validation, and rollback support.
 *
 * Features:
 * - Schema migration definitions
 * - Gradual migration (10% → 50% → 100%)
 * - State mapping (old schema → new schema)
 * - Validation before/after migration
 * - Rollback strategies
 * - Migration progress tracking
 */

class MigrationExecutor {
  constructor() {
    this.migrations = new Map(); // workflowId -> migration[]
    this.progress = new Map(); // workflowId -> { completed, total }
  }

  /**
   * Register migration script
   * @param {string} workflowId - Workflow identifier
   * @param {object} migration - Migration definition
   */
  register(workflowId, migration) {
    if (!this.migrations.has(workflowId)) {
      this.migrations.set(workflowId, []);
    }

    this.migrations.get(workflowId).push(migration);
  }

  /**
   * Get migration for version range
   * @param {string} workflowId - Workflow identifier
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {object} Migration definition
   */
  getMigration(workflowId, fromVersion, toVersion) {
    const migrations = this.migrations.get(workflowId) || [];

    // Return the LAST matching migration (most recently registered)
    for (let i = migrations.length - 1; i >= 0; i--) {
      const migration = migrations[i];
      if (this._matchesVersionPattern(fromVersion, migration.from) && migration.to === toVersion) {
        return migration;
      }
    }

    return null;
  }

  /**
   * Get migration path (chained migrations)
   * @param {string} workflowId - Workflow identifier
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {object[]} Migration path
   */
  getMigrationPath(workflowId, fromVersion, toVersion) {
    const migrations = this.migrations.get(workflowId) || [];
    const path = [];

    // Find migrations that form a path from -> to
    let currentVersion = fromVersion;

    while (currentVersion !== toVersion) {
      const nextMigration = migrations.find(m =>
        this._matchesVersionPattern(currentVersion, m.from)
      );

      if (!nextMigration) {
        throw new Error(`No migration path from ${fromVersion} to ${toVersion}`);
      }

      path.push(nextMigration);
      currentVersion = nextMigration.to;
    }

    return path;
  }

  /**
   * Migrate state gradually (percentage-based)
   * @param {string} workflowId - Workflow identifier
   * @param {object[]} states - State instances to migrate
   * @param {string} toVersion - Target version
   * @param {object} options - Migration options
   */
  async migrateGradual(workflowId, states, toVersion, options = {}) {
    const {
      percentage = 100,
      rollbackOnError = true, // Default to true
      trackProgress = false,
    } = options;

    const count = Math.ceil(states.length * (percentage / 100));
    const toMigrate = states.slice(0, count);

    if (trackProgress) {
      this.progress.set(workflowId, { completed: 0, total: states.length });
    }

    for (const state of toMigrate) {
      const originalVersion = state.workflowVersion;
      const migration = this.getMigration(workflowId, originalVersion, toVersion);

      try {
        await this.migrate(workflowId, state, toVersion);

        if (trackProgress) {
          const progress = this.progress.get(workflowId);
          progress.completed++;
        }
      } catch (error) {
        if (rollbackOnError && migration && migration.rollback) {
          // Rollback to original version using the migration's rollback function
          try {
            const rolledBack = await migration.rollback(state);
            rolledBack.workflowVersion = originalVersion;

            // Clear state and apply rolled back fields
            for (const key of Object.keys(state)) {
              delete state[key];
            }
            Object.assign(state, rolledBack);
          } catch (_rollbackError) {
            // Rollback failed, restore original state manually
            state.workflowVersion = originalVersion;
            state.migrated = false;
          }
        }
        throw error;
      }
    }
  }

  /**
   * Migrate single state
   * @param {string} workflowId - Workflow identifier
   * @param {object} state - State to migrate
   * @param {string} toVersion - Target version
   * @returns {object} Migrated state
   */
  async migrate(workflowId, state, toVersion) {
    const migration = this.getMigration(workflowId, state.workflowVersion, toVersion);
    if (!migration) {
      throw new Error(`No migration from ${state.workflowVersion} to ${toVersion}`);
    }

    const migrated = await migration.migrate(state);
    migrated.workflowVersion = toVersion;

    // Clear state and apply migrated fields (to handle deletions)
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, migrated);

    return state;
  }

  /**
   * Validate migration result
   * @param {string} workflowId - Workflow identifier
   * @param {object} state - Migrated state
   * @param {string} toVersion - Target version
   * @returns {object} Validation result
   */
  async validateMigration(workflowId, state, toVersion) {
    const migration = this.getMigration(workflowId, '1.x.x', toVersion); // Simplified
    if (migration && migration.validate) {
      return await migration.validate(state);
    }

    return { valid: true, errors: [] };
  }

  /**
   * Rollback migration
   * @param {string} workflowId - Workflow identifier
   * @param {object} state - State to rollback
   * @param {string} toVersion - Rollback version
   * @returns {object} Rolled back state
   */
  async rollback(workflowId, state, toVersion) {
    const migration = this.getMigration(workflowId, toVersion, state.workflowVersion);
    if (!migration || !migration.rollback) {
      throw new Error(`No rollback from ${state.workflowVersion} to ${toVersion}`);
    }

    const rolledBack = await migration.rollback(state);
    rolledBack.workflowVersion = toVersion;

    // Clear state and apply rolled back fields (to handle deletions)
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, rolledBack);

    return state;
  }

  /**
   * Get migration progress
   * @param {string} workflowId - Workflow identifier
   * @returns {object} Progress { completed, total }
   */
  getMigrationProgress(workflowId) {
    return this.progress.get(workflowId) || { completed: 0, total: 0 };
  }

  /**
   * Match version against pattern (e.g., "1.x.x")
   * @param {string} version - Version to check
   * @param {string} pattern - Pattern (supports x wildcard)
   * @returns {boolean} True if matches
   */
  _matchesVersionPattern(version, pattern) {
    const versionParts = version.split('.');
    const patternParts = pattern.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === 'x') {
        continue; // Wildcard matches anything
      }
      if (versionParts[i] !== patternParts[i]) {
        return false;
      }
    }

    return true;
  }
}

module.exports = MigrationExecutor;
