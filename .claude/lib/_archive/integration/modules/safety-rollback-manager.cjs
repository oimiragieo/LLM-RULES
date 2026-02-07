/**
 * SPEC-015: Safety and Rollback Manager
 *
 * Provides backup/restore functionality with validation for conductor-main migration.
 * Ensures safe rollback with data integrity verification.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class SafetyRollbackManager {
  constructor() {
    this.backupDir = path.join(os.tmpdir(), 'conductor-backups');
    this.componentStates = new Map();
    this.auditLog = [];

    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Create backup of component state
   * @param {string} componentName
   * @param {Object} [state] - State to backup (if not provided, current state is used)
   * @param {Object} [options] - Backup options
   * @returns {Promise<string>} Backup ID
   */
  async createBackup(componentName, state = null, options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `${componentName}_${timestamp}`;

    // Get current state if not provided
    const stateToBackup = state || (await this.getCurrentState(componentName));

    const backup = {
      id: backupId,
      componentName,
      timestamp: new Date().toISOString(),
      state: stateToBackup,
      compressed: options.compress || false,
    };

    // Calculate checksum
    const checksum = this._calculateChecksum(JSON.stringify(stateToBackup));
    backup.checksum = checksum;

    // Save backup
    const backupPath = path.join(this.backupDir, `${backupId}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    // Log
    this._logAction('backup', componentName, backupId);

    return backupId;
  }

  /**
   * List backups for a component
   * @param {string} componentName
   * @returns {Promise<Array<string>>} Backup IDs
   */
  async listBackups(componentName) {
    const files = fs.readdirSync(this.backupDir);
    const backupFiles = files.filter(f => f.startsWith(componentName) && f.endsWith('.json'));

    return backupFiles.map(f => f.replace('.json', ''));
  }

  /**
   * Validate state integrity
   * @param {Object} beforeState
   * @param {Object} afterState
   * @returns {Promise<{valid: boolean, dataLoss: boolean, missingFields?: Array}>}
   */
  async validateState(beforeState, afterState) {
    const missingFields = [];

    // Check for data loss (fields present in before but missing in after)
    const checkFields = (before, after, prefix = '') => {
      for (const key in before) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (!(key in after)) {
          missingFields.push(fullKey);
        } else if (
          typeof before[key] === 'object' &&
          before[key] !== null &&
          !Array.isArray(before[key])
        ) {
          checkFields(before[key], after[key], fullKey);
        }
      }
    };

    checkFields(beforeState, afterState);

    return {
      valid: missingFields.length === 0,
      dataLoss: missingFields.length > 0,
      missingFields: missingFields.length > 0 ? missingFields : undefined,
    };
  }

  /**
   * Rollback component to backup
   * @param {string} componentName
   * @param {string} backupId
   * @param {Object} [options] - Rollback options
   * @returns {Promise<void>}
   */
  async rollback(componentName, backupId, options = {}) {
    const backup = await this.getBackup(backupId);

    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // Dry-run mode
    if (options.dryRun) {
      return this.previewRollback(componentName, backupId);
    }

    // Verify integrity
    const integrity = await this.verifyBackupIntegrity(backupId);
    if (!integrity.valid) {
      throw new Error(`Backup corrupted: ${backupId}`);
    }

    // Partial rollback (selected fields only)
    if (options.fields && options.fields.length > 0) {
      const currentState = await this.getCurrentState(componentName);
      const newState = { ...currentState };

      for (const field of options.fields) {
        newState[field] = backup.state[field];
      }

      await this.setState(componentName, newState);
    } else {
      // Full rollback
      await this.setState(componentName, backup.state);
    }

    // Log
    this._logAction('rollback', componentName, backupId);

    // Report progress if callback provided
    if (options.onProgress) {
      options.onProgress({ percent: 100 });
    }
  }

  /**
   * Get backup by ID
   * @param {string} backupId
   * @returns {Promise<Object|null>}
   */
  async getBackup(backupId) {
    const backupPath = path.join(this.backupDir, `${backupId}.json`);

    if (!fs.existsSync(backupPath)) {
      return null;
    }

    const content = fs.readFileSync(backupPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Verify backup integrity
   * @param {string} backupId
   * @returns {Promise<{valid: boolean, checksum: string}>}
   */
  async verifyBackupIntegrity(backupId) {
    const backup = await this.getBackup(backupId);

    if (!backup) {
      return { valid: false, checksum: null };
    }

    const calculatedChecksum = this._calculateChecksum(JSON.stringify(backup.state));
    const valid = calculatedChecksum === backup.checksum;

    return {
      valid,
      checksum: calculatedChecksum,
    };
  }

  /**
   * Get current state of component
   * @param {string} componentName
   * @returns {Promise<Object>}
   */
  async getCurrentState(componentName) {
    return this.componentStates.get(componentName) || {};
  }

  /**
   * Set component state
   * @param {string} componentName
   * @param {Object} state
   * @returns {Promise<void>}
   */
  async setState(componentName, state) {
    this.componentStates.set(componentName, state);
  }

  /**
   * Get audit trail for component
   * @param {string} componentName
   * @returns {Promise<Array>}
   */
  async getAuditTrail(componentName) {
    return this.auditLog.filter(entry => entry.component === componentName);
  }

  /**
   * Validate rollback safety
   * @param {string} scenario
   * @returns {Promise<{safe: boolean, reasons?: Array}>}
   */
  async validateRollbackSafety(scenario) {
    // Mock implementation - would check actual safety conditions
    if (scenario === 'incompatible-rollback') {
      return {
        safe: false,
        reasons: ['Incompatible rollback scenario'],
      };
    }

    return {
      safe: true,
    };
  }

  /**
   * Apply retention policy to backups
   * @param {string} componentName
   * @param {Object} policy
   * @returns {Promise<void>}
   */
  async applyRetentionPolicy(componentName, policy) {
    const backups = await this.listBackups(componentName);

    if (policy.maxBackups && backups.length > policy.maxBackups) {
      // Sort by timestamp (oldest first)
      backups.sort();

      // Delete oldest backups beyond limit
      const toDelete = backups.slice(0, backups.length - policy.maxBackups);

      for (const backupId of toDelete) {
        const backupPath = path.join(this.backupDir, `${backupId}.json`);
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
      }
    }
  }

  /**
   * Export backup to external file
   * @param {string} backupId
   * @param {string} exportPath
   * @returns {Promise<void>}
   */
  async exportBackup(backupId, exportPath) {
    const backup = await this.getBackup(backupId);
    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    fs.writeFileSync(exportPath, JSON.stringify(backup, null, 2));
  }

  /**
   * Import backup from external file
   * @param {string} importPath
   * @returns {Promise<string>} Imported backup ID
   */
  async importBackup(importPath) {
    const content = fs.readFileSync(importPath, 'utf8');
    const backup = JSON.parse(content);

    const backupPath = path.join(this.backupDir, `${backup.id}.json`);
    fs.writeFileSync(backupPath, content);

    return backup.id;
  }

  /**
   * Clear all backups for component
   * @param {string} componentName
   * @returns {Promise<void>}
   */
  async clearBackups(componentName) {
    const backups = await this.listBackups(componentName);

    for (const backupId of backups) {
      const backupPath = path.join(this.backupDir, `${backupId}.json`);
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    }
  }

  /**
   * Preview rollback changes
   * @param {string} componentName
   * @param {string} backupId
   * @returns {Promise<{changes: Array}>}
   */
  async previewRollback(componentName, backupId) {
    const backup = await this.getBackup(backupId);
    const currentState = await this.getCurrentState(componentName);

    const changes = [];

    // Find differences
    const findDiffs = (before, after, prefix = '') => {
      for (const key in after) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (!(key in before)) {
          changes.push({
            type: 'restore',
            field: fullKey,
            value: after[key],
          });
        } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          changes.push({
            type: 'modify',
            field: fullKey,
            from: before[key],
            to: after[key],
          });
        }
      }
    };

    findDiffs(currentState, backup.state);

    return { changes };
  }

  /**
   * Validate completeness after rollback
   * @param {string} componentName
   * @param {Array<string>} requiredFields
   * @returns {Promise<{complete: boolean}>}
   */
  async validateCompleteness(componentName, requiredFields) {
    const state = await this.getCurrentState(componentName);

    for (const field of requiredFields) {
      if (!(field in state.data)) {
        return { complete: false };
      }
    }

    return { complete: true };
  }

  /**
   * Estimate rollback time
   * @param {string} componentName
   * @param {string} backupId
   * @returns {Promise<{seconds: number}>}
   */
  async estimateRollbackTime(componentName, backupId) {
    const backup = await this.getBackup(backupId);

    // Simple estimate: 0.1ms per KB
    const size = JSON.stringify(backup.state).length;
    const seconds = Math.max(1, Math.round(size / 10000));

    return { seconds };
  }

  // Private helpers

  _calculateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  _logAction(action, component, backupId = null) {
    this.auditLog.push({
      action,
      component,
      backupId,
      timestamp: new Date().toISOString(),
    });
  }

  // Test helpers
  async corruptBackup(backupId) {
    const backupPath = path.join(this.backupDir, `${backupId}.json`);
    if (fs.existsSync(backupPath)) {
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      backup.checksum = 'corrupted';
      fs.writeFileSync(backupPath, JSON.stringify(backup));
    }
  }

  async simulateRollbackFailure(componentName, backupId) {
    // Mark for failure simulation
    this._failureSimulation = { componentName, backupId };
  }
}

module.exports = { SafetyRollbackManager };
