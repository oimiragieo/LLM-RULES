#!/usr/bin/env node
/**
 * Saga Coordinator
 * ================
 *
 * Implements the Saga Pattern for distributed transaction management
 * with compensating actions, backup management, and transaction logging.
 *
 * Based on research patterns from:
 * - executable-workflow-patterns.md (Saga Pattern section)
 * - workflow-engine.cjs (rollback interface)
 *
 * Features:
 * - Transaction management (begin, record, commit, rollback)
 * - Compensating actions executed in REVERSE order on rollback
 * - File backup management for safe modifications
 * - Transaction logging for audit trail
 *
 * Usage:
 *   const { SagaCoordinator, BackupManager } = require('./saga-coordinator.cjs');
 *
 *   const saga = new SagaCoordinator({ backupDir: '/path/to/backups' });
 *   await saga.begin('workflow-123');
 *
 *   const backupId = await saga.backup('/path/to/file.txt');
 *   saga.record({
 *     stepId: 'modify_file',
 *     type: 'file:modify',
 *     backupId,
 *     compensate: async (ctx) => saga.restore(ctx.backupId)
 *   });
 *
 *   // On error: await saga.rollback();
 *   // On success: await saga.commit();
 */

'use strict';

const fs = require('fs');
const path = require('path');

// =============================================================================
// Compensating Actions Registry
// =============================================================================

/**
 * Default compensating actions for common operations
 */
const COMPENSATING_ACTIONS = {
  /**
   * Compensate file creation by deleting the file
   * @param {Object} ctx - Context with filePath
   */
  'file:create': async ctx => {
    if (fs.existsSync(ctx.filePath)) {
      fs.unlinkSync(ctx.filePath);
    }
  },

  /**
   * Compensate file modification by restoring from backup
   * @param {Object} ctx - Context with filePath, backupId, backupManager
   */
  'file:modify': async ctx => {
    if (ctx.backupManager && ctx.backupId) {
      await ctx.backupManager.restoreBackup(ctx.backupId);
    }
  },

  /**
   * Compensate directory creation by removing the directory
   * @param {Object} ctx - Context with dirPath
   */
  'directory:create': async ctx => {
    if (fs.existsSync(ctx.dirPath)) {
      fs.rmSync(ctx.dirPath, { recursive: true, force: true });
    }
  },

  /**
   * Compensate registration by removing it
   * Placeholder - implementation depends on registration system
   * @param {Object} ctx - Context with registration details
   */
  'registration:add': async ctx => {
    // Implementation depends on the specific registration system
    // This is a placeholder for custom implementation
    if (ctx.removeRegistration && typeof ctx.removeRegistration === 'function') {
      await ctx.removeRegistration(ctx);
    }
  },
};

/**
 * Register a new compensating action
 *
 * @param {string} type - Action type (e.g., 'custom:cleanup')
 * @param {Function} action - Async function that performs compensation
 */
function registerCompensatingAction(type, action) {
  if (typeof action !== 'function') {
    throw new Error('Compensating action must be a function');
  }
  COMPENSATING_ACTIONS[type] = action;
}

// =============================================================================
// BackupManager Class
// =============================================================================

/**
 * Manages file backups for safe rollback operations
 */
class BackupManager {
  /**
   * Create a new BackupManager
   *
   * @param {Object} options
   * @param {string} options.backupDir - Directory to store backups
   */
  constructor(options = {}) {
    this.backupDir = options.backupDir || path.join(process.cwd(), '.claude/context/backups');
    this.backups = new Map(); // backupId -> backup metadata
    this.indexFile = path.join(this.backupDir, 'backup-index.json');

    // Ensure backup directory exists
    this._ensureBackupDir();

    // Load existing backups index
    this._loadIndex();
  }

  /**
   * Ensure backup directory exists
   * @private
   */
  _ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Load backup index from disk
   * @private
   */
  _loadIndex() {
    if (fs.existsSync(this.indexFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
        this.backups = new Map(Object.entries(data));
      } catch (_e) {
        // Index corrupted, start fresh
        this.backups = new Map();
      }
    }
  }

  /**
   * Save backup index to disk
   * @private
   */
  _saveIndex() {
    const data = Object.fromEntries(this.backups);
    fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2));
  }

  /**
   * Generate a unique backup ID
   * @private
   */
  _generateId() {
    return `backup-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create a backup of an existing file
   *
   * @param {string} filePath - Path to file to backup
   * @param {string} [workflowId] - Optional workflow ID for filtering
   * @returns {Promise<string>} Backup ID
   */
  async createBackup(filePath, workflowId = null) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const backupId = this._generateId();
    const backupFileName = `${backupId}${path.extname(filePath)}`;
    const backupPath = path.join(this.backupDir, backupFileName);

    // Copy file to backup location
    await fs.promises.copyFile(filePath, backupPath);

    // Store metadata
    const metadata = {
      id: backupId,
      originalPath: filePath,
      backupPath,
      workflowId,
      createdAt: new Date().toISOString(),
    };

    this.backups.set(backupId, metadata);
    this._saveIndex();

    return backupId;
  }

  /**
   * Restore a file from backup
   *
   * @param {string} backupId - Backup ID to restore
   */
  async restoreBackup(backupId) {
    const metadata = this.backups.get(backupId);
    if (!metadata) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    if (!fs.existsSync(metadata.backupPath)) {
      throw new Error(`Backup file not found: ${metadata.backupPath}`);
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(metadata.originalPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Restore file
    await fs.promises.copyFile(metadata.backupPath, metadata.originalPath);
  }

  /**
   * Delete a backup
   *
   * @param {string} backupId - Backup ID to delete
   */
  async deleteBackup(backupId) {
    const metadata = this.backups.get(backupId);
    if (!metadata) {
      return; // Already deleted or doesn't exist
    }

    // Remove backup file
    if (fs.existsSync(metadata.backupPath)) {
      await fs.promises.unlink(metadata.backupPath);
    }

    // Remove from index
    this.backups.delete(backupId);
    this._saveIndex();
  }

  /**
   * List all backups, optionally filtered by workflow ID
   *
   * @param {string} [workflowId] - Optional workflow ID filter
   * @returns {Promise<Array>} List of backup metadata
   */
  async listBackups(workflowId = null) {
    const backups = Array.from(this.backups.values());

    if (workflowId !== null) {
      return backups.filter(b => b.workflowId === workflowId);
    }

    return backups;
  }
}

// =============================================================================
// SagaCoordinator Class
// =============================================================================

/**
 * Orchestrates saga transactions with compensating actions
 */
class SagaCoordinator {
  /**
   * Create a new SagaCoordinator
   *
   * @param {Object} options
   * @param {string} options.backupDir - Directory for file backups
   * @param {boolean} options.persistLog - Whether to persist transaction log
   */
  constructor(options = {}) {
    this.backupDir = options.backupDir || path.join(process.cwd(), '.claude/context/backups');
    this.persistLog = options.persistLog !== false;
    this.logFile = path.join(this.backupDir, 'transaction-log.json');

    // Current transaction
    this.currentTransaction = null;

    // Transaction log (history)
    this.transactionLog = [];

    // Backup manager
    this.backupManager = new BackupManager({ backupDir: this.backupDir });

    // Load existing log
    this._loadLog();
  }

  /**
   * Load transaction log from disk
   * @private
   */
  _loadLog() {
    if (this.persistLog && fs.existsSync(this.logFile)) {
      try {
        this.transactionLog = JSON.parse(fs.readFileSync(this.logFile, 'utf-8'));
      } catch (_e) {
        this.transactionLog = [];
      }
    }
  }

  /**
   * Save transaction log to disk
   * @private
   */
  _saveLog() {
    if (this.persistLog) {
      // Ensure directory exists
      const dir = path.dirname(this.logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.logFile, JSON.stringify(this.transactionLog, null, 2));
    }
  }

  /**
   * Generate a unique transaction ID
   * @private
   */
  _generateTxnId() {
    return `txn-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Begin a new transaction
   *
   * @param {string} workflowId - Workflow ID this transaction belongs to
   * @returns {Promise<Object>} Transaction object
   */
  async begin(workflowId) {
    if (this.currentTransaction && this.currentTransaction.status === 'pending') {
      throw new Error('A transaction is already in progress');
    }

    this.currentTransaction = {
      id: this._generateTxnId(),
      workflowId,
      actions: [],
      status: 'pending',
      startedAt: new Date().toISOString(),
      endedAt: null,
    };

    return { ...this.currentTransaction };
  }

  /**
   * Record an action in the current transaction
   *
   * @param {Object} action - Action to record
   * @param {string} action.stepId - Step ID
   * @param {string} action.type - Action type (e.g., 'file:create')
   * @param {Function} action.compensate - Async function to compensate this action
   */
  record(action) {
    if (!this.currentTransaction) {
      throw new Error('No active transaction. Call begin() first.');
    }

    if (typeof action.compensate !== 'function') {
      throw new Error('Action must have a compensate function');
    }

    // Store the action with all its context
    this.currentTransaction.actions.push({
      stepId: action.stepId,
      type: action.type,
      context: { ...action }, // Store full action as context for compensation
      recordedAt: new Date().toISOString(),
    });
  }

  /**
   * Commit the current transaction
   * Marks transaction as successful, no compensations needed
   */
  async commit() {
    if (!this.currentTransaction) {
      throw new Error('No active transaction. Call begin() first.');
    }

    this.currentTransaction.status = 'committed';
    this.currentTransaction.endedAt = new Date().toISOString();

    // Add to log
    this.transactionLog.push({ ...this.currentTransaction });
    this._saveLog();
  }

  /**
   * Rollback the current transaction
   * Executes compensating actions in REVERSE order
   */
  async rollback() {
    if (!this.currentTransaction) {
      throw new Error('No active transaction. Call begin() first.');
    }

    const errors = [];

    // Execute compensations in reverse order
    const actionsToCompensate = [...this.currentTransaction.actions].reverse();

    for (const action of actionsToCompensate) {
      try {
        // Get the original action's compensate function from context
        if (action.context && typeof action.context.compensate === 'function') {
          await action.context.compensate(action.context);
        } else if (COMPENSATING_ACTIONS[action.type]) {
          // Fallback to registered compensating action
          await COMPENSATING_ACTIONS[action.type](action.context);
        }
      } catch (e) {
        // Log error but continue with other compensations
        errors.push({
          stepId: action.stepId,
          error: e.message,
        });
        console.error(`[saga-coordinator] Compensation failed for ${action.stepId}: ${e.message}`);
      }
    }

    this.currentTransaction.status = 'rolled_back';
    this.currentTransaction.endedAt = new Date().toISOString();
    this.currentTransaction.compensationErrors = errors;

    // Add to log
    this.transactionLog.push({ ...this.currentTransaction });
    this._saveLog();
  }

  /**
   * Create a backup of a file (convenience method)
   *
   * @param {string} filePath - Path to file to backup
   * @returns {Promise<string>} Backup ID
   */
  async backup(filePath) {
    const workflowId = this.currentTransaction ? this.currentTransaction.workflowId : null;
    return this.backupManager.createBackup(filePath, workflowId);
  }

  /**
   * Restore a file from backup (convenience method)
   *
   * @param {string} backupId - Backup ID to restore
   */
  async restore(backupId) {
    return this.backupManager.restoreBackup(backupId);
  }

  /**
   * Get the current transaction
   *
   * @returns {Object|null} Current transaction or null
   */
  getTransaction() {
    return this.currentTransaction ? { ...this.currentTransaction } : null;
  }

  /**
   * Get the full transaction log
   *
   * @returns {Array} Transaction log
   */
  getLog() {
    return [...this.transactionLog];
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  SagaCoordinator,
  BackupManager,
  COMPENSATING_ACTIONS,
  registerCompensatingAction,
};
