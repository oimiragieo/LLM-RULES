#!/usr/bin/env node
/**
 * index.cjs - Unified Memory Core API (Phase 1 Facade Entry Point)
 * ==================================================================
 *
 * Phase 1 Consolidation: Central export point for all memory core layers.
 *
 * This index file provides a unified API across all 4 memory layers:
 * 1. Storage - Read/write operations
 * 2. Query - Search and retrieval
 * 3. Extraction - Extract and write learnings
 * 4. Lifecycle - Rotation, pruning, archival
 *
 * Usage:
 *   const memory = require('.claude/lib/memory/core');
 *   await memory.storage.appendToLearnings('New pattern found');
 *   const results = await memory.query.searchMemory('authentication');
 *   await memory.lifecycle.rotateMemory('learnings.md');
 */

'use strict';

const storage = require('./memory-storage.cjs');
const query = require('./memory-query.cjs');
const extraction = require('./memory-extraction.cjs');
const lifecycle = require('./memory-lifecycle.cjs');

// Export all layers as namespaced modules
module.exports = {
  storage,
  query,
  extraction,
  lifecycle,

  // Convenience: Export most commonly used functions at top level
  // (consumers can use either `memory.appendToLearnings()` or `memory.storage.appendToLearnings()`)

  // Storage shortcuts
  appendToLearnings: storage.appendToLearnings,
  appendToDecisions: storage.appendToDecisions,
  appendToIssues: storage.appendToIssues,
  readLearnings: storage.readLearnings,
  readDecisions: storage.readDecisions,
  readIssues: storage.readIssues,
  readMemory: storage.readMemory,
  writeMemory: storage.writeMemory,
  listMemories: storage.listMemories,
  deleteMemory: storage.deleteMemory,

  // Query shortcuts
  searchMemory: query.searchMemory,
  queryByEntity: query.queryByEntity,
  getRelevantMemories: query.getRelevantMemories,

  // Extraction shortcuts
  extractMemories: extraction.extractMemories,
  runPipeline: extraction.runPipeline,

  // Lifecycle shortcuts
  rotateMemory: lifecycle.rotateMemory,
  pruneMemory: lifecycle.pruneMemory,
  archiveToCold: lifecycle.archiveToCold,
  runMaintenanceCycle: lifecycle.runMaintenanceCycle,
};
