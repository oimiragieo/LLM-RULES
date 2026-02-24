#!/usr/bin/env node
/**
 * Rollback Manager
 * ================
 *
 * Manages named checkpoints for file rollback operations.
 * Part of the self-healing system for the EVOLVE workflow engine.
 *
 * Features:
 * - Named checkpoints with file backups
 * - Full rollback to checkpoint state
 * - Selective rollback of specific files
 * - SHA-256 hash verification
 * - Audit trail logging (JSONL format)
 * - Age-based checkpoint pruning
 *
 * Checkpoint Storage Structure:
 *   checkpoints/
 *   |-- cp-2024-01-25T10-00-00-abc123/
 *       |-- manifest.json
 *       |-- files/
 *           |-- path-to-file-1.backup
 *           |-- path-to-file-2.backup
 *
 * Usage:
 *   const { RollbackManager, createCheckpointId } = require('./rollback-manager.cjs');
 *
 *   const manager = new RollbackManager({
 *     checkpointDir: '.claude/context/self-healing/checkpoints',
 *     logFile: '.claude/context/self-healing/rollback-log.jsonl'
 *   });
 *
 *   // Create checkpoint before risky operation
 *   const cpId = await manager.createCheckpoint('before-evolution', [file1, file2]);
 *
 *   // Rollback if something goes wrong
 *   await manager.rollback(cpId);
 *
 *   // Or selective rollback
 *   await manager.selectiveRollback(cpId, [file1]);
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validatePath } = require('./validator.cjs');

// =============================================================================
// Constants
// =============================================================================

/**
 * Default checkpoint directory (relative to project root)
 */
const DEFAULT_CHECKPOINT_DIR = '.claude/context/self-healing/checkpoints';

/**
 * Default log file location
 */
const DEFAULT_LOG_FILE = '.claude/context/self-healing/rollback-log.jsonl';

/**
 * Default max age for checkpoints (7 days in milliseconds)
 */
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique checkpoint ID
 *
 * Format: cp-{timestamp}-{random}
 *
 * @returns {string} Unique checkpoint ID
 */
function createCheckpointId() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const random = Math.random().toString(36).substring(2, 8);
  return `cp-${timestamp}-${random}`;
}

/**
 * Calculate SHA-256 hash of file content
 *
 * @param {string} content - File content to hash
 * @returns {string} Hash string with 'sha256:' prefix
 */
function calculateHash(content) {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Sanitize a file path for use as a backup filename
 * Replaces path separators and special characters with underscores
 *
 * @param {string} filePath - Original file path
 * @returns {string} Sanitized filename
 */
function sanitizePathForBackup(filePath) {
  // Normalize and get relative-ish name
  const normalized = path.normalize(filePath);
  // Replace all path separators and colons with underscores
  return normalized.replace(/[\\/:/]/g, '_').replace(/^_+/, '');
}

// =============================================================================
// SEC-006: Path Validation Functions
// =============================================================================

/**
 * Validate that a path is within the project root (SEC-006 fix)
 *
 * Prevents path traversal attacks by ensuring the resolved path
 * stays within the project root directory.
 *
 * @param {string} filePath - Path to validate
 * @param {string} projectRoot - Project root directory
 * @returns {string} Resolved path if valid
 * @throws {Error} If path traversal is detected
 */
function validatePathWithinRoot(filePath, projectRoot) {
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(projectRoot);

  // Check if path is within root (or IS the root)
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    throw new Error(`SEC-006: Path traversal blocked: ${filePath}`);
  }
  return resolvedPath;
}

/**
 * Validate checkpoint ID format (SEC-006 fix)
 *
 * Checkpoint IDs should only contain alphanumeric characters and hyphens.
 * This prevents path injection through checkpoint IDs.
 *
 * @param {string} id - Checkpoint ID to validate
 * @returns {string} The ID if valid
 * @throws {Error} If ID format is invalid
 */
function validateCheckpointId(id) {
  // Allow only alphanumeric and hyphens
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error(`SEC-006: Invalid checkpoint ID format: ${id}`);
  }
  return id;
}

// =============================================================================
// RollbackManager Class
// =============================================================================

/**
 * Manages checkpoints for file rollback operations
 */
class RollbackManager {
  /**
   * Create a new RollbackManager
   *
   * @param {Object} options - Configuration options
   * @param {string} options.checkpointDir - Directory for checkpoint storage
   * @param {string} options.logFile - Path to audit log file (JSONL)
   */
  constructor(options = {}) {
    this.checkpointDir = options.checkpointDir || DEFAULT_CHECKPOINT_DIR;
    this.logFile = options.logFile || DEFAULT_LOG_FILE;
  }

  /**
   * Ensure a directory exists, creating it if necessary
   *
   * @param {string} dir - Directory path
   * @private
   */
  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Append an entry to the audit log
   *
   * @param {Object} entry - Log entry object
   * @private
   */
  _log(entry) {
    const logEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this._ensureDir(path.dirname(this.logFile));
    fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
  }

  /**
   * Create a checkpoint with the specified files
   *
   * @param {string} name - Human-readable checkpoint name
   * @param {string[]} files - Array of file paths to backup
   * @param {Object} [metadata={}] - Optional metadata to store
   * @param {string} [baseDir=null] - Base directory for path validation (security)
   * @returns {Promise<string>} Checkpoint ID
   * @throws {Error} If any path fails security validation
   */
  async createCheckpoint(name, files, metadata = {}, baseDir = null) {
    const checkpointId = createCheckpointId();
    const checkpointPath = path.join(this.checkpointDir, checkpointId);
    const filesPath = path.join(checkpointPath, 'files');

    // Create checkpoint directories
    this._ensureDir(checkpointPath);
    this._ensureDir(filesPath);

    const fileEntries = [];
    const skippedFiles = [];

    // Process each file
    for (const filePath of files) {
      // Security: Validate path before any file operations
      const validation = validatePath(filePath, baseDir);
      if (!validation.valid) {
        throw new Error(`Invalid path in checkpoint: ${filePath} - ${validation.reason}`);
      }

      if (!fs.existsSync(filePath)) {
        skippedFiles.push(filePath);
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const hash = calculateHash(content);
        const backupName = sanitizePathForBackup(filePath) + '.backup';
        const backupPath = path.join(filesPath, backupName);

        // Copy file to backup location
        fs.writeFileSync(backupPath, content);

        fileEntries.push({
          path: filePath,
          backupName,
          hash,
        });
      } catch (_error) {
        skippedFiles.push(filePath);
      }
    }

    // Create manifest
    const manifest = {
      id: checkpointId,
      name,
      createdAt: new Date().toISOString(),
      files: fileEntries,
      metadata,
    };

    const manifestPath = path.join(checkpointPath, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Log checkpoint creation
    this._log({
      operation: 'checkpoint_created',
      checkpointId,
      name,
      fileCount: fileEntries.length,
      skippedCount: skippedFiles.length,
    });

    return checkpointId;
  }

  /**
   * Load manifest for a checkpoint
   *
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Object|null} Manifest object or null if not found
   * @private
   */
  _loadManifest(checkpointId) {
    const manifestPath = path.join(this.checkpointDir, checkpointId, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    const { safeParseJSON } = require('../utils/safe-json.cjs');
    return safeParseJSON(fs.readFileSync(manifestPath, 'utf-8'), null);
  }

  /**
   * Restore a single file from backup
   *
   * @param {string} checkpointId - Checkpoint ID
   * @param {Object} fileEntry - File entry from manifest
   * @returns {boolean} True if restored successfully
   * @private
   */
  _restoreFile(checkpointId, fileEntry) {
    const backupPath = path.join(this.checkpointDir, checkpointId, 'files', fileEntry.backupName);

    if (!fs.existsSync(backupPath)) {
      return false;
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(fileEntry.path);
    this._ensureDir(parentDir);

    // Restore file
    const content = fs.readFileSync(backupPath, 'utf-8');
    fs.writeFileSync(fileEntry.path, content);

    return true;
  }

  /**
   * Rollback all files to checkpoint state
   *
   * @param {string} checkpointId - Checkpoint ID to rollback to
   * @param {string} [baseDir=null] - Base directory for path validation (security)
   * @returns {Promise<Object>} Result with success flag and restored files
   * @throws {Error} If any manifest path fails security validation
   */
  async rollback(checkpointId, baseDir = null) {
    const manifest = this._loadManifest(checkpointId);

    if (!manifest) {
      return {
        success: false,
        error: `Checkpoint not found: ${checkpointId}`,
        restored: [],
      };
    }

    const restored = [];
    const failed = [];

    for (const fileEntry of manifest.files) {
      // Security: Validate path before restoring files
      // This protects against tampered manifests with path traversal
      const validation = validatePath(fileEntry.path, baseDir);
      if (!validation.valid) {
        throw new Error(`Invalid path in rollback: ${fileEntry.path} - ${validation.reason}`);
      }

      try {
        const success = this._restoreFile(checkpointId, fileEntry);
        if (success) {
          restored.push(fileEntry.path);
        } else {
          failed.push(fileEntry.path);
        }
      } catch (_error) {
        failed.push(fileEntry.path);
      }
    }

    // Log rollback
    this._log({
      operation: 'rollback_completed',
      checkpointId,
      restoredCount: restored.length,
      failedCount: failed.length,
    });

    return {
      success: failed.length === 0,
      restored,
      failed,
    };
  }

  /**
   * Selectively rollback specific files from a checkpoint
   *
   * @param {string} checkpointId - Checkpoint ID
   * @param {string[]} filesToRestore - Array of file paths to restore
   * @param {string} [baseDir=null] - Base directory for path validation (security)
   * @returns {Promise<Object>} Result with success flag, restored and skipped files
   * @throws {Error} If any requested path fails security validation
   */
  async selectiveRollback(checkpointId, filesToRestore, baseDir = null) {
    const manifest = this._loadManifest(checkpointId);

    if (!manifest) {
      return {
        success: false,
        error: `Checkpoint not found: ${checkpointId}`,
        restored: [],
        skipped: filesToRestore,
      };
    }

    const restored = [];
    const skipped = [];

    // Create a map of file paths to entries for quick lookup
    const fileMap = new Map();
    for (const entry of manifest.files) {
      fileMap.set(entry.path, entry);
    }

    for (const filePath of filesToRestore) {
      // Security: Validate path before any file operations
      const validation = validatePath(filePath, baseDir);
      if (!validation.valid) {
        throw new Error(`Invalid path in selective rollback: ${filePath} - ${validation.reason}`);
      }

      const fileEntry = fileMap.get(filePath);

      if (!fileEntry) {
        skipped.push(filePath);
        continue;
      }

      try {
        const success = this._restoreFile(checkpointId, fileEntry);
        if (success) {
          restored.push(filePath);
        } else {
          skipped.push(filePath);
        }
      } catch (_error) {
        skipped.push(filePath);
      }
    }

    // Log selective rollback
    this._log({
      operation: 'selective_rollback',
      checkpointId,
      requestedCount: filesToRestore.length,
      restoredCount: restored.length,
      skippedCount: skipped.length,
    });

    return {
      success: true,
      restored,
      skipped,
    };
  }

  /**
   * List all available checkpoints
   *
   * @returns {Promise<Array>} Array of checkpoint summaries sorted newest first
   */
  async listCheckpoints() {
    this._ensureDir(this.checkpointDir);

    const entries = fs.readdirSync(this.checkpointDir, { withFileTypes: true });
    const checkpoints = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('cp-')) {
        continue;
      }

      const manifest = this._loadManifest(entry.name);
      if (manifest) {
        checkpoints.push({
          id: manifest.id,
          name: manifest.name,
          createdAt: manifest.createdAt,
          fileCount: manifest.files.length,
          metadata: manifest.metadata,
        });
      }
    }

    // Sort by creation time, newest first
    checkpoints.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    return checkpoints;
  }

  /**
   * Delete a checkpoint and its files
   *
   * @param {string} checkpointId - Checkpoint ID to delete
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {Error} If checkpoint ID is invalid (SEC-006)
   * @private
   */
  async _deleteCheckpoint(checkpointId) {
    // SEC-006: Validate checkpoint ID to prevent path injection
    validateCheckpointId(checkpointId);

    const checkpointPath = path.join(this.checkpointDir, checkpointId);

    if (!fs.existsSync(checkpointPath)) {
      return false;
    }

    fs.rmSync(checkpointPath, { recursive: true, force: true });
    return true;
  }

  /**
   * Prune checkpoints older than specified age
   *
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {Promise<Object>} Result with count of deleted checkpoints
   */
  async pruneCheckpoints(maxAge = DEFAULT_MAX_AGE) {
    const checkpoints = await this.listCheckpoints();
    const now = Date.now();
    let deleted = 0;

    for (const checkpoint of checkpoints) {
      const createdAt = new Date(checkpoint.createdAt).getTime();
      const age = now - createdAt;

      if (age > maxAge) {
        const success = await this._deleteCheckpoint(checkpoint.id);
        if (success) {
          deleted++;

          // Log pruning
          this._log({
            operation: 'checkpoint_pruned',
            checkpointId: checkpoint.id,
            name: checkpoint.name,
            ageMs: age,
          });
        }
      }
    }

    return { deleted };
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  RollbackManager,
  createCheckpointId,
  calculateHash,
  sanitizePathForBackup,
  // SEC-006: Path validation exports
  validatePathWithinRoot,
  validateCheckpointId,
  // Constants
  DEFAULT_CHECKPOINT_DIR,
  DEFAULT_LOG_FILE,
  DEFAULT_MAX_AGE,
};
