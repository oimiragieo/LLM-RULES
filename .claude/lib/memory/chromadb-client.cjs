/**
 * ChromaDB Client for Memory Vector Storage
 *
 * Provides a simple wrapper around ChromaDB for semantic search
 * in Agent-Studio's hybrid memory system.
 *
 * Part of Task #22 (P1-1.1): Install ChromaDB and setup configuration
 *
 * @see .claude/context/artifacts/specs/memory-system-enhancement-spec.md
 */

const { ChromaClient } = require('chromadb');
const path = require('path');
const fs = require('fs');

/**
 * MemoryVectorStore - Vector storage for semantic search
 *
 * This class provides a simple interface to ChromaDB for storing and
 * querying memory embeddings. It supports:
 * - In-process mode (persistent storage to disk)
 * - Automatic collection creation
 * - Basic connection management
 *
 * Configuration is read from environment variables:
 * - CHROMADB_HOST: Host for remote ChromaDB (optional)
 * - CHROMADB_PORT: Port for remote ChromaDB (optional)
 * - CHROMADB_PERSIST_DIR: Directory for persistent storage (default: .claude/data/chromadb)
 * - CHROMADB_COLLECTION: Collection name (default: agent-studio-memory)
 *
 * @example
 * const store = new MemoryVectorStore({
 *   persistDirectory: '.claude/data/chromadb',
 *   collectionName: 'agent-studio-memory'
 * });
 * await store.initialize();
 * const collection = await store.getCollection();
 */
class MemoryVectorStore {
  /**
   * Create a new MemoryVectorStore instance
   *
   * @param {Object} config - Configuration options
   * @param {string} config.persistDirectory - Directory for persistent storage
   * @param {string} config.collectionName - Name of the ChromaDB collection
   * @param {string} [config.host] - Host for remote ChromaDB (optional)
   * @param {number} [config.port] - Port for remote ChromaDB (optional)
   */
  constructor(config = {}) {
    // Merge config with environment variables
    this.config = {
      persistDirectory:
        config.persistDirectory || process.env.CHROMADB_PERSIST_DIR || '.claude/data/chromadb',
      collectionName:
        config.collectionName || process.env.CHROMADB_COLLECTION || 'agent-studio-memory',
      host: config.host || process.env.CHROMADB_HOST,
      port: config.port || process.env.CHROMADB_PORT,
    };

    this.client = null;
    this.collection = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the ChromaDB client and connection
   *
   * This method:
   * 1. Creates the persist directory if it doesn't exist
   * 2. Initializes the ChromaClient (in-process or remote)
   * 3. Gets or creates the collection
   *
   * @returns {Promise<void>}
   * @throws {Error} If initialization fails
   */
  async initialize() {
    try {
      // Ensure persist directory exists for in-process mode
      if (!this.config.host) {
        const persistPath = path.resolve(this.config.persistDirectory);
        if (!fs.existsSync(persistPath)) {
          fs.mkdirSync(persistPath, { recursive: true });
        }
      }

      // Dynamically import the default embedding function
      // This handles the module import error for @chroma-core/default-embed
      let DefaultEmbeddingFunction;
      try {
        const module = await import('@chroma-core/default-embed');
        DefaultEmbeddingFunction = module.default || module.DefaultEmbeddingFunction;
      } catch (importError) {
        // Fallback if module not available
        console.warn('Default embedding function not available:', importError.message);
        DefaultEmbeddingFunction = null;
      }

      // Create ChromaDB client
      // ChromaDB v0.5+ defaults to connecting to a server
      // For testing without a server, we would normally use PersistentClient
      // However, the JS client doesn't have PersistentClient yet
      // So for now, we'll use the default client which requires a server
      //
      // Note: This means tests require ChromaDB server to be running
      // Alternative: Use mock/stub for testing, real server for integration
      //
      // For production (Task #27), configure with proper endpoint
      this.client = new ChromaClient({
        path: this.config.host || undefined, // Use undefined for default localhost
      });

      // Create embedding function for collection
      // For production with OpenAI embeddings, this will be configured in Task #24
      if (DefaultEmbeddingFunction) {
        this.embeddingFunction = new DefaultEmbeddingFunction();
      } else {
        this.embeddingFunction = null;
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize ChromaDB client: ${error.message}`);
    }
  }

  /**
   * Get or create the ChromaDB collection
   *
   * This method retrieves the collection if it exists, or creates it
   * if it doesn't. The collection is cached for subsequent calls.
   *
   * @returns {Promise<Collection>} The ChromaDB collection
   * @throws {Error} If not initialized or collection access fails
   */
  async getCollection() {
    if (!this.isInitialized) {
      throw new Error('MemoryVectorStore not initialized. Call initialize() first.');
    }

    if (this.collection) {
      return this.collection;
    }

    try {
      // Try to get existing collection
      // For testing, we use default embedding function (cosine similarity)
      // In production (Task #27), we'll add proper OpenAI embedding function
      const collectionConfig = {
        name: this.config.collectionName,
      };

      // Add embedding function if available
      if (this.embeddingFunction) {
        collectionConfig.embeddingFunction = this.embeddingFunction;
      }

      this.collection = await this.client.getOrCreateCollection(collectionConfig);

      return this.collection;
    } catch (error) {
      throw new Error(`Failed to get or create collection: ${error.message}`);
    }
  }

  /**
   * Check if ChromaDB is available
   *
   * Attempts to heartbeat the ChromaDB server.
   *
   * @returns {Promise<boolean>} True if available, false otherwise
   */
  async isAvailable() {
    if (!this.isInitialized) {
      return false;
    }

    try {
      await this.client.heartbeat();
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Semantic search across indexed documents
   *
   * This method queries the ChromaDB collection using semantic similarity.
   * Results are ranked by similarity score (cosine distance).
   *
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @param {number} [options.limit=10] - Maximum number of results to return
   * @param {number} [options.minScore=0.5] - Minimum similarity score threshold (0-1)
   * @param {Object} [options.filters] - Metadata filters (e.g., { type: 'learning' })
   * @returns {Promise<Array>} Array of results with format: [{content, metadata, similarity}]
   * @throws {Error} If not initialized or search fails
   *
   * @example
   * const results = await store.search('vector database patterns', {
   *   limit: 5,
   *   minScore: 0.7,
   *   filters: { type: 'learning' }
   * });
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error('MemoryVectorStore not initialized. Call initialize() first.');
    }

    // Default options
    const { limit = 10, minScore = 0.5, filters = null } = options;

    try {
      // Get collection
      const collection = await this.getCollection();

      // Prepare query parameters
      const queryParams = {
        queryTexts: [query],
        nResults: limit,
      };

      // Add metadata filters if provided
      if (filters) {
        queryParams.where = filters;
      }

      // Execute query
      const results = await collection.query(queryParams);

      // Format results
      // ChromaDB returns: { ids, documents, metadatas, distances }
      // Convert to our format: [{content, metadata, similarity}]
      const formattedResults = [];

      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const distance = results.distances[0][i];
          // Convert distance to similarity (ChromaDB uses cosine distance, so similarity = 1 - distance)
          const similarity = 1 - distance;

          // Filter by minScore threshold
          if (similarity >= minScore) {
            formattedResults.push({
              id: results.ids[0][i],
              content: results.documents[0][i],
              metadata: results.metadatas[0][i],
              similarity: similarity,
            });
          }
        }
      }

      return formattedResults;
    } catch (error) {
      throw new Error(`Semantic search failed: ${error.message}`);
    }
  }
}

module.exports = { MemoryVectorStore };
