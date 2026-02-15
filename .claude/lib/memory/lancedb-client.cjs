/**
 * LanceDB Client module entrypoint.
 *
 * Keeps a stable public API while delegating implementation to a helper module
 * so this file stays small and easy to navigate.
 */

const implementationPath = './lancedb-client-impl.cjs';

// Tests reload this module by deleting only this path from require.cache.
// Also clearing the implementation keeps reload behavior equivalent to the
// pre-refactor single-file module.
delete require.cache[require.resolve(implementationPath)];

const { MemoryVectorStore } = require(implementationPath);

module.exports = { MemoryVectorStore };
