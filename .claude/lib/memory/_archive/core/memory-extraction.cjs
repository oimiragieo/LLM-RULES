#!/usr/bin/env node
/**
 * memory-extraction.cjs - Unified Memory Extraction Layer (Phase 1 Facade)
 * =========================================================================
 *
 * Phase 1 Consolidation: Re-exports extraction functions from existing modules.
 * This is a facade layer - full logic migration happens in Phase 2.
 *
 * Responsibilities:
 * - Extract learnings/decisions/issues from agent output
 * - Write extracted content to appropriate memory files
 * - Run full extraction pipeline
 * - Generate session summaries
 *
 * Formed from:
 * - memory-extractor.cjs (extraction logic)
 * - memory-extraction-writer.cjs (writing extracted content)
 * - run-extraction-pipeline.cjs (full pipeline orchestration)
 * - session-summary.cjs (session summary generation)
 */

'use strict';

// Import existing modules (Phase 1: re-export pattern)
const memoryExtractor = require('../memory-extractor.cjs');
const memoryExtractionWriter = require('../memory-extraction-writer.cjs');
const runExtractionPipeline = require('../run-extraction-pipeline.cjs');
const sessionSummary = require('../session-summary.cjs');

// --- Re-export memory-extractor.cjs functions ---

/**
 * Extract all memory types (learnings, decisions, issues) from agent output
 * @param {object} agentOutput - Agent output data
 * @returns {Promise<object>} Extracted memories by category
 */
async function extractMemories(agentOutput) {
  return memoryExtractor.extractMemories(agentOutput);
}

/**
 * Extract learnings from text
 * @param {string} text - Text to extract from
 * @returns {Promise<Array>} Extracted learnings
 */
async function extractLearnings(text) {
  return memoryExtractor.extractLearnings(text);
}

/**
 * Extract decisions from text
 * @param {string} text - Text to extract from
 * @returns {Promise<Array>} Extracted decisions
 */
async function extractDecisions(text) {
  return memoryExtractor.extractDecisions(text);
}

/**
 * Extract issues from text
 * @param {string} text - Text to extract from
 * @returns {Promise<Array>} Extracted issues
 */
async function extractIssues(text) {
  return memoryExtractor.extractIssues(text);
}

// --- Re-export memory-extraction-writer.cjs functions ---

/**
 * Write extracted memories to appropriate memory files
 * @param {object} extracted - Extracted memories by category
 * @returns {Promise<void>}
 */
async function writeExtractedMemories(extracted) {
  return memoryExtractionWriter.writeExtractedMemories(extracted);
}

/**
 * Write learnings to learnings.md
 * @param {Array} learnings - Learnings to write
 * @returns {Promise<void>}
 */
async function writeLearnings(learnings) {
  return memoryExtractionWriter.writeLearnings(learnings);
}

/**
 * Write decisions to decisions.md
 * @param {Array} decisions - Decisions to write
 * @returns {Promise<void>}
 */
async function writeDecisions(decisions) {
  return memoryExtractionWriter.writeDecisions(decisions);
}

/**
 * Write issues to issues.md
 * @param {Array} issues - Issues to write
 * @returns {Promise<void>}
 */
async function writeIssues(issues) {
  return memoryExtractionWriter.writeIssues(issues);
}

// --- Re-export run-extraction-pipeline.cjs functions ---

/**
 * Run full extraction pipeline (extract + write)
 * @param {object} agentOutput - Agent output data
 * @param {object} [options] - Pipeline options
 * @returns {Promise<object>} Pipeline result
 */
async function runPipeline(agentOutput, options) {
  return runExtractionPipeline.runExtractionPipeline(agentOutput, options);
}

// --- Re-export session-summary.cjs functions ---

/**
 * Generate a session summary
 * @param {object} sessionData - Session data
 * @returns {Promise<string>} Session summary
 */
async function generateSessionSummary(sessionData) {
  return sessionSummary.generateSessionSummary(sessionData);
}

/**
 * Generate a structured session summary
 * @param {object} sessionData - Session data
 * @param {object} [options] - Summary options
 * @returns {Promise<object>} Structured session summary
 */
async function generateStructuredSummary(sessionData, options) {
  return sessionSummary.generateStructuredSummary(sessionData, options);
}

// --- Public API ---

module.exports = {
  // Extraction functions
  extractMemories,
  extractLearnings,
  extractDecisions,
  extractIssues,

  // Writing functions
  writeExtractedMemories,
  writeLearnings,
  writeDecisions,
  writeIssues,

  // Pipeline orchestration
  runPipeline,

  // Session summaries
  generateSessionSummary,
  generateStructuredSummary,
};
