/**
 * Code Indexing System - Main Entry Point
 *
 * @module code-indexing
 * @see {@link .claude/docs/CODE_INDEXING_DESIGN.md}
 */

'use strict';

// Default to BM25-only mode to avoid async pipeline OOM
// Override with LANCEDB_EMBEDDING_MODE=hybrid for dense vectors
if (!process.env.LANCEDB_EMBEDDING_MODE) {
  process.env.LANCEDB_EMBEDDING_MODE = 'off';
}

const { CodeParser, LANGUAGE_GRAMMARS, EXTENSION_MAP } = require('./code-parser.cjs');
const { SemanticChunker, CHUNK_TYPES } = require('./semantic-chunker.cjs');
const { EmbeddingGenerator } = require('./embedding-generator.cjs');
const { VectorStore } = require('./vector-store.cjs');
const { IndexManager } = require('./index-manager.cjs');

module.exports = {
  CodeParser,
  LANGUAGE_GRAMMARS,
  EXTENSION_MAP,
  SemanticChunker,
  CHUNK_TYPES,
  EmbeddingGenerator,
  VectorStore,
  IndexManager,
};
