/**
 * LanceDB Client module entrypoint.
 *
 * Keeps a stable public API while delegating implementation to a helper module
 * so this file stays small and easy to navigate.
 */

const implementationPath = './lancedb-client-impl.cjs';

// Optional reload mode for tests that explicitly require a fresh implementation.
if (process.env.LANCEDB_CLIENT_FORCE_RELOAD === 'true') {
  delete require.cache[require.resolve(implementationPath)];
}

const { MemoryVectorStore } = require(implementationPath);

module.exports = { MemoryVectorStore };
