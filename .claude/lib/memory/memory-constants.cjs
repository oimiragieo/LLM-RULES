/**
 * Shared constants for the memory system.
 * Used for semantic search threshold consistency across callers.
 */

/** Default similarity threshold (0–1) for semantic memory search. Overridable via env MEMORY_SEMANTIC_SEARCH_THRESHOLD. */
const SEMANTIC_SEARCH_DEFAULT_THRESHOLD = Number(
  process.env.MEMORY_SEMANTIC_SEARCH_THRESHOLD || '0.72'
);

module.exports = {
  SEMANTIC_SEARCH_DEFAULT_THRESHOLD,
};
