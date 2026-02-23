#!/usr/bin/env node
/**
 * memory-storage.cjs - Unified Memory Storage Layer (Phase 1 Facade)
 * ===================================================================
 *
 * Phase 1 Consolidation: Re-exports storage functions from existing modules.
 * This is a facade layer - full logic migration happens in Phase 2.
 *
 * Responsibilities:
 * - Read/write to HOT tier memory files (learnings.md, decisions.md, issues.md)
 * - Named memory API (readMemory, writeMemory, listMemories, deleteMemory)
 * - Atomic writes with proper-lockfile
 * - Audit trail logging
 * - Path resolution for all tiers (HOT/WARM/COLD)
 * - Constants and area definitions
 *
 * Formed from:
 * - memory-manager.cjs (append/read functions)
 * - contextual-memory.cjs (write portion of named memory API)
 * - memory-areas.cjs (area definitions)
 * - memory-constants.cjs (shared constants)
 * - memory-tiers.cjs (tier definitions and paths)
 * - audit-trail-integration.cjs (audit logging)
 */

'use strict';

// Import existing modules (Phase 1: re-export pattern)
const memoryManager = require('../memory-manager.cjs');
const contextualMemory = require('../contextual-memory.cjs');
const { DEFAULT_AREA, isValidArea } = require('../memory-areas.cjs');
const {
  SEMANTIC_SEARCH_DEFAULT_THRESHOLD,
  MEMORY_FILE_MAX_SIZE_KB,
} = require('../memory-constants.cjs');
const { MEMORY_TIERS, getTierPath } = require('../memory-tiers.cjs');
const { recordMemoryOperation } = require('../audit-trail-integration.cjs');

// --- Re-export memory-manager.cjs functions ---

/**
 * Append content to learnings.md (HOT tier)
 * @param {string} content - Content to append
 * @param {object} [options] - Options (area, source)
 */
function appendToLearnings(content, options) {
  return memoryManager.appendLearnings(content, options);
}

/**
 * Append content to decisions.md (HOT tier)
 * @param {string} content - Content to append
 * @param {object} [options] - Options (area, source)
 */
function appendToDecisions(content, options) {
  return memoryManager.appendDecisions(content, options);
}

/**
 * Append content to issues.md (HOT tier)
 * @param {string} content - Content to append
 * @param {object} [options] - Options (area, source)
 */
function appendToIssues(content, options) {
  return memoryManager.appendIssues(content, options);
}

/**
 * Read learnings.md (HOT tier)
 * @returns {string} Content of learnings.md
 */
function readLearnings() {
  return memoryManager.readLearnings();
}

/**
 * Read decisions.md (HOT tier)
 * @returns {string} Content of decisions.md
 */
function readDecisions() {
  return memoryManager.readDecisions();
}

/**
 * Read issues.md (HOT tier)
 * @returns {string} Content of issues.md
 */
function readIssues() {
  return memoryManager.readIssues();
}

// --- Re-export contextual-memory.cjs named memory API ---

/**
 * Read a named memory file
 * @param {string} name - Memory name
 * @returns {Promise<string|null>} Memory content or null
 */
async function readMemory(name) {
  return contextualMemory.readMemory(name);
}

/**
 * Write to a named memory file
 * @param {string} name - Memory name
 * @param {string} content - Content to write
 * @returns {Promise<void>}
 */
async function writeMemory(name, content) {
  return contextualMemory.writeMemory(name, content);
}

/**
 * List all named memory files
 * @returns {Promise<string[]>} Array of memory names
 */
async function listMemories() {
  return contextualMemory.listMemories();
}

/**
 * Delete a named memory file
 * @param {string} name - Memory name
 * @returns {Promise<void>}
 */
async function deleteMemory(name) {
  return contextualMemory.deleteMemory(name);
}

// --- Re-export constants and paths ---

/**
 * Memory tiers (HOT/WARM/COLD)
 */
const TIERS = MEMORY_TIERS;

/**
 * Get path for a specific tier
 * @param {string} tier - Tier name (HOT, WARM, COLD)
 * @returns {string} Path to tier directory
 */
function getMemoryTierPath(tier) {
  return getTierPath(tier);
}

/**
 * Maximum HOT tier file size in KB
 */
const MAX_HOT_SIZE_KB = MEMORY_FILE_MAX_SIZE_KB || 20;

/**
 * Default semantic search threshold
 */
const DEFAULT_SEARCH_THRESHOLD = SEMANTIC_SEARCH_DEFAULT_THRESHOLD;

/**
 * Memory areas (for categorization)
 */
const MEMORY_AREAS = {
  DEFAULT: DEFAULT_AREA,
  isValidArea,
};

// --- Re-export audit trail functions ---

/**
 * Log a memory operation for audit trail
 * @param {string} operation - Operation type
 * @param {object} details - Operation details
 */
function logMemoryOperation(operation, details) {
  return recordMemoryOperation(operation, details);
}

// --- Public API ---

module.exports = {
  // Append functions
  appendToLearnings,
  appendToDecisions,
  appendToIssues,

  // Read functions
  readLearnings,
  readDecisions,
  readIssues,

  // Named memory API
  readMemory,
  writeMemory,
  listMemories,
  deleteMemory,

  // Audit trail
  logMemoryOperation,

  // Constants and paths
  TIERS,
  getMemoryTierPath,
  MAX_HOT_SIZE_KB,
  DEFAULT_SEARCH_THRESHOLD,
  MEMORY_AREAS,
};
