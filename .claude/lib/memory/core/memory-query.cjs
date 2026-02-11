#!/usr/bin/env node
/**
 * memory-query.cjs - Unified Memory Query Layer (Phase 1 Facade)
 * ===============================================================
 *
 * Phase 1 Consolidation: Re-exports query/search functions from existing modules.
 * This is a facade layer - full logic migration happens in Phase 2.
 *
 * Responsibilities:
 * - Text search across all tiers (HOT -> WARM -> COLD)
 * - Entity-based queries
 * - Intent-driven memory retrieval
 * - Learnings parsing and structured access
 * - Entity extraction from text
 * - Entity-to-memory linking
 *
 * Formed from:
 * - memory-search.cjs (CLI wrapper for search)
 * - contextual-memory.cjs (query portion with tiered search)
 * - entity-query.cjs (entity-based queries)
 * - intent-analyzer.cjs (intent analysis)
 * - entity-extractor.cjs (entity extraction)
 * - memory-entity-links.cjs (entity linking)
 * - learnings-parser.cjs (learnings parsing)
 */

'use strict';

// Import existing modules (Phase 1: re-export pattern)
const contextualMemory = require('../contextual-memory.cjs');
const { EntityQuery } = require('../entity-query.cjs');
const { analyzeIntent } = require('../intent-analyzer.cjs');
const { extractEntities } = require('../entity-extractor.cjs');
const {
  linkEntityToMemory,
  getLinkedMemories,
  unlinkEntityFromMemory,
} = require('../memory-entity-links.cjs');
const {
  parseLearnings,
  findLearningByTopic,
  getLearningsByDate,
} = require('../learnings-parser.cjs');

// --- Re-export contextual-memory.cjs search functions ---

/**
 * Search memory across all tiers (HOT -> WARM -> COLD)
 * @param {string} query - Search query
 * @param {object} [options] - Search options
 * @param {number} [options.limit] - Max results
 * @param {number} [options.threshold] - Similarity threshold
 * @returns {Promise<Array>} Search results
 */
async function searchMemory(query, options) {
  return contextualMemory.searchMemory(query, options);
}

/**
 * Search HOT tier only
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
async function searchHot(query) {
  return contextualMemory.searchHot(query);
}

/**
 * Search WARM tier only
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
async function searchWarm(query) {
  return contextualMemory.searchWarm(query);
}

/**
 * Search COLD tier only
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results
 */
async function searchCold(query) {
  return contextualMemory.searchCold(query);
}

// --- Re-export entity-query.cjs functions ---

/**
 * Query memories by entity name
 * @param {string} entityName - Entity name to query
 * @param {object} [options] - Query options
 * @returns {Promise<Array>} Query results
 */
async function queryByEntity(entityName, options) {
  const entityQuery = new EntityQuery();
  return entityQuery.findByEntity(entityName, options);
}

/**
 * Get all entities in memory system
 * @returns {Promise<Array>} List of entities
 */
async function getAllEntities() {
  const entityQuery = new EntityQuery();
  return entityQuery.getAllEntities();
}

// --- Re-export intent-analyzer.cjs functions ---

/**
 * Analyze intent from a prompt
 * @param {string} prompt - User prompt
 * @returns {Promise<object>} Intent analysis result
 */
async function analyzePromptIntent(prompt) {
  return analyzeIntent(prompt);
}

/**
 * Get relevant memories for a prompt (intent-driven)
 * @param {string} prompt - User prompt
 * @param {object} [options] - Options
 * @returns {Promise<Array>} Relevant memories
 */
async function getRelevantMemories(prompt, options) {
  return contextualMemory.getRelevantMemoriesForPrompt(prompt, options);
}

// --- Re-export entity-extractor.cjs functions ---

/**
 * Extract entities from text
 * @param {string} text - Text to extract from
 * @returns {Promise<Array>} Extracted entities
 */
async function extractEntitiesFromText(text) {
  return extractEntities(text);
}

// --- Re-export memory-entity-links.cjs functions ---

/**
 * Link an entity to a memory reference
 * @param {string} entity - Entity name
 * @param {string} memoryRef - Memory reference
 * @returns {Promise<void>}
 */
async function linkEntity(entity, memoryRef) {
  return linkEntityToMemory(entity, memoryRef);
}

/**
 * Get all memory references linked to an entity
 * @param {string} entity - Entity name
 * @returns {Promise<Array>} Linked memory references
 */
async function getEntityLinks(entity) {
  return getLinkedMemories(entity);
}

/**
 * Unlink an entity from a memory reference
 * @param {string} entity - Entity name
 * @param {string} memoryRef - Memory reference
 * @returns {Promise<void>}
 */
async function unlinkEntity(entity, memoryRef) {
  return unlinkEntityFromMemory(entity, memoryRef);
}

// --- Re-export learnings-parser.cjs functions ---

/**
 * Parse learnings.md into structured sections
 * @param {string} markdownContent - Markdown content
 * @returns {Array} Parsed learning sections
 */
function parseLearningSections(markdownContent) {
  return parseLearnings(markdownContent);
}

/**
 * Find a learning by topic keyword
 * @param {string} topic - Topic keyword
 * @returns {object|null} Learning section or null
 */
function findLearning(topic) {
  return findLearningByTopic(topic);
}

/**
 * Get learnings by date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Array} Learnings in date range
 */
function getLearningsByDateRange(startDate, endDate) {
  return getLearningsByDate(startDate, endDate);
}

// --- Public API ---

module.exports = {
  // Search functions
  searchMemory,
  searchHot,
  searchWarm,
  searchCold,

  // Entity queries
  queryByEntity,
  getAllEntities,

  // Intent-driven retrieval
  analyzePromptIntent,
  getRelevantMemories,

  // Entity extraction
  extractEntitiesFromText,

  // Entity linking
  linkEntity,
  getEntityLinks,
  unlinkEntity,

  // Learnings parsing
  parseLearningSections,
  findLearning,
  getLearningsByDateRange,
};
