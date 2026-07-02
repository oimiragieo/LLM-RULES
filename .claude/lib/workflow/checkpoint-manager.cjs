#!/usr/bin/env node
/**
 * Checkpoint Manager
 * ==================
 *
 * Manages workflow checkpoints for durability and resume capabilities.
 * Part of the EVOLVE workflow engine system.
 *
 * Features:
 * - File-based storage with gzip compression
 * - Memory-based storage for testing
 * - Auto-cleanup (age and count based)
 * - Checkpoint listing and querying
 * - Resume point extraction
 *
 * Usage:
 *   const { CheckpointManager, createCheckpointId } = require('./checkpoint-manager.cjs');
 *
 *   const manager = new CheckpointManager({
 *     checkpointDir: '.claude/context/checkpoints'
 *   });
 *
 *   const id = await manager.save('workflow-123', state);
 *   const checkpoint = await manager.load(id);
 *   const latest = await manager.loadLatest('workflow-123');
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { atomicWriteAsync } = require('../utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// =============================================================================
// Constants
// =============================================================================

/**
 * Default checkpoint directory (relative to project root)
 */
const DEFAULT_CHECKPOINT_DIR = '.claude/context/checkpoints';

/**
 * Default max age for checkpoints (7 days in milliseconds)
 */
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Default max checkpoints per workflow
 */
const DEFAULT_MAX_COUNT = 10;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique checkpoint ID
 *
 * Format: chk-{timestamp}-{random}
 *
 * @returns {string} Unique checkpoint ID
 */
function createCheckpointId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `chk-${timestamp}-${random}`;
}

/**
 * Compress state object to gzipped buffer
 *
 * @param {Object} state - State object to compress
 * @returns {Buffer} Gzipped buffer
 */
function compressState(state) {
  const json = JSON.stringify(state);
  const buffer = Buffer.from(json, 'utf-8');
  return zlib.gzipSync(buffer);
}

/**
 * Decompress gzipped buffer to state object
 *
 * @param {Buffer} compressed - Gzipped buffer
 * @returns {Object} Decompressed state object
 */
function decompressState(compressed) {
  const buffer = zlib.gunzipSync(compressed);
  const json = buffer.toString('utf-8');
  const parsed = safeParseJSON(json, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid checkpoint payload');
  }
  return parsed;
}

// =============================================================================
// Storage Backends
// =============================================================================

/**
 * Memory-based storage backend (for testing)
 */
class MemoryStorage {
  constructor() {
    this.data = new Map();
  }

  async save(id, checkpoint) {
    this.data.set(id, checkpoint);
  }

  async load(id) {
    return this.data.get(id) || null;
  }

  async delete(id) {
    this.data.delete(id);
  }

  async list() {
    return Array.from(this.data.values());
  }
}

/**
 * File-based storage backend with gzip compression
 */
class FileStorage {
  constructor(checkpointDir) {
    this.checkpointDir = checkpointDir;
  }

  /**
   * Ensure checkpoint directory exists
   */
  ensureDir() {
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  /**
   * Get file path for a checkpoint ID
   */
  getFilePath(id) {
    return path.join(this.checkpointDir, `${id}.json.gz`);
  }

  async save(id, checkpoint) {
    this.ensureDir();
    const filePath = this.getFilePath(id);
    const compressed = compressState(checkpoint);
    await fs.promises.writeFile(filePath, compressed);
  }

  async load(id) {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const compressed = await fs.promises.readFile(filePath);
    return decompressState(compressed);
  }

  async delete(id) {
    const filePath = this.getFilePath(id);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  async list() {
    this.ensureDir();
    const files = await fs.promises.readdir(this.checkpointDir);
    const checkpoints = [];

    for (const file of files) {
      if (file.endsWith('.json.gz')) {
        const id = file.replace('.json.gz', '');
        try {
          const checkpoint = await this.load(id);
          if (checkpoint) {
            checkpoints.push(checkpoint);
          }
        } catch (_e) {
          // Skip corrupted files
          console.warn(`[checkpoint-manager] Skipping corrupted checkpoint: ${file}`);
        }
      }
    }

    return checkpoints;
  }
}

// =============================================================================
// CheckpointManager Class
// =============================================================================

/**
 * Checkpoint manager for workflow durability
 */
class CheckpointManager {
  /**
   * Create a new CheckpointManager
   *
   * @param {Object} options - Configuration options
   * @param {string} options.checkpointDir - Directory for file storage
   * @param {string} options.storage - Storage type: 'file' or 'memory'
   * @param {number} options.maxAge - Max age for checkpoints in ms (default: 7 days)
   * @param {number} options.maxCount - Max checkpoints per workflow (default: 10)
   */
  constructor(options = {}) {
    this.options = {
      checkpointDir: options.checkpointDir || DEFAULT_CHECKPOINT_DIR,
      storage: options.storage || 'file',
      maxAge: options.maxAge || DEFAULT_MAX_AGE,
      maxCount: options.maxCount || DEFAULT_MAX_COUNT,
    };

    // Initialize storage backend
    if (this.options.storage === 'memory') {
      this.storage = new MemoryStorage();
    } else {
      this.storage = new FileStorage(this.options.checkpointDir);
    }
  }

  /**
   * Save a checkpoint
   *
   * @param {string} workflowId - Workflow identifier
   * @param {Object} state - Workflow state to save
   * @returns {string} Checkpoint ID
   */
  async save(workflowId, state) {
    const id = createCheckpointId();
    const checkpoint = {
      id,
      workflowName: workflowId,
      workflowVersion: state.workflowVersion || '1.0.0',
      createdAt: new Date().toISOString(),
      phase: state.phase,
      stepIndex: state.stepIndex,
      context: state.context || {},
      stepResults: state.stepResults || {},
      metadata: state.metadata || {},
    };

    await this.storage.save(id, checkpoint);
    return id;
  }

  /**
   * Load a specific checkpoint
   *
   * @param {string} checkpointId - Checkpoint ID to load
   * @returns {Object} Checkpoint data
   * @throws {Error} If checkpoint not found
   */
  async load(checkpointId) {
    const checkpoint = await this.storage.load(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    return checkpoint;
  }

  /**
   * Load the most recent checkpoint for a workflow
   *
   * @param {string} workflowId - Workflow identifier
   * @returns {Object|null} Latest checkpoint or null if none exist
   */
  async loadLatest(workflowId) {
    const checkpoints = await this.list(workflowId);
    if (checkpoints.length === 0) {
      return null;
    }
    return checkpoints[0]; // Already sorted newest first
  }

  /**
   * List all checkpoints for a workflow
   *
   * @param {string} workflowId - Workflow identifier
   * @returns {Array} List of checkpoints sorted by creation time (newest first)
   */
  async list(workflowId) {
    const allCheckpoints = await this.storage.list();
    const filtered = allCheckpoints.filter(c => c.workflowName === workflowId);

    // Sort by creation time, newest first
    filtered.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    return filtered;
  }

  /**
   * Delete a specific checkpoint
   *
   * @param {string} checkpointId - Checkpoint ID to delete
   */
  async delete(checkpointId) {
    await this.storage.delete(checkpointId);
  }

  /**
   * Cleanup old checkpoints
   *
   * @param {number} maxAge - Max age in ms (default: from options)
   * @param {number} maxCount - Max count per workflow (default: from options)
   * @returns {Object} Cleanup results
   */
  async cleanup(maxAge = this.options.maxAge, maxCount = this.options.maxCount) {
    const results = {
      deletedByAge: 0,
      deletedByCount: 0,
    };

    const now = Date.now();
    const allCheckpoints = await this.storage.list();

    // Delete by age
    for (const checkpoint of allCheckpoints) {
      const createdAt = new Date(checkpoint.createdAt).getTime();
      if (now - createdAt > maxAge) {
        await this.storage.delete(checkpoint.id);
        results.deletedByAge++;
      }
    }

    // Group by workflow and delete oldest exceeding maxCount
    const byWorkflow = new Map();
    const remainingCheckpoints = await this.storage.list();

    for (const checkpoint of remainingCheckpoints) {
      const wfId = checkpoint.workflowName;
      if (!byWorkflow.has(wfId)) {
        byWorkflow.set(wfId, []);
      }
      byWorkflow.get(wfId).push(checkpoint);
    }

    for (const [, checkpoints] of byWorkflow) {
      // Sort newest first
      checkpoints.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeB - timeA;
      });

      // Delete oldest exceeding count
      if (checkpoints.length > maxCount) {
        const toDelete = checkpoints.slice(maxCount);
        for (const checkpoint of toDelete) {
          await this.storage.delete(checkpoint.id);
          results.deletedByCount++;
        }
      }
    }

    return results;
  }

  /**
   * Check if a checkpoint can be resumed
   *
   * @param {string} checkpointId - Checkpoint ID to check
   * @returns {boolean} True if checkpoint exists and is valid
   */
  async canResume(checkpointId) {
    try {
      const checkpoint = await this.storage.load(checkpointId);
      return checkpoint !== null && checkpoint.phase !== undefined;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Get the resume point from a checkpoint
   *
   * @param {Object} checkpoint - Checkpoint object
   * @returns {Object} Resume point with phase and stepIndex
   */
  getResumePoint(checkpoint) {
    return {
      phase: checkpoint.phase,
      stepIndex: checkpoint.stepIndex,
    };
  }
}

// =============================================================================
// Simple Functional API (SPEC-003)
// =============================================================================

/**
 * Simplified functional API for SPEC-003 compatibility
 * Stores checkpoints at: .claude/context/runtime/checkpoints/
 */

const SPEC003_CHECKPOINT_DIR = path.join(__dirname, '../../context/runtime/checkpoints');

// Track step numbers for workflows
const workflowStepCounters = new Map();

// Memory safety: limit max workflow counters (LRU eviction)
const MAX_WORKFLOW_COUNTERS = 1000;

function getStepNumber(workflowId, stepId) {
  const match = stepId.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  const currentCount = workflowStepCounters.get(workflowId) || 0;
  const nextCount = currentCount + 1;
  workflowStepCounters.set(workflowId, nextCount);

  // Memory safety: enforce max size with LRU eviction
  if (workflowStepCounters.size > MAX_WORKFLOW_COUNTERS) {
    // Evict oldest entry (first key in Map, since Map preserves insertion order)
    const firstKey = workflowStepCounters.keys().next().value;
    workflowStepCounters.delete(firstKey);
    console.warn(
      `[CheckpointManager] Evicted workflow counter for ${firstKey} (size: ${workflowStepCounters.size})`
    );
  }

  return nextCount;
}

function getNextStepId(stepId) {
  const match = stepId.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const number = parseInt(match[2], 10);
    return `${prefix}${number + 1}`;
  }
  return 'next-step';
}

function generateChecksum(data) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function isValidSimpleCheckpoint(parsed) {
  return Boolean(
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    typeof parsed.workflowId === 'string' &&
    typeof parsed.stepId === 'string' &&
    typeof parsed.timestamp === 'string' &&
    typeof parsed.checksum === 'string' &&
    Object.prototype.hasOwnProperty.call(parsed, 'state')
  );
}

/**
 * Save checkpoint (simple API)
 * Accepts both signatures:
 * - save({ workflowId, stepId, state }, checkpointDir)
 * - save(workflowId, stepId, state, checkpointDir)
 */
async function save(arg1, arg2, arg3, arg4) {
  let workflowId, stepId, state, checkpointDir;

  // Handle object-style call: save({ workflowId, stepId, state }, checkpointDir)
  if (typeof arg1 === 'object' && arg1 !== null && arg1.workflowId) {
    workflowId = arg1.workflowId;
    stepId = arg1.stepId;
    state = arg1.state;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  } else {
    // Handle positional call: save(workflowId, stepId, state, checkpointDir)
    workflowId = arg1;
    stepId = arg2;
    state = arg3;
    checkpointDir = arg4 || SPEC003_CHECKPOINT_DIR;
  }

  await fs.promises.mkdir(checkpointDir, { recursive: true });

  const timestamp = new Date().toISOString();
  const stepNumber = getStepNumber(workflowId, stepId);

  const checkpoint = {
    workflowId,
    stepId,
    stepNumber,
    state,
    timestamp,
    checksum: generateChecksum(state),
  };

  const checkpointPath = path.join(checkpointDir, `${workflowId}.json`);
  await atomicWriteAsync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
}

/**
 * Load checkpoint (simple API)
 * Accepts both: load({ workflowId }, checkpointDir) or load(workflowId, checkpointDir)
 */
async function load(arg1, arg2) {
  let workflowId, checkpointDir;
  if (typeof arg1 === 'object' && arg1 !== null && arg1.workflowId) {
    workflowId = arg1.workflowId;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  } else {
    workflowId = arg1;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  }
  const checkpointPath = path.join(checkpointDir, `${workflowId}.json`);

  try {
    const content = await fs.promises.readFile(checkpointPath, 'utf8');
    const parsed = safeParseJSON(content, null);
    if (!isValidSimpleCheckpoint(parsed)) {
      return null;
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

/**
 * Check if checkpoint exists (simple API)
 * Accepts both: exists({ workflowId }, checkpointDir) or exists(workflowId, checkpointDir)
 */
async function exists(arg1, arg2) {
  let workflowId, checkpointDir;
  if (typeof arg1 === 'object' && arg1 !== null && arg1.workflowId) {
    workflowId = arg1.workflowId;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  } else {
    workflowId = arg1;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  }
  const checkpointPath = path.join(checkpointDir, `${workflowId}.json`);

  try {
    await fs.promises.access(checkpointPath);
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Verify checkpoint integrity (simple API)
 * Accepts both: verify({ workflowId }, checkpointDir) or verify(workflowId, checkpointDir)
 */
async function verify(arg1, arg2) {
  let workflowId, checkpointDir;
  if (typeof arg1 === 'object' && arg1 !== null && arg1.workflowId) {
    workflowId = arg1.workflowId;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  } else {
    workflowId = arg1;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  }
  const checkpoint = await load(workflowId, checkpointDir);

  if (!checkpoint) {
    return false;
  }

  const expectedChecksum = generateChecksum(checkpoint.state);
  return checkpoint.checksum === expectedChecksum;
}

/**
 * Clear checkpoint (simple API)
 * Accepts both: clear({ workflowId }, checkpointDir) or clear(workflowId, checkpointDir)
 */
async function clear(arg1, arg2) {
  let workflowId, checkpointDir;
  if (typeof arg1 === 'object' && arg1 !== null && arg1.workflowId) {
    workflowId = arg1.workflowId;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  } else {
    workflowId = arg1;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  }
  const checkpointPath = path.join(checkpointDir, `${workflowId}.json`);

  try {
    await fs.promises.unlink(checkpointPath);
    workflowStepCounters.delete(workflowId);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Recover workflow from checkpoint (simple API)
 * Accepts both: recover({ workflowId }, checkpointDir) or recover(workflowId, checkpointDir)
 */
async function recover(arg1, arg2) {
  let workflowId, checkpointDir;
  if (typeof arg1 === 'object' && arg1 !== null && arg1.workflowId) {
    workflowId = arg1.workflowId;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  } else {
    workflowId = arg1;
    checkpointDir = arg2 || SPEC003_CHECKPOINT_DIR;
  }
  const checkpoint = await load(workflowId, checkpointDir);

  if (!checkpoint) {
    return null;
  }

  const isValid = await verify(workflowId, checkpointDir);

  if (!isValid) {
    throw new Error(`Checkpoint for workflow ${workflowId} is corrupted. Cannot recover.`);
  }

  const nextStep = getNextStepId(checkpoint.stepId);

  return {
    workflowId: checkpoint.workflowId,
    stepId: checkpoint.stepId,
    stepNumber: checkpoint.stepNumber,
    state: checkpoint.state,
    timestamp: checkpoint.timestamp,
    nextStep,
    recovered: true,
  };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  // Class-based API (existing)
  CheckpointManager,
  createCheckpointId,
  compressState,
  decompressState,
  // Simple functional API (SPEC-003)
  save,
  load,
  exists,
  verify,
  clear,
  recover,
};
