#!/usr/bin/env node
/**
 * memory-lifecycle.cjs - Unified Memory Lifecycle Layer (Phase 1 Facade)
 * =======================================================================
 *
 * Phase 1 Consolidation: Re-exports lifecycle functions from existing modules.
 * This is a facade layer - full logic migration happens in Phase 2.
 *
 * Responsibilities:
 * - HOT -> WARM rotation (section-based, 20KB threshold)
 * - Deduplication (Jaccard similarity, threshold 0.5)
 * - Resolved-entry pruning (30-day age)
 * - WARM -> COLD archival (30-day age)
 * - Cross-tier search for archived content
 * - Scheduled maintenance (weekly rotation + pruning)
 * - Retention policy enforcement
 *
 * Formed from:
 * - memory-rotator.cjs (HOT -> WARM rotation)
 * - smart-pruner.cjs (deduplication and pruning)
 * - cold-storage.cjs (WARM -> COLD archival)
 * - memory-scheduler.cjs (scheduled maintenance)
 * - memory-deduplicator.cjs (duplicate detection)
 * - memory-retention-config.cjs (retention policies)
 */

'use strict';

// Import existing modules (Phase 1: re-export pattern)
const memoryRotator = require('../memory-rotator.cjs');
const smartPruner = require('../smart-pruner.cjs');
const coldStorage = require('../cold-storage.cjs');
const memoryScheduler = require('../memory-scheduler.cjs');
const memoryDeduplicator = require('../memory-deduplicator.cjs');
const memoryRetentionConfig = require('../memory-retention-config.cjs');

// --- Re-export memory-rotator.cjs functions ---

/**
 * Rotate a memory file from HOT to WARM tier
 * @param {string} filePath - Path to memory file
 * @param {object} [options] - Rotation options
 * @param {number} [options.thresholdKB] - Size threshold in KB
 * @param {number} [options.keepSections] - Number of sections to keep
 * @returns {Promise<object>} Rotation result
 */
async function rotateMemory(filePath, options) {
  return memoryRotator.rotateMemoryFile(filePath, options);
}

/**
 * Check if a memory file needs rotation
 * @param {string} filePath - Path to memory file
 * @returns {Promise<boolean>} True if rotation needed
 */
async function checkRotationNeeded(filePath) {
  return memoryRotator.needsRotation(filePath);
}

/**
 * Rotate all HOT tier memory files
 * @returns {Promise<Array>} Results for each file
 */
async function rotateAllFiles() {
  return memoryRotator.rotateAll();
}

// --- Re-export smart-pruner.cjs functions ---

/**
 * Prune duplicates and resolved entries from a memory file
 * @param {string} filePath - Path to memory file
 * @param {object} [options] - Pruning options
 * @param {number} [options.threshold] - Similarity threshold (0-1)
 * @param {number} [options.maxAge] - Max age in days for resolved entries
 * @returns {Promise<object>} Pruning result
 */
async function pruneMemory(filePath, options) {
  return smartPruner.pruneMemoryFile(filePath, options);
}

/**
 * Find duplicates in a set of entries
 * @param {Array} entries - Memory entries
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {Array} Duplicate groups
 */
function findDuplicates(entries, threshold) {
  return memoryDeduplicator.findDuplicates(entries, threshold);
}

/**
 * Deduplicate entries (keep highest quality)
 * @param {Array} entries - Memory entries
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {Array} Deduplicated entries
 */
function deduplicate(entries, threshold) {
  return smartPruner.deduplicateEntries(entries, threshold);
}

// --- Re-export cold-storage.cjs functions ---

/**
 * Archive a WARM tier file to COLD tier
 * @param {string} warmFilePath - Path to WARM tier file
 * @returns {Promise<object>} Archival result
 */
async function archiveToCold(warmFilePath) {
  return coldStorage.archiveToStorage(warmFilePath);
}

/**
 * Search COLD tier for content
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results from COLD tier
 */
async function searchColdStorage(query) {
  return coldStorage.searchCold(query);
}

/**
 * List all COLD tier archives
 * @returns {Promise<Array>} List of archived files
 */
async function listColdArchives() {
  return coldStorage.listArchives();
}

// --- Re-export memory-scheduler.cjs functions ---

/**
 * Schedule maintenance tasks (rotation, pruning, archival)
 * @param {object} [options] - Scheduler options
 * @returns {object} Scheduler instance
 */
function scheduleMaintenace(options) {
  return memoryScheduler.scheduleMaintenanceTasks(options);
}

/**
 * Run a full maintenance cycle (rotate + prune + archive)
 * @returns {Promise<object>} Maintenance result
 */
async function runMaintenanceCycle() {
  return memoryScheduler.runMaintenanceCycle();
}

/**
 * Stop scheduled maintenance
 */
function stopMaintenance() {
  return memoryScheduler.stopScheduler();
}

// --- Re-export memory-retention-config.cjs functions ---

/**
 * Get retention policy for a tier
 * @param {string} tier - Tier name (HOT, WARM, COLD)
 * @returns {object} Retention policy
 */
function getRetentionPolicy(tier) {
  return memoryRetentionConfig.getRetentionPolicy(tier);
}

/**
 * Retention configuration constants
 */
const RETENTION_CONFIG = memoryRetentionConfig.RETENTION_CONFIG;

// --- Public API ---

module.exports = {
  // Rotation functions
  rotateMemory,
  checkRotationNeeded,
  rotateAllFiles,

  // Pruning functions
  pruneMemory,
  deduplicate,

  // Duplicate detection
  findDuplicates,

  // Cold storage
  archiveToCold,
  searchColdStorage,
  listColdArchives,

  // Scheduled maintenance
  scheduleMaintenace,
  runMaintenanceCycle,
  stopMaintenance,

  // Retention policies
  getRetentionPolicy,
  RETENTION_CONFIG,
};
